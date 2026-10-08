/**
 * buildings.ts —— 建筑与附属设施
 * EMS 控制中心 / 运维楼 / 备品库 / 主出入口 / 路灯 / 围墙
 * 建筑体量统一为「白色清水墙 + 蓝色玻璃带 + 浅灰挑檐」，与设计稿的建筑语言一致。
 */
import * as THREE from 'three'
import { M, track } from './materials'
import { C } from './palette'
import { EMS, OM, ADMIN, WAREHOUSE, TOOLHOUSE, GATE, SITE_FENCE, SUB, PV_AREA, roads, MAIN_ROAD_W } from './layout'
import { merge, uvPlane, uvPlaneBetween, setInstances, fenceTexture, rand } from './utils'
import { config, registerDevice, facilityMetrics } from '../data/mock'

const fenceTex = fenceTexture()
const fencePanelMat = new THREE.MeshLambertMaterial({
  map: fenceTex,
  color: C.fence,
  transparent: true,
  alphaTest: 0.42,
  side: THREE.DoubleSide,
  depthWrite: true
})
track(fencePanelMat, C.fence, true)

/* --------------------------------------------------------------- 通用楼 */
export interface BldgOpts {
  x: number
  z: number
  w: number
  d: number
  h: number
  floors: number
  glow?: boolean
  /** 主入口朝向：+z 或 -z */
  front?: 1 | -1
}

function pushBox(arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  arr.push(g)
}

function facadeGlow(
  arr: THREE.BufferGeometry[],
  x: number,
  z: number,
  w: number,
  h: number,
  y: number,
  dir: number
) {
  const g = uvPlane(w, h, Math.max(2, Math.round(w / 4)), Math.max(1, Math.round(h / 3.2)))
  g.translate(0, 0, 0)
  g.rotateY(dir > 0 ? 0 : Math.PI)
  g.translate(x, y + h / 2, z)
  arr.push(g)
}

