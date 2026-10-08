/**
 * layout.ts —— 全站平面布局（世界坐标，单位：米）
 * ---------------------------------------------------------------------------
 * 坐标约定：X 向东（画面右），Z 向南（画面近处 / 朝向观察者），Y 向上。
 * 参考 /assets.png 的轴测构图：
 *   西北（左后）＝光伏阵列区 → 汇流箱 → 逆变器 → 储能区 → 升压站 → 铁塔（东）
 *   南侧（前景）＝运维楼 / 综合楼 / 停车场 / 主出入口 / 市政道路
 */
import { config } from '../data/mock'

/* --------------------------------------------------------------- 场地边界 */
export const SITE = {
  minX: -176,
  maxX: 196,
  minZ: -140,
  maxZ: 116
}
export const SITE_W = SITE.maxX - SITE.minX
export const SITE_D = SITE.maxZ - SITE.minZ
export const SITE_CX = (SITE.minX + SITE.maxX) / 2
export const SITE_CZ = (SITE.minZ + SITE.maxZ) / 2

/**
 * 微缩底盘尺寸 —— **所有需要"贴着底盘边缘"布置的图层（草地色块、外围林带、
 * 边缘装饰）都必须从这里反推**，不要各自从 SITE 外扩。否则一旦底盘尺寸变化，
 * 这些图层就会飘到草地之外压到天空上。
 */
export const PLATE = {
  /** 基层草地 */
  w: SITE_W + 100,
  d: SITE_D + 100,
  /** 外圈暗绿切边（比基层外扩 6m，形成"微缩底座"的切边感） */
  rimW: SITE_W + 112,
  rimD: SITE_D + 112,
  /** 基层草地的世界包围盒（无厚度平面，位于 y = 0） */
  get minX() {
    return SITE_CX - this.w / 2
  },
  get maxX() {
    return SITE_CX + this.w / 2
  },
  get minZ() {
    return SITE_CZ - this.d / 2
  },
  get maxZ() {
    return SITE_CZ + this.d / 2
  }
}

/* --------------------------------------------------------------- 光伏阵列 */
export const PV = {
  blockW: 44, // 单个区块宽（X）
  blockD: 38, // 单个区块深（Z）
  gapX: 8, // 区块间南北向检修道宽
  gapZ: 7, // 区块间东西向检修道宽
  originX: -164, // 第一列区块西边界
  originZ: -124, // 第一行区块北边界
  rowPitch: 4.5, // 支架行距
  rowInset: 3.5, // 首行距区块边界
  moduleW: 1.13, // 组件宽
  modulePitch: 1.22, // 组件中心距
  moduleL: 2.32, // 组件沿斜面长度
  moduleT: 0.05, // 组件厚度
  frameW: 0.07, // 边框宽
  lowEdge: 0.74, // 组件下沿离地高度
  legSize: 0.14,
  tubeR: 0.075
}

/** 第 (col,row) 个光伏区块的最小角坐标 */
export function pvBlockOrigin(col: number, row: number): [number, number] {
  return [PV.originX + col * (PV.blockW + PV.gapX), PV.originZ + row * (PV.blockD + PV.gapZ)]
}
export function pvBlockCenter(col: number, row: number): [number, number] {
  const [x, z] = pvBlockOrigin(col, row)
  return [x + PV.blockW / 2, z + PV.blockD / 2]
}
export const PV_BLOCK_COLS = config.pv.cols
export const PV_BLOCK_ROWS = config.pv.blockRows

/** 光伏区整体包围盒 */
export const PV_AREA = {
  minX: PV.originX,
  maxX: PV.originX + (PV_BLOCK_COLS - 1) * (PV.blockW + PV.gapX) + PV.blockW,
  minZ: PV.originZ,
  maxZ: PV.originZ + (PV_BLOCK_ROWS - 1) * (PV.blockD + PV.gapZ) + PV.blockD
}

