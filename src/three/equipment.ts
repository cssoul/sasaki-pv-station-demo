/**
 * equipment.ts —— 电气设备
 * 汇流箱 / 逆变器 / 储能电池柜 / PCS / 主变压器 / 门型构架 / 输电铁塔
 * 全部为程序化几何：集装箱 = 箱体 + 门 + 百叶 + 顶置空调；主变 = 油箱 + 散热片 + 套管；
 * 铁塔 = 锥形桁架 + 三层横担 + 绝缘子串。
 */
import * as THREE from 'three'
import { M, track } from './materials'
import { C } from './palette'
import { COMBINER, INVERTER, BATTERY, PCS, SUB, TOWER } from './layout'
import { merge, strut, setInstances } from './utils'
import { makeBuilding } from './buildings'
import {
  config,
  registerDevice,
  combinerMetrics,
  inverterMetrics,
  batteryMetrics,
  pcsMetrics,
  transformerMetrics,
  facilityMetrics
} from '../data/mock'

type Geo = THREE.BufferGeometry
interface Bucket {
  light: Geo[]
  dark: Geo[]
  accent: Geo[]
  glass: Geo[]
}

function newBucket(): Bucket {
  return { light: [], dark: [], accent: [], glass: [] }
}

function add(arr: Geo[], w: number, h: number, d: number, x: number, y: number, z: number, rot?: { x?: number; y?: number; z?: number }) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rot) {
    if (rot.x) g.rotateX(rot.x)
    if (rot.y) g.rotateY(rot.y)
    if (rot.z) g.rotateZ(rot.z)
  }
  g.translate(x, y, z)
  arr.push(g)
}

function commit(parent: THREE.Object3D, b: Bucket, name: string) {
  const pairs: [Geo[], THREE.Material][] = [
    [b.light, M.container],
    [b.dark, M.grille],
    [b.accent, M.doorBlue],
    [b.glass, M.band]
  ]
  for (const [geos, mat] of pairs) {
    if (!geos.length) continue
    const m = new THREE.Mesh(merge(geos), mat)
    m.castShadow = true
    m.receiveShadow = true
    m.name = name
    parent.add(m)
  }
}

/* --------------------------------------------------------- 集装箱通用件 */
/** 在 ±X / ±Z 面加百叶（散热格栅） */
function addLouvres(arr: Geo[], cx: number, cy: number, cz: number, w: number, h: number, d: number, n = 5) {
  for (let i = 0; i < n; i++) {
    const y = cy - h / 2 + 0.14 + (i * (h - 0.28)) / Math.max(1, n - 1)
    add(arr, 0.05, 0.075, d * 0.42, cx + w / 2 + 0.02, y, cz)
    add(arr, 0.05, 0.075, d * 0.42, cx - w / 2 - 0.02, y, cz)
  }
}

/** 集装箱顶置空调机组 */
function addHvac(light: Geo[], dark: Geo[], x: number, y: number, z: number, w = 1.3) {
  add(dark, w, 0.36, 1.15, x, y, z)
  add(light, w * 0.86, 0.1, 0.9, x, y + 0.2, z)
}

/* --------------------------------------------------------------- 汇流箱 */
function buildCombiners(root: THREE.Object3D) {
  const n = config.combiner.count
  for (let i = 0; i < n; i++) {
    const z = COMBINER.zStart + i * COMBINER.zPitch
    const x = COMBINER.x
    const g = new THREE.Group()
    g.name = `combiner-${i + 1}`
    g.position.set(x, 0, z)
    root.add(g)
    const b = newBucket()
    const light: Geo[] = []
    const dark: Geo[] = []
    const accent: Geo[] = []
    // 基础 + 支架
    add(dark, 1.9, 0.26, 1.35, 0, 0.13, 0)
    add(light, 1.55, 1.52, 1.0, 0, 1.16, 0)
    // 顶盖（微挑）
    add(light, 1.75, 0.1, 1.2, 0, 1.96, 0)
    // 柜门缝 + 门把手
    add(dark, 0.04, 1.32, 0.03, 0, 1.16, 0.51)
    add(dark, 0.12, 0.05, 0.06, 0.12, 1.16, 0.52)
    // 指示灯
    add(accent, 0.1, 0.1, 0.04, 0.5, 1.7, 0.52)
    // 进出线管
    const t1 = new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6)
    t1.translate(-0.55, 0.45, 0)
    dark.push(t1)
    const t2 = new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6)
    t2.translate(0.55, 0.45, 0)
    dark.push(t2)
    b.light = [merge(light)]
    b.dark = [merge(dark)]
    b.accent = [merge(accent)]
    commit(g, b, `combiner-${i + 1}`)
    g.userData.deviceId = `cb-${i + 1}`

    const seed = 3000 + i * 53
    const { status, metrics } = combinerMetrics(12, seed)
    registerDevice({
      id: `cb-${i + 1}`,
      group: '汇流箱',
      name: `汇流箱 #${String(i + 1).padStart(2, '0')}`,
      kind: 'combiner',
      status,
      position: [x, 3.2, z],
      focusDist: 22,
      desc: `汇集 ${12} 路组串直流输入，配置防反二极管、直流断路器与组串级监测。`,
      metrics
    })
  }
}

