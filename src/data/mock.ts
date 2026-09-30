/**
 * mock.ts —— 全站单一数据源
 * ---------------------------------------------------------------------------
 * 场景里所有「数量」与「指标」都由这里驱动：
 *   config.pv.cols / blockRows / rowsPerBlock / modulesPerRow  -> 光伏板总数
 *   config.battery.count / inverter.count / pcs.count ...      -> 各类设备台数
 *   config.vehicles.patrol / truck / loader                    -> 巡检/工程车数量
 * 换真实数据时，只需让后端返回同结构对象覆盖 config 与 devices 的指标即可。
 */

/* ------------------------------------------------------------------ 随机数 */
/** 确定性伪随机（mulberry32）——保证每次刷新布局与指标一致，便于比对 */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ 配置 */
export interface StationConfig {
  pv: {
    cols: number // 阵列区块列数
    blockRows: number // 阵列区块行数
    rowsPerBlock: number // 每个区块支架行数
    modulesPerRow: number // 每行组件数
    tiltDeg: number // 倾角
  }
  combiner: { count: number } // 汇流箱
  inverter: { count: number } // 逆变器
  battery: { count: number } // 储能电池柜
  pcs: { count: number } // PCS 变流器
  transformer: { count: number } // 主变压器
  tower: { count: number } // 输电铁塔
  parking: { spots: number; cars: number } // 停车场车位 / 停车数
  vehicles: { patrol: number; truck: number; loader: number }
  lamps: number
  trees: number
}

export const config: StationConfig = {
  pv: { cols: 3, blockRows: 2, rowsPerBlock: 7, modulesPerRow: 34, tiltDeg: 45 },
  combiner: { count: 12 },
  inverter: { count: 10 },
  battery: { count: 8 },
  pcs: { count: 4 },
  transformer: { count: 3 },
  tower: { count: 4 },
  parking: { spots: 18, cars: 11 },
  vehicles: { patrol: 4, truck: 2, loader: 1 },
  lamps: 44,
  trees: 172
}

/** 光伏板总装机（由 config 推导，改配置即改数量） */
export const pvModuleCount =
  config.pv.cols * config.pv.blockRows * config.pv.rowsPerBlock * config.pv.modulesPerRow

/* ------------------------------------------------------------------ 设备 */
export type DeviceKind =
  | 'pv'
  | 'combiner'
  | 'inverter'
  | 'battery'
  | 'pcs'
  | 'ems'
  | 'transformer'
  | 'tower'
  | 'om'
  | 'gate'
  | 'parking'
  | 'road'
  | 'vehicle'

export type DeviceStatus = '运行' | '待机' | '告警' | '检修'

export interface Metric {
  label: string
  value: string
  unit?: string
  /** 用于右侧浮层着色：good 绿 / warn 橙 / bad 红 / plain 常规 */
  tone?: 'good' | 'warn' | 'bad' | 'plain'
}

export interface Device {
  id: string
  /** 分组名，如「光伏阵列区」「储能系统」 */
  group: string
  name: string
  kind: DeviceKind
  status: DeviceStatus
  /** 世界坐标，用于相机聚焦与标签锚点 */
  position: [number, number, number]
  /** 聚焦时相机相对偏移半径 */
  focusDist: number
  metrics: Metric[]
  /** 一句话说明，显示在右浮层顶部 */
  desc: string
}

export const devices: Device[] = []
const deviceIndex = new Map<string, Device>()

export function registerDevice(d: Device): Device {
  devices.push(d)
  deviceIndex.set(d.id, d)
  return d
}
export function getDevice(id: string): Device | undefined {
  return deviceIndex.get(id)
}

/* ------------------------------------------------------- 指标生成（假数据） */
const rngMetrics = makeRng(20260930)