/* --------------------------------------------------------------- 电气设备 */
/** 汇流箱：紧贴光伏区东侧，沿南北一字排开 */
export const COMBINER = {
  x: PV_AREA.maxX + 10,
  zStart: PV_AREA.minZ + 4,
  zPitch: 6.2
}

/** 逆变器：汇流箱以东，2 行 × 5 列集装箱 */
export const INVERTER = {
  x0: COMBINER.x + 8,
  z0: PV_AREA.minZ + 12,
  colPitch: 7.6,
  rowPitch: 11,
  cols: 5
}

/** 储能电池柜区：4 列 × 2 行大白柜 */
export const BATTERY = {
  x0: COMBINER.x + 10,
  z0: PV_AREA.maxZ - 36,
  colPitch: 13,
  rowPitch: 14,
  cols: 4,
  w: 11,
  d: 3.2,
  h: 3.1
}

/** PCS 变流器：储能区南侧 */
export const PCS = {
  x0: COMBINER.x + 14,
  z0: PV_AREA.maxZ - 12,
  pitch: 10,
  w: 3.6,
  d: 3.0,
  h: 3.2
}

/* --------------------------------------------------------------- 建筑 */
export const EMS = { x: 12, z: -24, w: 26, d: 15, h: 8.6 } // EMS 控制中心
export const OM = { x: -92, z: -6, w: 46, d: 16, h: 7.4 } // 运维楼
export const ADMIN = { x: -30, z: -4, w: 28, d: 14, h: 9.4 } // 综合楼
export const WAREHOUSE = { x: -144, z: -8, w: 16, d: 11, h: 5.4 } // 备品库
export const TOOLHOUSE = { x: -154, z: 22, w: 11, d: 8, h: 4.2 } // 工具间
export const GATE = { x: 74, z: 82 } // 主出入口（位于南侧围墙）

/** 站区围墙（南侧在门禁处断开） */
export const SITE_FENCE = {
  minX: -170,
  maxX: 190,
  minZ: -134,
  maxZ: 84,
  gapX: [64, 86] as [number, number]
}

/* --------------------------------------------------------------- 升压站 */
export const SUB = {
  minX: 74,
  maxX: 150,
  minZ: -110,
  maxZ: -28,
  gis: { x: 92, z: -46, w: 20, d: 13, h: 8 }, // 升压站控制楼
  tfX: 126, // 主变中心 X
  tfZ: [-42, -64, -86], // 主变中心 Z
  gantryZ: -102 // 门型构架
}

/** 铁塔：沿场地东缘由南向北出线 */
export const TOWER = {
  x: 178,
  z: 40,
  dz: -48,
  h: 40
}

/* --------------------------------------------------------------- 道路 */
export interface RoadRect {
  x: number
  z: number
  w: number
  d: number
  /** 是否画中心虚线 */
  dash?: boolean
  /** 是否画橙色路缘线（SASAKI 图里的暖色边线） */
  edge?: boolean
  level?: number
}