/* --------------------------------------------------------------- 逆变器 */
function buildInverters(root: THREE.Object3D) {
  const n = config.inverter.count
  const rows = Math.ceil(n / INVERTER.cols)
  for (let i = 0; i < n; i++) {
    const col = i % INVERTER.cols
    const row = Math.floor(i / INVERTER.cols)
    const x = INVERTER.x0 + col * INVERTER.colPitch
    const z = INVERTER.z0 + row * INVERTER.rowPitch
    const g = new THREE.Group()
    g.name = `inverter-${i + 1}`
    g.position.set(x, 0, z)
    root.add(g)

    const light: Geo[] = []
    const dark: Geo[] = []
    const accent: Geo[] = []
    // 混凝土基础平台
    add(dark, 6.6, 0.3, 4.0, 0, 0.15, 0)
    // 箱体
    add(light, 5.6, 2.75, 2.6, 0, 0.3 + 1.375, 0)
    // 顶盖
    add(light, 5.75, 0.14, 2.75, 0, 3.12, 0)
    // 底架
    add(dark, 5.7, 0.16, 2.66, 0, 0.38, 0)
    // 双开门
    add(accent, 1.35, 2.1, 0.06, -1.0, 1.68, 1.33)
    add(accent, 1.35, 2.1, 0.06, 1.0, 1.68, 1.33)
    // 竖向分缝
    for (let k = -2; k <= 2; k++) add(dark, 0.035, 2.5, 0.03, k * 1.15, 1.68, 1.33)
    // 侧面百叶
    addLouvres(dark, 0, 1.8, 0, 5.6, 1.6, 2.6, 6)
    // 顶部空调
    addHvac(light, dark, 0, 3.36, -0.35, 1.5)
    // 底部电缆沟 + 桥架
    add(dark, 5.0, 0.18, 0.5, 0, 0.3, 1.9)

    commit(g, { light: [merge(light)], dark: [merge(dark)], accent: [merge(accent)], glass: [] }, `inv-${i + 1}`)
    g.userData.deviceId = `inv-${i + 1}`

    const kva = 320
    const { status, metrics } = inverterMetrics(kva, 4000 + i * 71)
    registerDevice({
      id: `inv-${i + 1}`,
      group: '逆变器',
      name: `组串式逆变器 INV-${String(i + 1).padStart(2, '0')}`,
      kind: 'inverter',
      status,
      position: [x, 4.4, z],
      focusDist: 24,
      desc: `额定 ${kva} kW，DC/AC 转换效率 ≥98.6%，具备 MPPT、组串监测与防孤岛保护。`,
      metrics
    })
  }
}