export function makeBuilding(parent: THREE.Object3D, o: BldgOpts) {
  const g = new THREE.Group()
  g.name = 'bldg'
  parent.add(g)
  const shell: THREE.BufferGeometry[] = []
  const band: THREE.BufferGeometry[] = []
  const roof: THREE.BufferGeometry[] = []
  const dark: THREE.BufferGeometry[] = []
  const glow: THREE.BufferGeometry[] = []

  const baseY = 0.9
  pushBox(shell, o.w, o.h, o.d, o.x, baseY + o.h / 2, o.z)
  // 台基
  pushBox(dark, o.w + 1.6, baseY, o.d + 1.6, o.x, baseY / 2, o.z)
  // 每层玻璃带
  const fh = o.h / o.floors
  for (let f = 0; f < o.floors; f++) {
    const y = baseY + f * fh + fh * 0.66
    pushBox(band, o.w + 0.16, fh * 0.52, o.d + 0.16, o.x, y, o.z)
  }
  // 檐口 + 女儿墙
  pushBox(roof, o.w + 2.0, 0.9, o.d + 2.0, o.x, baseY + o.h + 0.45, o.z)
  pushBox(roof, o.w + 0.4, 0.8, o.d + 0.4, o.x, baseY + o.h + 1.3, o.z)
  // 屋面设备 + 楼梯间
  pushBox(roof, o.w * 0.26, 2.5, o.d * 0.46, o.x - o.w * 0.27, baseY + o.h + 2.15, o.z)
  pushBox(dark, 2.2, 0.9, 1.6, o.x + o.w * 0.3, baseY + o.h + 1.35, o.z + o.d * 0.2)
  pushBox(dark, 1.8, 0.8, 1.8, o.x + o.w * 0.36, baseY + o.h + 1.3, o.z - o.d * 0.3)

  // 入口雨棚 + 门斗
  const fr = o.front ?? 1
  const zf = o.z + (fr * o.d) / 2
  pushBox(roof, Math.min(9, o.w * 0.42), 0.42, 3.0, o.x, baseY + 3.5, zf + fr * 1.5)
  pushBox(band, Math.min(8.4, o.w * 0.38), 3.0, 0.36, o.x, baseY + 1.5, zf + fr * 0.02)
  pushBox(shell, 0.5, 3.4, 0.5, o.x - Math.min(4, o.w * 0.2), baseY + 1.7, zf + fr * 2.8)
  pushBox(shell, 0.5, 3.4, 0.5, o.x + Math.min(4, o.w * 0.2), baseY + 1.7, zf + fr * 2.8)

  // 夜景窗光
  if (o.glow !== false) {
    facadeGlow(glow, o.x, o.z + o.d / 2 + 0.1, o.w * 0.94, o.h * 0.78, baseY + o.h * 0.1, 1)
    facadeGlow(glow, o.x, o.z - o.d / 2 - 0.1, o.w * 0.94, o.h * 0.78, baseY + o.h * 0.1, -1)
    const side = uvPlane(o.d * 0.94, o.h * 0.78, Math.max(2, Math.round(o.d / 4)), Math.max(1, Math.round(o.h / 3.2)))
    side.rotateY(Math.PI / 2)
    side.translate(o.x + o.w / 2 + 0.1, baseY + o.h * 0.1 + o.h * 0.39, o.z)
    glow.push(side)
    const side2 = uvPlane(o.d * 0.94, o.h * 0.78, Math.max(2, Math.round(o.d / 4)), Math.max(1, Math.round(o.h / 3.2)))
    side2.rotateY(-Math.PI / 2)
    side2.translate(o.x - o.w / 2 - 0.1, baseY + o.h * 0.1 + o.h * 0.39, o.z)
    glow.push(side2)
  }

  const mShell = new THREE.Mesh(merge(shell), M.office)
  const mBand = new THREE.Mesh(merge(band), M.band)
  const mRoof = new THREE.Mesh(merge(roof), M.roof)
  const mDark = new THREE.Mesh(merge(dark), M.concretePlain)
  for (const m of [mShell, mBand, mRoof, mDark]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  const mGlow = new THREE.Mesh(merge(glow), M.windowGlow)
  mGlow.renderOrder = 2
  g.add(mGlow)
  return g
}

/* -------------------------------------------------------------- 主出入口 */
function buildGate(parent: THREE.Object3D) {
  const g = new THREE.Group()
  parent.add(g)
  const white: THREE.BufferGeometry[] = []
  const roof: THREE.BufferGeometry[] = []
  const dark: THREE.BufferGeometry[] = []
  const orange: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []

  const { x, z } = GATE
  // 门柱 + 横梁
  pushBox(white, 1.4, 5.2, 1.4, x - 7, 2.6, z)
  pushBox(white, 1.4, 5.2, 1.4, x + 7, 2.6, z)
  pushBox(white, 15.4, 1.1, 1.6, x, 5.55, z)
  pushBox(roof, 16.4, 0.5, 2.2, x, 6.3, z)
  // 门卫室
  pushBox(white, 7.0, 3.6, 4.6, x + 13.5, 2.7, z + 1.2)
  pushBox(roof, 8.0, 0.5, 5.6, x + 13.5, 4.7, z + 1.2)
  pushBox(glass, 7.2, 1.5, 4.8, x + 13.5, 3.1, z + 1.2)
  // 道闸
  pushBox(dark, 0.6, 1.3, 0.6, x - 3.6, 0.65, z + 1.0)
  pushBox(orange, 5.4, 0.24, 0.24, x - 0.9, 1.2, z + 1.0)
  // 伸缩门（竖栅）
  for (let i = 0; i < 26; i++) {
    const gx = x - 5.4 + i * 0.44
    pushBox(dark, 0.08, 2.4, 0.08, gx, 1.2, z - 0.4)
  }
  pushBox(dark, 11.4, 0.14, 0.14, x, 2.42, z - 0.4)
  pushBox(dark, 11.4, 0.14, 0.14, x, 0.12, z - 0.4)

  const parts: [THREE.BufferGeometry[], THREE.Material][] = [
    [white, M.office],
    [roof, M.roof],
    [dark, M.steelDark],
    [orange, M.markWarm],
    [glass, M.band]
  ]
  for (const [geos, mat] of parts) {
    if (!geos.length) continue
    const m = new THREE.Mesh(merge(geos), mat)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  g.userData.deviceId = 'gate-main'
  return g
}

/* ------------------------------------------------------------------ 路灯 */
function buildLamps(parent: THREE.Object3D) {
  const list: { p: [number, number, number]; ry: number }[] = []
  const push = (x: number, z: number, ry: number) => list.push({ p: [x, 0, z], ry })

  // 市政主干道两侧（道路中心线 z = 127，与 layout.ts 保持一致）
  for (let x = -172; x <= 192; x += 26) push(x, 127 - MAIN_ROAD_W / 2 - 1.6, 0)
  for (let x = -160; x <= 192; x += 26) push(x, 127 + MAIN_ROAD_W / 2 + 1.6, Math.PI)
  // 厂区东西主干道北侧
  for (let x = -166; x <= 58; x += 30) push(x, -48.5 - 1.4, 0)
  // 东环
  for (let z = -60; z <= 96; z += 28) push(62 - 4 - 1.4, z, 0)
  // 西环
  for (let z = -120; z <= 96; z += 40) push(-172 + 3.5 + 1.4, z, Math.PI)
  // 厂前区道路
  for (let x = -92; x <= 96; x += 32) push(x, 34 - 4 - 1.4, 0)

  const pole: THREE.BufferGeometry[] = []
  pushBox(pole, 0.3, 0.34, 0.3, 0, 0.17, 0)
  const c1 = new THREE.CylinderGeometry(0.13, 0.17, 5.8, 8)
  c1.translate(0, 2.9, 0)
  pole.push(c1)
  pushBox(pole, 0.16, 0.16, 1.7, 0, 5.72, 0.85)
  // 灯头
  const head: THREE.BufferGeometry[] = []
  pushBox(head, 0.46, 0.2, 0.86, 0, 5.6, 1.62)

  const poleMat = track(M.lampPole.clone() as THREE.MeshLambertMaterial, '#c9ced3', true)
  const headMat = track(M.lampHead.clone() as THREE.MeshLambertMaterial, '#e8ebee', true)

  const im1 = new THREE.InstancedMesh(merge(pole), poleMat, list.length)
  const im2 = new THREE.InstancedMesh(merge(head), headMat, list.length)
  for (const m of [im1, im2]) {
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
  }
  setInstances(im1, list)
  setInstances(im2, list)
  im1.computeBoundingSphere()
  im2.computeBoundingSphere()

  // 夜间灯头光晕
  const glowGeo = new THREE.PlaneGeometry(1.5, 1.5)
  glowGeo.rotateX(-Math.PI / 2)
  glowGeo.translate(0, 5.48, 1.62)
  const im3 = new THREE.InstancedMesh(glowGeo, M.lampGlow, list.length)
  parent.add(im3)
  setInstances(im3, list)
  im3.computeBoundingSphere()

  return list.length
}

/* ------------------------------------------------------------------ 围墙 */
function fenceRun(
  panels: THREE.BufferGeometry[],
  posts: [number, number][],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h = 2.2,
  step = 4
) {
  const len = Math.hypot(bx - ax, bz - az)
  const n = Math.max(1, Math.round(len / step))
  for (let i = 0; i < n; i++) {
    const t0 = i / n
    const t1 = (i + 1) / n
    const x0 = ax + (bx - ax) * t0
    const z0 = az + (bz - az) * t0
    const x1 = ax + (bx - ax) * t1
    const z1 = az + (bz - az) * t1
    panels.push(uvPlaneBetween(x0, z0, x1, z1, h, 0.1, 0.55, 2))
    posts.push([x0, z0])
  }
  posts.push([bx, bz])
}

function rectFence(
  panels: THREE.BufferGeometry[],
  posts: [number, number][],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  h = 2.2,
  gap?: { axis: 'x' | 'z'; from: number; to: number; at: number }
) {
  const corners: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ]
  ]
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    if (gap && i === 3) {
      // 南侧围墙留门禁
      fenceRun(panels, posts, a[0], a[1], gap.from, a[1], h)
      fenceRun(panels, posts, gap.to, a[1], b[0], b[1], h)
      continue
    }
    fenceRun(panels, posts, a[0], a[1], b[0], b[1], h)
  }
}