function n1(v: number) {
  return v.toFixed(1)
}
function n0(v: number) {
  return v.toFixed(0)
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rngMetrics() * arr.length)]
}
function statusOf(soc: number, temp: number, roll: number): DeviceStatus {
  if (roll > 0.955) return '告警'
  if (roll > 0.9) return '检修'
  if (soc > 0.98 && temp < 26) return '待机'
  return '运行'
}

/** 光伏阵列区块指标 */
export function pvMetrics(modules: number, seed: number): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const dcV = 620 + r() * 90
  const dcI = modules * 0.52 * (0.72 + r() * 0.34)
  const kw = (dcV * dcI) / 1000
  const temp = 29 + r() * 16
  const eff = 20.2 + r() * 2.4
  const roll = r()
  return {
    status: statusOf(0.6, temp, roll),
    metrics: [
      { label: '直流电压', value: n1(dcV), unit: 'V' },
      { label: '直流电流', value: n1(dcI), unit: 'A' },
      { label: '实时功率', value: n1(kw), unit: 'kW', tone: 'good' },
      { label: '组件温度', value: n1(temp), unit: '℃', tone: temp > 42 ? 'warn' : 'plain' },
      { label: '转换效率', value: n1(eff), unit: '%', tone: 'good' },
      { label: '今日发电', value: n1(kw * 5.4), unit: 'kWh' }
    ]
  }
}

/** 汇流箱指标 */
export function combinerMetrics(strings: number, seed: number): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const dcV = 610 + r() * 80
  const dcI = strings * 9.4 * (0.75 + r() * 0.3)
  const temp = 32 + r() * 14
  return {
    status: statusOf(0.7, temp, r()),
    metrics: [
      { label: '输入路数', value: n0(strings), unit: '路' },
      { label: '直流电压', value: n1(dcV), unit: 'V' },
      { label: '直流电流', value: n1(dcI), unit: 'A' },
      { label: '直流功率', value: n1((dcV * dcI) / 1000), unit: 'kW', tone: 'good' },
      { label: '箱体温度', value: n1(temp), unit: '℃', tone: temp > 43 ? 'warn' : 'plain' },
      { label: '绝缘阻抗', value: n1(1.8 + r() * 1.6), unit: 'MΩ' }
    ]
  }
}

/** 逆变器指标 */
export function inverterMetrics(kva: number, seed: number): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const load = 0.62 + r() * 0.32
  const dcV = 640 + r() * 80
  const acV = 400 * (0.985 + r() * 0.03)
  const acI = (kva * load * 1000) / (1.732 * acV)
  const eff = 98.2 + r() * 0.9
  const temp = 34 + r() * 16
  return {
    status: statusOf(0.75, temp, r()),
    metrics: [
      { label: '交流电压', value: n1(acV), unit: 'V' },
      { label: '交流电流', value: n1(acI), unit: 'A' },
      { label: '有功功率', value: n1(kva * load), unit: 'kW', tone: 'good' },
      { label: '直流电压', value: n1(dcV), unit: 'V' },
      { label: '负载率', value: n1(load * 100), unit: '%', tone: load > 0.9 ? 'warn' : 'good' },
      { label: '转换效率', value: n1(eff), unit: '%', tone: 'good' },
      { label: '模块温度', value: n1(temp), unit: '℃', tone: temp > 45 ? 'warn' : 'plain' }
    ]
  }
}

/** 储能电池柜指标 */
export function batteryMetrics(cap: number, seed: number): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const soc = 42 + r() * 55
  const dcV = 1180 + r() * 120
  const dcI = (r() > 0.45 ? 1 : -1) * (60 + r() * 110)
  const temp = 22 + r() * 12
  const soh = 96 + r() * 3.6
  const roll = r()
  const status = soc < 15 ? '告警' : statusOf(soc, temp, roll)
  return {
    status,
    metrics: [
      { label: 'SOC', value: n1(soc), unit: '%', tone: soc < 20 ? 'bad' : 'good' },
      { label: 'SOH', value: n1(soh), unit: '%', tone: 'good' },
      { label: '直流电压', value: n0(dcV), unit: 'V' },
      { label: '充放电电流', value: n1(Math.abs(dcI)), unit: 'A', tone: dcI >= 0 ? 'good' : 'warn' },
      { label: '实时功率', value: n1((dcV * Math.abs(dcI)) / 1000), unit: 'kW' },
      { label: '电池温度', value: n1(temp), unit: '℃', tone: temp > 32 ? 'warn' : 'plain' },
      { label: '额定容量', value: n1(cap), unit: 'MWh' }
    ]
  }
}