/* ----------------------------------------------------------- 储能电池柜 */
function buildBatteries(root: THREE.Object3D) {
  const n = config.battery.count
  const rows = Math.ceil(n / BATTERY.cols)
  for (let i = 0; i < n; i++) {
    const col = i % BATTERY.cols
    const row = Math.floor(i / BATTERY.cols)
    const x = BATTERY.x0 + col * BATTERY.colPitch
    const z = BATTERY.z0 + row * BATTERY.rowPitch
    const W = BATTERY.w
    const D = BATTERY.d
    const H = BATTERY.h

    const g = new THREE.Group()
    g.name = `battery-${i + 1}`
    g.position.set(x, 0, z)
    root.add(g)

    const light: Geo[] = []
    const dark: Geo[] = []
    const accent: Geo[] = []
    // 基础
    add(dark, W + 1.6, 0.3, D + 1.6, 0, 0.15, 0)
    // 柜体
    add(light, W, H, D, 0, 0.3 + H / 2, 0)
    // 顶板 + 女儿沿
    add(light, W + 0.16, 0.16, D + 0.16, 0, 0.3 + H + 0.08, 0)
    // 底架
    add(dark, W + 0.06, 0.18, D + 0.06, 0, 0.39, 0)
    // 四扇门（南立面）
    for (let k = 0; k < 4; k++) {
      const dx = -W / 2 + W / 8 + k * (W / 4)
      add(accent, W / 4 - 0.24, H - 0.85, 0.07, dx, 0.3 + H / 2 + 0.05, D / 2 + 0.02)
      add(dark, 0.05, H - 0.6, 0.03, -W / 2 + k * (W / 4) + 0.02, 0.3 + H / 2, D / 2 + 0.04)
    }
    // 侧面百叶 + 泄压口
    addLouvres(dark, 0, 0.3 + H / 2, 0, W, H - 0.5, D, 7)
    // 顶部空调 ×2 + 消防管路
    addHvac(light, dark, -W / 4, 0.3 + H + 0.32, 0, 1.7)
    addHvac(light, dark, W / 4, 0.3 + H + 0.32, 0, 1.7)
    const pipe = new THREE.CylinderGeometry(0.07, 0.07, W - 0.6, 8)
    pipe.rotateZ(Math.PI / 2)
    pipe.translate(0, 0.3 + H + 0.2, D / 2 - 0.45)
    dark.push(pipe)
    // 直流汇流柜（侧面小柜）
    add(dark, 0.9, 1.4, 0.9, W / 2 + 0.5, 1.0, -D / 4)

    commit(g, { light: [merge(light)], dark: [merge(dark)], accent: [merge(accent)], glass: [] }, `bat-${i + 1}`)
    g.userData.deviceId = `bat-${i + 1}`

    const cap = 2.5
    const { status, metrics } = batteryMetrics(cap, 5000 + i * 37)
    registerDevice({
      id: `bat-${i + 1}`,
      group: '储能系统',
      name: `储能电池柜 BAT-${String(i + 1).padStart(2, '0')}`,
      kind: 'battery',
      status,
      position: [x, 5.4, z],
      focusDist: 26,
      desc: `磷酸铁锂液冷电池柜，额定容量 ${cap} MWh，支持 ±0.5C 充放电与 pack 级均衡。`,
      metrics
    })
  }
}

/* ---------------------------------------------------------------- PCS */
function buildPcs(root: THREE.Object3D) {
  const n = config.pcs.count
  for (let i = 0; i < n; i++) {
    const x = PCS.x0 + i * PCS.pitch
    const z = PCS.z0
    const g = new THREE.Group()
    g.name = `pcs-${i + 1}`
    g.position.set(x, 0, z)
    root.add(g)

    const light: Geo[] = []
    const dark: Geo[] = []
    const accent: Geo[] = []
    add(dark, PCS.w + 1.4, 0.3, PCS.d + 1.4, 0, 0.15, 0)
    add(light, PCS.w, PCS.h, PCS.d, 0, 0.3 + PCS.h / 2, 0)
    add(light, PCS.w + 0.14, 0.14, PCS.d + 0.14, 0, 0.3 + PCS.h + 0.07, 0)
    // 前门百叶
    for (let k = 0; k < 8; k++) {
      const y = 0.85 + k * 0.28
      add(dark, PCS.w * 0.8, 0.1, 0.05, 0, y, PCS.d / 2 + 0.03)
    }
    // 控制面板
    add(accent, 1.0, 0.7, 0.05, PCS.w / 2 - 0.8, 2.2, PCS.d / 2 + 0.03)
    // 顶部散热
    addHvac(light, dark, 0, 0.3 + PCS.h + 0.3, 0, 1.2)
    addLouvres(dark, 0, 0.3 + PCS.h / 2, 0, PCS.w, PCS.h - 0.6, PCS.d, 5)

    commit(g, { light: [merge(light)], dark: [merge(dark)], accent: [merge(accent)], glass: [] }, `pcs-${i + 1}`)
    g.userData.deviceId = `pcs-${i + 1}`

    const kw = 630
    const { status, metrics } = pcsMetrics(kw, 6000 + i * 43)
    registerDevice({
      id: `pcs-${i + 1}`,
      group: '储能系统',
      name: `PCS 变流器 PCS-${String(i + 1).padStart(2, '0')}`,
      kind: 'pcs',
      status,
      position: [x, 5.6, z],
      focusDist: 24,
      desc: `额定 ${kw} kW 双向变流器，支持并/离网切换、无功补偿与一次调频指令响应。`,
      metrics
    })
  }
}