/* ------------------------------------------------------- 升压站实体围墙 */
/**
 * 设计稿里的升压变电站是被一道灰白砌体围墙圈起来的矩形院落。
 * 这里用盒体沿墙线直接建实体墙（不是栅栏网片），墙顶加压顶，
 * 南侧按门洞断开，与「围墙 — 院内设备」的层次关系一致。
 */
function wallRun(
  body: THREE.BufferGeometry[],
  cap: THREE.BufferGeometry[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h = 2.1,
  t = 0.4
) {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 0.05) return
  const cx = (ax + bx) / 2
  const cz = (az + bz) / 2
  const ry = Math.atan2(dx, dz)
  const g1 = new THREE.BoxGeometry(t, h, len)
  g1.rotateY(ry)
  g1.translate(cx, h / 2, cz)
  body.push(g1)
  const g2 = new THREE.BoxGeometry(t + 0.18, 0.18, len)
  g2.rotateY(ry)
  g2.translate(cx, h + 0.09, cz)
  cap.push(g2)
}

function rectWall(
  body: THREE.BufferGeometry[],
  cap: THREE.BufferGeometry[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  h = 2.1,
  gap?: { from: number; to: number }
) {
  // 北墙（-Z 侧）
  wallRun(body, cap, minX, minZ, maxX, minZ, h)
  // 东墙
  wallRun(body, cap, maxX, minZ, maxX, maxZ, h)
  // 南墙（+Z 侧，朝向进出路，按门洞断开）
  if (gap) {
    wallRun(body, cap, maxX, maxZ, gap.to, maxZ, h)
    wallRun(body, cap, gap.from, maxZ, minX, maxZ, h)
  } else {
    wallRun(body, cap, maxX, maxZ, minX, maxZ, h)
  }
  // 西墙
  wallRun(body, cap, minX, maxZ, minX, minZ, h)
}

export function buildFacilities(root: THREE.Object3D): { lampCount: number } {
  const zone = new THREE.Group()
  zone.name = 'facilities'
  root.add(zone)

  /* 建筑 */
  const emsG = makeBuilding(zone, { x: EMS.x, z: EMS.z, w: EMS.w, d: EMS.d, h: EMS.h, floors: 2, front: 1 })
  const omG = makeBuilding(zone, { x: OM.x, z: OM.z, w: OM.w, d: OM.d, h: OM.h, floors: 2, front: 1 })
  const adG = makeBuilding(zone, { x: ADMIN.x, z: ADMIN.z, w: ADMIN.w, d: ADMIN.d, h: ADMIN.h, floors: 3, front: 1 })
  const whG = makeBuilding(zone, { x: WAREHOUSE.x, z: WAREHOUSE.z, w: WAREHOUSE.w, d: WAREHOUSE.d, h: WAREHOUSE.h, floors: 1, front: 1 })
  const thG = makeBuilding(zone, { x: TOOLHOUSE.x, z: TOOLHOUSE.z, w: TOOLHOUSE.w, d: TOOLHOUSE.d, h: TOOLHOUSE.h, floors: 1, front: 1 })
  emsG.userData.deviceId = 'ems'
  omG.userData.deviceId = 'om'
  adG.userData.deviceId = 'admin'
  whG.userData.deviceId = 'warehouse'
  thG.userData.deviceId = 'toolhouse'

  /* EMS 控制中心 */
  {
    const { status, metrics } = facilityMetrics(77, 'ems')
    registerDevice({
      id: 'ems',
      group: '运行控制',
      name: 'EMS 控制中心',
      kind: 'ems',
      status,
      position: [EMS.x, EMS.h * 0.6 + 8, EMS.z],
      focusDist: 52,
      desc: '全站能量管理系统（EMS）：光伏、储能、PCS 与升压站统一调度，支撑一次调频与削峰填谷。',
      metrics
    })
  }
  /* 运维楼 */
  {
    const { status, metrics } = facilityMetrics(88, 'om')
    registerDevice({
      id: 'om',
      group: '运维设施',
      name: '运维楼',
      kind: 'om',
      status,
      position: [OM.x, OM.h * 0.6 + 8, OM.z],
      focusDist: 60,
      desc: '运行值班、监控大厅与备件仓储，承担日常巡检、检修工单与安全管理。',
      metrics
    })
  }
  /* 综合楼 */
  {
    registerDevice({
      id: 'admin',
      group: '运维设施',
      name: '综合楼',
      kind: 'om',
      status: '运行',
      position: [ADMIN.x, ADMIN.h * 0.6 + 8, ADMIN.z],
      focusDist: 50,
      desc: '集办公、会议、培训与生活配套于一体，三层框架结构，屋面设光伏遮阳。',
      metrics: [
        { label: '办公人数', value: '38', unit: '人' },
        { label: '会议室', value: '6', unit: '间' },
        { label: '室内温度', value: '24.2', unit: '℃' },
        { label: '用电负荷', value: '86.4', unit: 'kW' }
      ]
    })
  }

  /* 备品库 */
  {
    registerDevice({
      id: 'warehouse',
      group: '运维设施',
      name: '备品库',
      kind: 'om',
      status: '运行',
      position: [WAREHOUSE.x, WAREHOUSE.h + 8, WAREHOUSE.z],
      focusDist: 46,
      desc: '存放组件、逆变器功率模块、电池 PACK 与常用备件，配套恒温恒湿管理。',
      metrics: [
        { label: '库存种类', value: '146', unit: '项' },
        { label: '库容占用', value: '68.4', unit: '%', tone: 'good' },
        { label: '环境温度', value: '19.6', unit: '℃' },
        { label: '环境湿度', value: '46', unit: '%' }
      ]
    })
  }

  /* 工具间 */
  {
    registerDevice({
      id: 'toolhouse',
      group: '运维设施',
      name: '工具间',
      kind: 'om',
      status: '待机',
      position: [TOOLHOUSE.x, TOOLHOUSE.h + 8, TOOLHOUSE.z],
      focusDist: 38,
      desc: '存放检修工器具、清洗设备与常用耗材，靠近光伏区入口便于取用。',
      metrics: [
        { label: '工器具', value: '38', unit: '套' },
        { label: '清洗机组', value: '4', unit: '台', tone: 'good' },
        { label: '门禁状态', value: '正常', tone: 'good' },
        { label: '环境温度', value: '22.4', unit: '℃' }
      ]
    })
  }

  /* 主出入口 */  buildGate(zone)
  {
    const { status, metrics } = facilityMetrics(99, 'gate')
    registerDevice({
      id: 'gate-main',
      group: '运维设施',
      name: '主出入口',
      kind: 'gate',
      status,
      position: [GATE.x, 8, GATE.z],
      focusDist: 42,
      desc: '人员车辆出入通道，配置道闸、门禁与视频监控，与厂区周界报警联动。',
      metrics
    })
  }

  /* 路灯 */
  const lampCount = buildLamps(zone)
  config.lamps = lampCount

  /* 围墙 */
  const panels: THREE.BufferGeometry[] = []
  const posts: [number, number][] = []
  rectFence(panels, posts, SITE_FENCE.minX, SITE_FENCE.maxX, SITE_FENCE.minZ, SITE_FENCE.maxZ, 2.3, {
    axis: 'x',
    from: SITE_FENCE.gapX[0],
    to: SITE_FENCE.gapX[1],
    at: SITE_FENCE.maxZ
  })
  // 储能区围栏（电池柜 + PCS 场坪，南侧止于东西主干道）
  rectFence(panels, posts, -11, 57, -88, -49, 2.0)

  const panelMesh = new THREE.Mesh(merge(panels), fencePanelMat)
  panelMesh.name = 'fence-panels'
  zone.add(panelMesh)

  const postGeo = new THREE.BoxGeometry(0.14, 2.5, 0.14)
  postGeo.translate(0, 1.25, 0)
  const postMat = track(M.post.clone() as THREE.MeshLambertMaterial, C.fencePost, true)
  const postIM = new THREE.InstancedMesh(postGeo, postMat, posts.length)
  postIM.castShadow = true
  zone.add(postIM)
  setInstances(
    postIM,
    posts.map((p) => ({ p: [p[0], 0, p[1]] as [number, number, number] }))
  )
  postIM.computeBoundingSphere()

  /* 升压变电站：灰白砌体围墙圈出院落（南侧留进出闸口） */
  {
    const wallBody: THREE.BufferGeometry[] = []
    const wallCap: THREE.BufferGeometry[] = []
    rectWall(wallBody, wallCap, SUB.minX - 4, SUB.maxX + 4, SUB.minZ - 4, SUB.maxZ + 4, 2.3, {
      from: 96,
      to: 114
    })
    const body = new THREE.Mesh(merge(wallBody), M.wallDim)
    const cap = new THREE.Mesh(merge(wallCap), M.roofDark)
    for (const m of [body, cap]) {
      m.castShadow = true
      m.receiveShadow = true
      zone.add(m)
    }
    // 闸口门柱
    const piers: THREE.BufferGeometry[] = []
    pushBox(piers, 0.9, 3.2, 0.9, 96, 1.6, SUB.maxZ + 4)
    pushBox(piers, 0.9, 3.2, 0.9, 114, 1.6, SUB.maxZ + 4)
    const pm = new THREE.Mesh(merge(piers), M.wall)
    pm.castShadow = true
    pm.receiveShadow = true
    zone.add(pm)
  }

  void roads
  void rand

  return { lampCount }
}