/** PCS 变流器指标 */
export function pcsMetrics(kw: number, seed: number): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const load = 0.45 + r() * 0.45
  const acV = 400 * (0.99 + r() * 0.02)
  const acI = (kw * load * 1000) / (1.732 * acV)
  const temp = 30 + r() * 14
  return {
    status: statusOf(0.8, temp, r()),
    metrics: [
      { label: '交流电压', value: n1(acV), unit: 'V' },
      { label: '交流电流', value: n1(acI), unit: 'A' },
      { label: '有功功率', value: n1(kw * load), unit: 'kW', tone: 'good' },
      { label: '无功功率', value: n1((r() - 0.5) * 120), unit: 'kVar' },
      { label: '功率因数', value: n1(0.97 + r() * 0.03), unit: '', tone: 'good' },
      { label: '模块温度', value: n1(temp), unit: '℃', tone: temp > 42 ? 'warn' : 'plain' }
    ]
  }
}

/** 主变 / 升压站指标 */
export function transformerMetrics(mva: number, seed: number): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const load = 0.5 + r() * 0.4
  const hvV = 110 * (0.99 + r() * 0.02)
  const hvI = (mva * load * 1000) / (1.732 * hvV)
  const lvV = 35 * (0.99 + r() * 0.02)
  const temp = 42 + r() * 22
  return {
    status: statusOf(0.85, temp, r()),
    metrics: [
      { label: '高压侧电压', value: n1(hvV), unit: 'kV' },
      { label: '高压侧电流', value: n1(hvI), unit: 'A', tone: 'good' },
      { label: '低压侧电压', value: n1(lvV), unit: 'kV' },
      { label: '有功功率', value: n1(mva * load), unit: 'MW', tone: 'good' },
      { label: '负载率', value: n1(load * 100), unit: '%', tone: load > 0.85 ? 'warn' : 'good' },
      { label: '油温', value: n1(temp), unit: '℃', tone: temp > 58 ? 'warn' : 'plain' },
      { label: '额定容量', value: n1(mva), unit: 'MVA' }
    ]
  }
}