/* --------------------------------------------------------------- 主变 */
function bushing(arr: Geo[], x: number, yBase: number, z: number, scale = 1, color?: Geo[]) {
  const target = color ?? arr
  const segs: [number, number, number][] = [
    [0.34 * scale, 1.9 * scale, yBase + 0.95 * scale],
    [0.24 * scale, 0.7 * scale, yBase + 2.25 * scale],
    [0.16 * scale, 0.55 * scale, yBase + 2.88 * scale]
  ]
  for (const [r, h, y] of segs) {
    const c = new THREE.CylinderGeometry(r, r * 1.1, h, 10)
    c.translate(x, y, z)
    target.push(c)
  }
  const cap = new THREE.SphereGeometry(0.2 * scale, 10, 8)
  cap.translate(x, yBase + 3.25 * scale, z)
  target.push(cap)
}

function buildTransformers(root: THREE.Object3D) {
  const n = config.transformer.count
  for (let i = 0; i < n; i++) {
    const x = SUB.tfX
    const z = SUB.tfZ[i % SUB.tfZ.length]
    const g = new THREE.Group()
    g.name = `trafo-${i + 1}`
    g.position.set(x, 0, z)
    root.add(g)

    const light: Geo[] = []
    const dark: Geo[] = []
    const accent: Geo[] = []
    // 事故油池 + 基础
    add(dark, 11, 0.18, 9, 0, 0.09, 0)
    add(light, 8.6, 0.62, 7.0, 0, 0.31, 0)
    // 油箱
    add(light, 4.6, 3.5, 5.8, 0, 0.62 + 1.75, 0)
    // 箱沿加强筋
    for (let k = -2; k <= 2; k++) add(dark, 4.72, 0.08, 0.1, 0, 0.62 + 2.4, k * 1.3)
    // 散热器（两侧翅片）
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 16; k++) {
        const zz = -2.4 + k * 0.32
        add(dark, 0.9, 2.7, 0.1, s * 2.75, 0.62 + 1.65, zz)
      }
      add(dark, 0.95, 0.16, 5.4, s * 2.75, 0.62 + 3.05, 0)
      add(dark, 0.95, 0.16, 5.4, s * 2.75, 0.62 + 0.25, 0)
      // 联管
      const p1 = new THREE.CylinderGeometry(0.11, 0.11, 1.4, 8)
      p1.rotateZ(Math.PI / 2)
      p1.translate(s * 2.1, 0.62 + 2.85, 1.6)
      dark.push(p1)
      const p2 = new THREE.CylinderGeometry(0.11, 0.11, 1.4, 8)
      p2.rotateZ(Math.PI / 2)
      p2.translate(s * 2.1, 0.62 + 0.55, 1.6)
      dark.push(p2)
    }
    // 储油柜
    const cons = new THREE.CylinderGeometry(0.78, 0.78, 4.0, 12)
    cons.rotateX(Math.PI / 2)
    cons.translate(0, 0.62 + 3.5 + 0.95, 0)
    light.push(cons)
    // 高压套管（顶部 3 支）
    for (let k = -1; k <= 1; k++) bushing(dark, k * 1.45, 0.62 + 3.5, -1.4, 1)
    // 低压套管
    for (let k = -1; k <= 1; k += 2) bushing(dark, k * 1.1, 0.62 + 3.5, 1.9, 0.62)
    // 有载调压箱
    add(accent, 0.9, 1.5, 0.9, 2.5, 0.62 + 1.4, 2.6)
    // 端子箱
    add(dark, 0.8, 1.1, 0.6, -2.5, 0.62 + 1.1, 2.8)

    commit(g, { light: [merge(light)], dark: [merge(dark)], accent: [merge(accent)], glass: [] }, `trafo-${i + 1}`)
    g.userData.deviceId = `tf-${i + 1}`

    const mva = 63
    const { status, metrics } = transformerMetrics(mva, 7000 + i * 61)
    registerDevice({
      id: `tf-${i + 1}`,
      group: '升压站',
      name: `主变压器 T-${String(i + 1).padStart(2, '0')}`,
      kind: 'transformer',
      status,
      position: [x, 9, z],
      focusDist: 40,
      desc: `${mva} MVA 有载调压变压器，35 kV 升压至 110 kV 后并入电网，配置差动与瓦斯保护。`,
      metrics
    })
  }
}

