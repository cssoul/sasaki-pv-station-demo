/**
 * ground.ts —— 微缩底板 / 草地 / 道路 / 标线 / 停车场 / 混凝土场坪
 * 全部由程序化平面与盒体合并而成，无任何贴图文件（草地噪点用 Canvas 生成）。
 */
import * as THREE from 'three'
import { M } from './materials'
import { SITE, SITE_W, SITE_D, SITE_CX, SITE_CZ, PLATE, roads, PARKING, OM_PARKING, PV_AREA, PV, COMBINER, INVERTER, BATTERY, PCS, EMS, OM, ADMIN, WAREHOUSE, TOOLHOUSE, SUB, GATE } from './layout'
import { merge, rand, assertOnPlate } from './utils'
import { registerDevice } from '../data/mock'

function rect(w: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.PlaneGeometry(w, d)
  g.rotateX(-Math.PI / 2)
  g.translate(x, y, z)
  return g
}

function flatBox(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

export interface GroundResult {
  cells: THREE.Object3D
}

export function buildGround(root: THREE.Object3D): GroundResult {
  const g = new THREE.Group()
  g.name = 'ground'
  root.add(g)

  /* ---------------------------------------------------- 1. 微缩底板（无厚度） */
  // 底盘比站区外扩得足够多：在任何预设俯角下，画面四角都应落在绿色底板上，
  // 而不是露出天空（SASAKI 稿里场地四周就是连绵的绿色田野）。
  const rim = new THREE.Mesh(rect(PLATE.rimW, PLATE.rimD, SITE_CX, -0.6, SITE_CZ), M.grassEdge)
  rim.receiveShadow = true
  g.add(rim)

  const base = new THREE.Mesh(rect(PLATE.w, PLATE.d, SITE_CX, 0, SITE_CZ), M.grass)
  base.receiveShadow = true
  g.add(base)

  /* ---------------------------------------------------- 2. 草色斑块（打破大片纯色）
   * 位置必须按斑块「自身尺寸」反算可摆放范围：
   *   |中心偏移| ≤ 底盘半宽 − 边距 − 自身半宽
   * 只约束中心、不扣自身半径的话，斑块矩形会飘到底盘之外压到天空上。 */
  const rnd = rand(20260930)
  const PATCH_INSET = 8 // 与底盘边缘保留的余量
  const patchA: THREE.BufferGeometry[] = []
  const patchB: THREE.BufferGeometry[] = []
  for (let i = 0; i < 34; i++) {
    const w = 60 + rnd() * 90
    const d = 50 + rnd() * 80
    const maxX = Math.max(0, PLATE.w / 2 - PATCH_INSET - w / 2)
    const maxZ = Math.max(0, PLATE.d / 2 - PATCH_INSET - d / 2)
    const x = SITE_CX + (rnd() * 2 - 1) * maxX
    const z = SITE_CZ + (rnd() * 2 - 1) * maxZ
    const geo = rect(w, d, x, 0.014 + (i % 3) * 0.004, z)
    ;(i % 2 === 0 ? patchA : patchB).push(geo)
  }
  const pa = new THREE.Mesh(merge(patchA), M.grassLight)
  pa.receiveShadow = true
  g.add(pa)
  const pb = new THREE.Mesh(merge(patchB), M.grassDeep)
  pb.receiveShadow = true
  g.add(pb)
  // 自检：草地色块必须完全落在底盘内，越界就在控制台报出来
  assertOnPlate(pa, '草地色块 A（浅）', PLATE)
  assertOnPlate(pb, '草地色块 B（深）', PLATE)

  /* ---------------------------------------------------- 3. 道路 */
  const asphaltGeos: THREE.BufferGeometry[] = []
  const curbGeos: THREE.BufferGeometry[] = []
  const dashGeos: THREE.BufferGeometry[] = []
  const edgeGeos: THREE.BufferGeometry[] = []

  const CROSS = new Set<string>()
  for (const r of roads) {
    const y = 0.06 + (r.level ?? 0)
    asphaltGeos.push(rect(r.w, r.d, r.x, y, r.z))
    // 路缘石
    const long = r.w >= r.d
    if (long) {
      curbGeos.push(flatBox(r.w, 0.3, 0.5, r.x, 0.15 + y, r.z - r.d / 2 + 0.25))
      curbGeos.push(flatBox(r.w, 0.3, 0.5, r.x, 0.15 + y, r.z + r.d / 2 - 0.25))
    } else {
      curbGeos.push(flatBox(0.5, 0.3, r.d, r.x - r.w / 2 + 0.25, 0.15 + y, r.z))
      curbGeos.push(flatBox(0.5, 0.3, r.d, r.x + r.w / 2 - 0.25, 0.15 + y, r.z))
    }
    // 中心虚线
    if (r.dash) {
      const step = 9
      if (long) {
        const n = Math.max(1, Math.floor(r.w / step))
        for (let i = 0; i < n; i++) {
          const x = r.x - r.w / 2 + step * (i + 0.5)
          dashGeos.push(rect(3.6, 0.28, x, y + 0.012, r.z))
        }
      } else {
        const n = Math.max(1, Math.floor(r.d / step))
        for (let i = 0; i < n; i++) {
          const z = r.z - r.d / 2 + step * (i + 0.5)
          dashGeos.push(rect(0.28, 3.6, r.x, y + 0.012, z))
        }
      }
    }
    // 暖色路缘线（SASAKI 图里的橙色边线）
    if (r.edge) {
      if (long) {
        edgeGeos.push(rect(r.w - 1.2, 0.3, r.x, y + 0.012, r.z - r.d / 2 + 0.85))
        edgeGeos.push(rect(r.w - 1.2, 0.3, r.x, y + 0.012, r.z + r.d / 2 - 0.85))
      } else {
        edgeGeos.push(rect(0.3, r.d - 1.2, r.x - r.w / 2 + 0.85, y + 0.012, r.z))
        edgeGeos.push(rect(0.3, r.d - 1.2, r.x + r.w / 2 - 0.85, y + 0.012, r.z))
      }
    }
    void CROSS
  }

  const roadMesh = new THREE.Mesh(merge(asphaltGeos), M.asphalt)
  roadMesh.receiveShadow = true
  roadMesh.name = 'roads'
  g.add(roadMesh)

  const curbMesh = new THREE.Mesh(merge(curbGeos), M.concrete)
  curbMesh.receiveShadow = true
  curbMesh.castShadow = true
  g.add(curbMesh)

  const dashMesh = new THREE.Mesh(merge(dashGeos), M.markWhite)
  g.add(dashMesh)

  const edgeMesh = new THREE.Mesh(merge(edgeGeos), M.markWarm)
  g.add(edgeMesh)

  /* ---------------------------------------------------- 4. 混凝土场坪 */
  const padGeos: THREE.BufferGeometry[] = []
  const addPad = (x: number, z: number, w: number, d: number, y = 0.08) => {
    padGeos.push(flatBox(w, y, d, x, y / 2, z))
  }

  // 汇流箱基座带（沿光伏区东侧）
  addPad(COMBINER.x, (COMBINER.zStart + PV_AREA.maxZ) / 2, 8, Math.abs(COMBINER.zStart - PV_AREA.maxZ) + 16)
  // 逆变器场坪
  addPad(INVERTER.x0 + 16, INVERTER.z0 + 5.5, 38, 22)
  // 储能电池柜场坪
  addPad(BATTERY.x0 + 20, BATTERY.z0 + 7, 62, 26)
  // PCS 场坪
  addPad(PCS.x0 + 15, PCS.z0, 46, 12)
  // 建筑
  addPad(EMS.x, EMS.z, EMS.w + 26, EMS.d + 22)
  addPad(OM.x, OM.z, OM.w + 22, OM.d + 18)
  addPad(ADMIN.x, ADMIN.z, ADMIN.w + 22, ADMIN.d + 18)
  addPad(WAREHOUSE.x, WAREHOUSE.z, WAREHOUSE.w + 16, WAREHOUSE.d + 14)
  addPad(TOOLHOUSE.x, TOOLHOUSE.z, TOOLHOUSE.w + 14, TOOLHOUSE.d + 12)
  // 升压站：开关场主体 + 主变间隔 + 门型构架带（保留草带分隔，避免一整块灰板）
  addPad((SUB.minX + SUB.maxX) / 2 + 4, -70, SUB.maxX - SUB.minX - 4, 74)
  for (const z of SUB.tfZ) addPad(SUB.tfX, z, 14, 14)
  addPad((SUB.minX + SUB.maxX) / 2 + 4, SUB.gantryZ, SUB.maxX - SUB.minX - 10, 11)
  // 停车场 / 大门
  addPad(PARKING.x, PARKING.z, PARKING.w + 6, PARKING.d + 6, 0.1)
  addPad(OM_PARKING.x, OM_PARKING.z, OM_PARKING.w + 6, OM_PARKING.d + 6, 0.1)
  addPad(GATE.x + 4, GATE.z + 8, 30, 20, 0.1)

  const padMesh = new THREE.Mesh(merge(padGeos), M.concrete)
  padMesh.receiveShadow = true
  g.add(padMesh)

  /* ---------------------------------------------------- 5. 停车场车位线 */
  const bayGeos: THREE.BufferGeometry[] = []
  const bays = (p: { x: number; z: number; w: number; cols: number }) => {
    const bw = 2.6
    const bd = 5.2
    const cols = Math.min(p.cols, Math.floor(p.w / bw))
    const startX = p.x - ((cols - 1) * bw) / 2
    for (let rowI = 0; rowI < 2; rowI++) {
      const zc = p.z - 3.6 + rowI * 7.2
      for (let i = 0; i <= cols; i++) {
        bayGeos.push(rect(0.16, bd, startX - bw / 2 + i * bw, 0.115, zc))
      }
      bayGeos.push(rect(cols * bw, 0.16, p.x, 0.115, zc - bd / 2))
      bayGeos.push(rect(cols * bw, 0.16, p.x, 0.115, zc + bd / 2))
    }
  }
  bays(PARKING)
  bays(OM_PARKING)
  const bayMesh = new THREE.Mesh(merge(bayGeos), M.markWhite)
  g.add(bayMesh)

  /* ---------------------------------------------------- 6. 设备占位登记（用于右浮层 / 标签） */
  registerDevice({
    id: 'road-main',
    group: '运维道路',
    name: '厂区运维道路',
    kind: 'road',
    status: '运行',
    position: [-46, 1.4, -44],
    focusDist: 120,
    desc: '连接光伏区、储能区、升压站与厂前区的主环线，双侧设路灯与排水沟。',
    metrics: [
      { label: '道路总长', value: '2.4', unit: 'km' },
      { label: '路面状态', value: '良好', tone: 'good' },
      { label: '照明回路', value: '3', unit: '路' },
      { label: '在线路灯', value: '44', unit: '盏', tone: 'good' }
    ]
  })

  return { cells: g }
}