/** 通用设施指标（楼宇 / 停车场 / 门禁 / 道路） */
export function facilityMetrics(
  seed: number,
  kind: 'ems' | 'om' | 'gate' | 'parking' | 'road' | 'tower'
): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  const m: Record<string, Metric[]> = {
    ems: [
      { label: '在线设备', value: n0(48 + r() * 12), unit: '台', tone: 'good' },
      { label: '通信状态', value: pick(['正常', '正常', '正常', '抖动']), tone: 'good' },
      { label: '全站功率', value: n1(18 + r() * 12), unit: 'MW', tone: 'good' },
      { label: '今日发电量', value: n1(96 + r() * 40), unit: 'MWh' },
      { label: '系统效率', value: n1(85 + r() * 6), unit: '%', tone: 'good' },
      { label: '机房温度', value: n1(21 + r() * 6), unit: '℃' }
    ],
    om: [
      { label: '在岗人员', value: n0(6 + r() * 8), unit: '人' },
      { label: '待处理工单', value: n0(r() * 4), unit: '单', tone: r() > 0.6 ? 'warn' : 'plain' },
      { label: '备件库存', value: n0(60 + r() * 40), unit: '%' },
      { label: '巡检覆盖率', value: n1(88 + r() * 11), unit: '%', tone: 'good' }
    ],
    gate: [
      { label: '今日入场', value: n0(12 + r() * 30), unit: '车次' },
      { label: '道闸状态', value: '落杆', tone: 'good' },
      { label: '门禁在线', value: '是', tone: 'good' },
      { label: '视频通道', value: n0(16), unit: '路', tone: 'good' }
    ],
    parking: [
      { label: '车位总数', value: n0(config.parking.spots), unit: '个' },
      { label: '已占用', value: n0(config.parking.cars), unit: '个' },
      {
        label: '占用率',
        value: n1((config.parking.cars / config.parking.spots) * 100),
        unit: '%',
        tone: 'plain'
      },
      { label: '充电车位', value: n0(4), unit: '个', tone: 'good' }
    ],
    road: [
      { label: '道路总长', value: n1(1.8 + r() * 0.6), unit: 'km' },
      { label: '路面状态', value: '良好', tone: 'good' },
      { label: '照明回路', value: n0(3), unit: '路' },
      { label: '在线路灯', value: n0(config.lamps), unit: '盏', tone: 'good' }
    ],
    tower: [
      { label: '线路电压', value: '110', unit: 'kV' },
      { label: '输送功率', value: n1(16 + r() * 10), unit: 'MW', tone: 'good' },
      { label: '导线温度', value: n1(34 + r() * 12), unit: '℃' },
      { label: '运行状态', value: '在线', tone: 'good' }
    ]
  }
  return { status: '运行', metrics: m[kind] }
}

/** 巡检车指标 */
export function vehicleMetrics(seed: number, isTruck = false): { status: DeviceStatus; metrics: Metric[] } {
  const r = makeRng(seed)
  if (isTruck) {
    return {
      status: '运行',
      metrics: [
        { label: '车速', value: n1(12 + r() * 14), unit: 'km/h' },
        { label: '载重', value: n1(2 + r() * 6), unit: 't' },
        { label: '任务', value: pick(['组件转运', '备件配送', '物资补给']) },
        { label: '剩余油量', value: n0(40 + r() * 55), unit: '%', tone: 'good' }
      ]
    }
  }
  return {
    status: '运行',
    metrics: [
      { label: '车速', value: n1(8 + r() * 16), unit: 'km/h' },
      { label: '电池 SOC', value: n1(58 + r() * 40), unit: '%', tone: 'good' },
      { label: '当前任务', value: pick(['区段巡检', '红外测温', '组件清洁']) },
      { label: '今日里程', value: n1(3 + r() * 9), unit: 'km' },
      { label: '车载终端', value: '在线', tone: 'good' }
    ]
  }
}

/* -------------------------------------------------------- 实时指标抖动 */
/**
 * 让指标「活」起来：每次 tick 对数值做小幅漂移，模拟真实遥测。
 * 真实项目里把这里换成 WebSocket / 轮询即可。
 */
export function tickMetrics(t: number) {
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i]
    const phase = i * 1.7 + t * 0.6
    const wob = Math.sin(phase) * 0.012 + Math.sin(phase * 2.3) * 0.006
    for (const m of d.metrics) {
      // 仅抖动纯数值型指标（排除「运行/正常/在线」这类文本）
      if (!/^-?\d+(\.\d+)?$/.test(m.value)) continue
      const v = parseFloat(m.value)
      if (!isFinite(v) || v === 0) continue
      const decimals = m.value.includes('.') ? m.value.split('.')[1].length : 0
      m.value = (v * (1 + wob)).toFixed(decimals)
    }
  }
}

/* ------------------------------------------------ 全站汇总（左浮层用） */
export function stationSummary(t: number) {
  const wob = 0.5 + Math.sin(t * 0.35) * 0.5
  const kwh = 18.6 + wob * 3.2
  return {
    capacity: (pvModuleCount * 0.585) / 1000, // MWp（按 585Wp 组件估算）
    power: kwh, // MW
    today: 112 + wob * 16, // MWh
    online: devices.filter((d) => d.status === '运行').length,
    total: devices.length
  }
}