/* ----------------------------------------------------------- 门型构架 */
function latticeColumn(light: Geo[], x: number, z: number, h: number, baseW: number, topW: number) {
  const segs = 5
  const r = 0.1
  const corner = (w: number, i: number): [number, number] => [
    x + (i === 0 || i === 3 ? -w / 2 : w / 2),
    z + (i < 2 ? -w / 2 : w / 2)
  ]
  for (let s = 0; s < segs; s++) {
    const y0 = (h * s) / segs
    const y1 = (h * (s + 1)) / segs
    const w0 = baseW + ((topW - baseW) * s) / segs
    const w1 = baseW + ((topW - baseW) * (s + 1)) / segs
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corner(w0, i)
      const [bx, bz] = corner(w1, i)
      light.push(strut(ax, y0, az, bx, y1, bz, r, 5))
    }
    // 横撑 + 斜撑
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      const [ax, az] = corner(w1, i)
      const [bx, bz] = corner(w1, j)
      light.push(strut(ax, y1, az, bx, y1, bz, r * 0.8, 5))
      const [c0x, c0z] = corner(w0, i)
      light.push(strut(c0x, y0, c0z, bx, y1, bz, r * 0.72, 5))
    }
  }
}

function buildGantry(root: THREE.Object3D) {
  const g = new THREE.Group()
  g.name = 'gantry'
  root.add(g)
  const light: Geo[] = []
  const dark: Geo[] = []
  const z = SUB.gantryZ
  const x0 = SUB.minX + 12
  const x1 = SUB.maxX - 12
  const H = 14
  latticeColumn(light, x0, z, H, 2.6, 1.3)
  latticeColumn(light, x1, z, H, 2.6, 1.3)
  // 横梁桁架
  const beamTop = H
  const segs = 14
  for (let i = 0; i <= segs; i++) {
    const x = x0 + ((x1 - x0) * i) / segs
    light.push(strut(x, beamTop + 0.55, z - 0.5, x, beamTop + 0.55, z + 0.5, 0.08, 4))
    light.push(strut(x, beamTop - 0.55, z - 0.5, x, beamTop - 0.55, z + 0.5, 0.08, 4))
  }
  light.push(strut(x0, beamTop + 0.55, z - 0.5, x1, beamTop + 0.55, z - 0.5, 0.09, 4))
  light.push(strut(x0, beamTop + 0.55, z + 0.5, x1, beamTop + 0.55, z + 0.5, 0.09, 4))
  light.push(strut(x0, beamTop - 0.55, z - 0.5, x1, beamTop - 0.55, z - 0.5, 0.09, 4))
  light.push(strut(x0, beamTop - 0.55, z + 0.5, x1, beamTop - 0.55, z + 0.5, 0.09, 4))
  for (let i = 0; i < segs; i++) {
    const xa = x0 + ((x1 - x0) * i) / segs
    const xb = x0 + ((x1 - x0) * (i + 1)) / segs
    light.push(strut(xa, beamTop + 0.55, z - 0.5, xb, beamTop - 0.55, z - 0.5, 0.06, 4))
    light.push(strut(xa, beamTop + 0.55, z + 0.5, xb, beamTop - 0.55, z + 0.5, 0.06, 4))
  }
  const m = new THREE.Mesh(merge(light), M.pylon)
  m.castShadow = true
  g.add(m)

  // 绝缘子串（悬挂在横梁下方）
  const holders: THREE.Vector3[] = []
  const xs = [x0 + (x1 - x0) * 0.18, x0 + (x1 - x0) * 0.5, x0 + (x1 - x0) * 0.82]
  for (const hx of xs) {
    for (const dz of [-0.5, 0.5]) {
      for (let k = 0; k < 7; k++) {
        const c = new THREE.CylinderGeometry(k % 2 ? 0.13 : 0.2, k % 2 ? 0.13 : 0.2, 0.24, 8)
        c.translate(hx, beamTop - 0.9 - k * 0.24, z + dz)
        dark.push(c)
      }
      holders.push(new THREE.Vector3(hx, beamTop - 0.9 - 7 * 0.24 - 0.2, z + dz))
    }
  }
  const mi = new THREE.Mesh(merge(dark), M.insulator)
  mi.castShadow = true
  g.add(mi)
  g.userData.holders = holders
  return holders
}