export const MAIN_ROAD_W = 13
export const roads: RoadRect[] = [
  // 厂前市政主干道（贯穿东西）——中心 z = 127（与 buildings.ts 路灯、车辆环线南段保持一致）
  { x: SITE_CX, z: 127, w: SITE_W + 34, d: MAIN_ROAD_W, dash: true, edge: true },
  // 厂区东西向主干道：光伏区以南，止于东环
  { x: -53, z: -44, w: 232, d: 9, dash: true, edge: true },
  // 光伏区区块间南北向检修道路
  ...Array.from({ length: PV_BLOCK_COLS - 1 }, (_, i) => ({
    x: PV.originX + PV.blockW + PV.gapX / 2 + i * (PV.blockW + PV.gapX),
    z: (PV_AREA.minZ + PV_AREA.maxZ) / 2,
    w: 6,
    d: PV_AREA.maxZ - PV_AREA.minZ + 10
  })),
  // 光伏区区块间东西向检修道路
  ...Array.from({ length: PV_BLOCK_ROWS - 1 }, (_, i) => ({
    x: (PV_AREA.minX + PV_AREA.maxX) / 2,
    z: PV.originZ + PV.blockD + PV.gapZ / 2 + i * (PV.blockD + PV.gapZ),
    w: PV_AREA.maxX - PV_AREA.minX + 6,
    d: 6
  })),
  // 光伏区西 / 北 / 东环路
  { x: PV.originX - 7, z: (PV_AREA.minZ + PV_AREA.maxZ) / 2, w: 6, d: PV_AREA.maxZ - PV_AREA.minZ + 6 },
  { x: (PV_AREA.minX + PV_AREA.maxX) / 2, z: PV_AREA.minZ - 6, w: PV_AREA.maxX - PV_AREA.minX + 24, d: 6 },
  { x: PV_AREA.maxX + 1, z: (PV_AREA.minZ + PV_AREA.maxZ) / 2, w: 6, d: PV_AREA.maxZ - PV_AREA.minZ + 12 },
  // 厂区西环 / 东环（东环向南延长，接上新市政主干道）
  { x: -172, z: -8, w: 7.5, d: 258, dash: true },
  { x: 62, z: 20, w: 8, d: 196, dash: true },
  // 设备区南北向连接路（把逆变器 / 储能 / PCS 串到主干道）
  { x: 53, z: -78, w: 8, d: 74 },
  // 储能区北侧通道
  { x: 30, z: -89, w: 56, d: 7 },
  // 升压站进出路
  { x: 116, z: -3, w: 108, d: 9, dash: true, edge: true },
  // 厂前区东西向路（运维楼—综合楼—停车场—大门）
  { x: 0, z: 34, w: 200, d: 8, dash: true },
  // 大门引道（向南延长，接上新市政主干道；北端与停车场保持间距）
  { x: 74, z: 92, w: 11, d: 52 },
  // 停车场内部通道
  { x: 98, z: 70, w: 50, d: 6 },
  // 运维楼前广场引道
  { x: -92, z: 16, w: 44, d: 7 }
]

/* --------------------------------------------------------------- 停车场 */
export const PARKING = { x: 98, z: 52, w: 44, d: 30, cols: 9 }
export const OM_PARKING = { x: -92, z: 18, w: 44, d: 16, cols: 9 }

/* --------------------------------------------------------------- 标签锚点 */
export interface LabelAnchor {
  text: string
  x: number
  y: number
  z: number
}

export const labelAnchors: LabelAnchor[] = [
  { text: '光伏阵列区', x: PV_AREA.minX + 52, y: 7, z: PV_AREA.minZ + 44 },
  { text: '汇流箱', x: COMBINER.x + 1, y: 4, z: COMBINER.zStart + 4 },
  { text: '逆变器', x: INVERTER.x0 + 16, y: 5.6, z: INVERTER.z0 + 13 },
  { text: '储能电池柜区', x: BATTERY.x0 + 24, y: 5.8, z: BATTERY.z0 - 1 },
  { text: 'PCS 变流器', x: PCS.x0 + 18, y: 5.6, z: PCS.z0 - 2 },
  { text: 'EMS 控制中心', x: EMS.x, y: 12, z: EMS.z + 2 },
  { text: '升压变电站', x: SUB.tfX, y: 17, z: SUB.minZ + 52 },
  { text: '高压输电线路', x: TOWER.x + 6, y: 42, z: TOWER.z - 6 },
  { text: '运维楼', x: OM.x, y: 10.4, z: OM.z },
  { text: '停车场', x: PARKING.x, y: 4, z: PARKING.z },
  { text: '主出入口', x: GATE.x, y: 6.5, z: GATE.z + 2 },
  { text: '运维道路', x: -18, y: 2.4, z: -44 }
]