/* --------------------------------------------------------------- 铁塔 */
function towerGeometry(h: number, baseW: number, topW: number): Geo {
  const parts: Geo[] = []
  const r = 0.11
  const segs = 6
  const corner = (w: number, i: number): [number, number] => [
    i === 0 || i === 3 ? -w / 2 : w / 2,
    i < 2 ? -w / 2 : w / 2
  ]
  for (let s = 0; s < segs; s++) {
    const y0 = (h * s) / segs
    const y1 = (h * (s + 1)) / segs
    const w0 = baseW + ((topW - baseW) * s) / segs
    const w1 = baseW + ((topW - baseW) * (s + 1)) / segs
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corner(w0, i)
      const [bx, bz] = corner(w1, i)
      parts.push(strut(ax, y0, az, bx, y1, bz, r, 5))
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      const [ax, az] = corner(w1, i)
      const [bx, bz] = corner(w1, j)
      parts.push(strut(ax, y1, az, bx, y1, bz, r * 0.8, 5))
      const [c0x, c0z] = corner(w0, i)
      parts.push(strut(c0x, y0, c0z, bx, y1, bz, r * 0.7, 4))
      const [c1x, c1z] = corner(w0, j)
      parts.push(strut(c1x, y0, c1z, ax, y1, az, r * 0.7, 4))
    }
  }
  // 三层横担
  const arms: [number, number][] = [
    [h * 0.68, 13],
    [h * 0.82, 10.5],
    [h * 0.94, 8]
  ]
  for (const [ay, aw] of arms) {
    for (const s of [-1, 1]) {
      // 上下弦
      parts.push(strut(0, ay + 0.55, 0, s * aw, ay + 0.55, 0, 0.1, 5))
      parts.push(strut(0, ay - 0.55, 0, s * aw, ay - 0.55, 0, 0.1, 5))
      const n = 5
      for (let i = 0; i < n; i++) {
        const xa = (s * aw * i) / n
        const xb = (s * aw * (i + 1)) / n
        parts.push(strut(xa, ay + 0.55, 0, xb, ay - 0.55, 0, 0.06, 4))
        parts.push(strut(xa, ay + 0.55, 0, xb, ay + 0.55, 0, 0.07, 4))
        parts.push(strut(xa, ay - 0.55, 0, xb, ay - 0.55, 0, 0.07, 4))
      }
      parts.push(strut(0, ay + 0.55, 0, s * aw, ay - 0.55, 0, 0.07, 4))
    }
  }
  // 塔顶避雷线支架
  parts.push(strut(0, h, 0, 0, h + 4.5, 0, 0.09, 5))
  parts.push(strut(-1.6, h + 3.0, 0, 1.6, h + 3.0, 0, 0.07, 4))
  parts.push(strut(-1.6, h + 3.0, 0, 0, h + 4.5, 0, 0.07, 4))
  parts.push(strut(1.6, h + 3.0, 0, 0, h + 4.5, 0, 0.07, 4))
  return merge(parts)
}

export interface TowerResult {
  positions: THREE.Vector3[]
  /** 每个塔每层横担两侧导线挂点 */
  attach: THREE.Vector3[][]
  peak: THREE.Vector3[]
}

function buildTowers(root: THREE.Object3D): TowerResult {
  const n = config.tower.count
  const h = TOWER.h
  const geo = towerGeometry(h, 5.2, 1.5)
  const mat = track(M.pylon.clone() as THREE.MeshLambertMaterial, C.pylon, true)

  const positions: THREE.Vector3[] = []
  const attach: THREE.Vector3[][] = []
  const peak: THREE.Vector3[] = []
  const arms: [number, number][] = [
    [h * 0.68, 13],
    [h * 0.82, 10.5],
    [h * 0.94, 8]
  ]
  const holder = new THREE.Group()
  holder.name = 'towers'
  root.add(holder)

  for (let i = 0; i < n; i++) {
    const z = TOWER.z + i * TOWER.dz
    const p = new THREE.Vector3(TOWER.x, 0, z)
    positions.push(p)

    // 每基塔独立 Mesh —— 便于逐塔拾取（n 很小，draw call 影响可忽略）
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(p.x, 0, p.z)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.name = `tower-${i + 1}`
    mesh.userData.deviceId = `tower-${i + 1}`
    holder.add(mesh)

    const ring: THREE.Vector3[] = []
    for (const [ay, aw] of arms) {
      ring.push(new THREE.Vector3(TOWER.x - aw, ay, z))
      ring.push(new THREE.Vector3(TOWER.x + aw, ay, z))
    }
    attach.push(ring)
    peak.push(new THREE.Vector3(TOWER.x, h + 4.5, z))

    const { status, metrics } = facilityMetrics(8100 + i * 29, 'tower')
    registerDevice({
      id: `tower-${i + 1}`,
      group: '升压站',
      name: `输电铁塔 #${i + 1}`,
      kind: 'tower',
      status,
      position: [positions[i].x, 20, positions[i].z],
      focusDist: 46,
      desc: '110 kV 双回架空线路耐张塔，导线采用钢芯铝绞线，配置双地线防雷。',
      metrics
    })
  }

  return { positions, attach, peak }
}

/* ------------------------------------------------------------ 升压站楼 */
function buildSubstationBuilding(root: THREE.Object3D) {
  const grp = makeBuilding(root, { x: SUB.gis.x, z: SUB.gis.z, w: SUB.gis.w, d: SUB.gis.d, h: SUB.gis.h, floors: 2, front: 1 })
  grp.userData.deviceId = 'sub-building'
  const { status, metrics } = transformerMetrics(63, 8888)
  registerDevice({
    id: 'sub-building',
    group: '升压站',
    name: '升压站控制楼',
    kind: 'ems',
    status,
    position: [SUB.gis.x, SUB.gis.h + 8, SUB.gis.z],
    focusDist: 56,
    desc: '汇集 35 kV 集电线路，配置 GIS 组合电器、继电保护与站用电系统。',
    metrics
  })
}

/* ----------------------------------------------------- 升压站开关场细部 */
function buildYardDetails(root: THREE.Object3D) {
  const g = new THREE.Group()
  g.name = 'sub-yard'
  root.add(g)

  const light: Geo[] = []
  const dark: Geo[] = []
  const accent: Geo[] = []
  const busGeos: Geo[] = []

  /* 电缆沟（暗色带，划分开关场） */
  for (const cz of [-54, -72]) {
    add(dark, 66, 0.12, 1.4, 112, 0.14, cz)
  }
  add(dark, 64, 0.12, 1.4, 112, 0.14, -96)

  /* 主变之间防火墙 */
  for (const cz of [-53, -75]) {
    add(light, 0.5, 5.0, 8.4, SUB.tfX, 2.5, cz)
  }

  /* 母线支柱绝缘子排（沿东西向，两排架空母线） */
  const busRow = (zRow: number, yTop: number, yLow: number) => {
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 8
      const post = new THREE.CylinderGeometry(0.2, 0.28, yTop - 0.3, 8)
      post.translate(x, (yTop - 0.3) / 2, zRow)
      dark.push(post)
      add(light, 0.9, 0.18, 0.9, x, 0.1, zRow)
    }
    for (const [yy, r] of [
      [yTop, 0.13],
      [yLow, 0.1]
    ] as [number, number][]) {
      const bus = new THREE.CylinderGeometry(r, r, 66, 8)
      bus.rotateZ(Math.PI / 2)
      bus.translate(112, yy, zRow)
      busGeos.push(bus)
    }
  }
  busRow(-94, 6.7, 5.6)
  busRow(-99, 7.6, 6.5)

  /* 避雷器（叠片柱，布置在东侧） */
  const arrester = (x: number, z: number) => {
    add(light, 0.85, 0.22, 0.85, x, 0.11, z)
    for (let k = 0; k < 6; k++) {
      const r = k % 2 ? 0.2 : 0.28
      const d = new THREE.CylinderGeometry(r, r, 0.52, 8)
      d.translate(x, 0.75 + k * 0.55, z)
      dark.push(d)
    }
    const cap = new THREE.SphereGeometry(0.2, 8, 6)
    cap.translate(x, 4.2, z)
    dark.push(cap)
  }
  for (const z of [-42, -64, -86, -100]) arrester(146, z)

  /* 隔离开关（双柱 + 水平刀闸） */
  const disconnector = (x: number, z: number, rot = 0) => {
    for (const s of [-1.6, 1.6]) {
      const px = rot ? x : x + s
      const pz = rot ? z + s : z
      const post = new THREE.CylinderGeometry(0.2, 0.26, 4.2, 8)
      post.translate(px, 2.1, pz)
      dark.push(post)
      add(light, 0.8, 0.2, 0.8, px, 0.1, pz)
    }
    const blade = new THREE.BoxGeometry(rot ? 0.12 : 3.6, 0.12, rot ? 3.6 : 0.12)
    blade.translate(x, 4.35, z)
    busGeos.push(blade)
  }
  for (const x of [98, 112, 126, 140]) {
    disconnector(x, -80)
    disconnector(x, -34, 1)
  }

  /* 电容器组（成排罐体 + 围栏） */
  for (let i = 0; i < 8; i++) {
    const c = new THREE.CylinderGeometry(0.55, 0.55, 1.9, 10)
    c.translate(100 + i * 2.1, 1.5, -46)
    light.push(c)
    add(dark, 0.12, 0.6, 0.12, 100 + i * 2.1, 0.5, -46)
  }
  add(dark, 18, 0.16, 3.4, 107.4, 0.12, -46)

  /* GIS 组合电器间隔区（成排白色间隔箱 + 顶部出线套管），填补站院中部空场 */
  for (let i = 0; i < 5; i++) {
    const x = 82 + i * 8.4
    add(light, 6.4, 4.2, 4.0, x, 2.2, -63)
    add(dark, 6.8, 0.28, 4.4, x, 4.44, -63)
    // 间隔两侧的操作机构箱
    add(dark, 0.8, 1.6, 0.8, x - 3.0, 0.9, -60.6)
    // 顶部三支出线套管
    for (let k = -1; k <= 1; k++) {
      const t = new THREE.CylinderGeometry(0.16, 0.22, 2.2, 8)
      t.translate(x + k * 1.6, 5.7, -64.2)
      dark.push(t)
      const cap = new THREE.SphereGeometry(0.22, 8, 6)
      cap.translate(x + k * 1.6, 6.85, -64.2)
      dark.push(cap)
    }
    // 汇控柜
    add(light, 1.1, 1.9, 0.7, x + 2.4, 0.95, -60.6)
  }
  add(dark, 44, 0.16, 5.2, 98.8, 0.12, -63)

  /* 出线场：电压互感器 + 耦合电容器（门型构架南侧一排） */
  for (let i = 0; i < 4; i++) {
    const x = 86 + i * 16
    for (let k = 0; k < 5; k++) {
      const d = new THREE.CylinderGeometry(k % 2 ? 0.17 : 0.24, k % 2 ? 0.17 : 0.24, 0.46, 8)
      d.translate(x, 0.7 + k * 0.49, -106)
      dark.push(d)
    }
    add(light, 0.8, 0.2, 0.8, x, 0.1, -106)
    const cap = new THREE.SphereGeometry(0.19, 8, 6)
    cap.translate(x, 3.25, -106)
    dark.push(cap)
  }

  /* 二次设备室 / 配电室 */
  add(light, 13, 4.2, 8, 136, 2.2, -34)
  add(dark, 13.4, 0.3, 8.4, 136, 4.45, -34)
  add(accent, 1.6, 2.2, 0.12, 133, 1.5, -30)

  /* 站用变 */
  add(light, 3.4, 2.4, 2.4, 82, 1.3, -34)
  add(dark, 3.6, 0.16, 2.6, 82, 2.6, -34)

  const parts: [Geo[], THREE.Material][] = [
    [light, M.container],
    [dark, M.steelDark],
    [accent, M.doorBlue],
    [busGeos, M.steel]
  ]
  for (const [geos, mat] of parts) {
    if (!geos.length) continue
    const m = new THREE.Mesh(merge(geos), mat)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
}

/* ------------------------------------------------------------ 站内母线 */
function buildBuswork(root: THREE.Object3D, holders: THREE.Vector3[]) {  const g = new THREE.Group()
  g.name = 'buswork'
  root.add(g)
  const geos: Geo[] = []
  const cable = (a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.1) => {
    const mid = a.clone().lerp(b, 0.5)
    mid.y -= sag
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
    geos.push(new THREE.TubeGeometry(curve, 18, r, 6, false))
  }
  // 主变高压套管 → 门型构架绝缘子
  const hvY = 0.62 + 3.5 + 3.25
  for (let i = 0; i < config.transformer.count; i++) {
    const tz = SUB.tfZ[i % SUB.tfZ.length]
    const start = new THREE.Vector3(SUB.tfX, hvY, tz)
    const hx = holders[Math.min(holders.length - 1, i * 2)]
    cable(start, hx.clone().setX(SUB.tfX), 2.2, 0.11)
  }
  // 绝缘子 → 出线到铁塔
  const targets = [holders[1], holders[3], holders[5]]
  void targets
  const m = new THREE.Mesh(merge(geos), M.conductor)
  m.castShadow = true
  g.add(m)
}

/* -------------------------------------------------------------- 入口 */
export function buildEquipment(root: THREE.Object3D): TowerResult {
  const g = new THREE.Group()
  g.name = 'equipment'
  root.add(g)
  buildCombiners(g)
  buildInverters(g)
  buildBatteries(g)
  buildPcs(g)
  buildTransformers(g)
  const holders = buildGantry(g)
  buildYardDetails(g)
  buildSubstationBuilding(g)
  const towers = buildTowers(g)
  buildBuswork(g, holders)
  return towers
}
