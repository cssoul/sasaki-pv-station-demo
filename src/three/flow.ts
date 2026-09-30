/**
 * flow.ts —— 能量流「实体化」
 * ---------------------------------------------------------------------------
 * ① 母线槽：沿道路/检修通道敷设的圆管（TubeGeometry，按 DC/AC/储能 三色合并成 3 个 draw call）
 * ② 电流箭头：锥体沿管线匀速流动（3 个 InstancedMesh，逐帧更新矩阵），方向即能量流向
 * ③ 架空线路：门型构架 → 铁塔 → 场外，悬链线 Tube
 */
import * as THREE from 'three'
import { M } from './materials'
import { SUB, TOWER, PV, PV_AREA, INVERTER, BATTERY, PCS, COMBINER } from './layout'
import { RoundedPath, merge, setInstances } from './utils'
import { config } from '../data/mock'

const FLOW_Y = 0.55
const TUBE_R = 0.2
/** 箭头前进速度（m/s） */
const ARROW_SPEED = 11
/** 箭头间距（m） */
const ARROW_GAP = 13

type Pt = [number, number]

interface FlowRoute {
  pts: Pt[]
  color: 'dc' | 'ac' | 'store'
  closed?: boolean
}

/** 三色管线定义（保持平行不重叠：同走廊内相互错开 ~2m） */
function buildRoutes(): FlowRoute[] {
  const routes: FlowRoute[] = []

  // —— 直流：3 条支路沿区块间检修道汇入光伏区东侧干道，再落进逆变器
  routes.push({
    color: 'dc',
    pts: [
      [-132, PV_AREA.minZ + 6],
      [-126, PV_AREA.minZ + 6],
      [-126, -84],
      [-17, -84],
      [-17, -112],
      [INVERTER.x0 - 3, -112]
    ]
  })
  routes.push({
    color: 'dc',
    pts: [
      [-80, PV_AREA.minZ + 6],
      [-74, PV_AREA.minZ + 6],
      [-74, -82],
      [-15, -82],
      [-15, -107],
      [INVERTER.x0 - 3, -107]
    ]
  })
  routes.push({
    color: 'dc',
    pts: [
      [-24, PV_AREA.minZ + 6],
      [-18, PV_AREA.minZ + 6],
      [-18, -80],
      [-18, -102],
      [INVERTER.x0 - 3, -102]
    ]
  })

  // —— 储能：电池柜 ↔ PCS 一一对应
  for (let i = 0; i < config.pcs.count; i++) {
    const bx = BATTERY.x0 + i * BATTERY.colPitch
    const px = PCS.x0 + i * PCS.pitch
    routes.push({
      color: 'store',
      pts: [
        [bx, BATTERY.z0 + 13],
        [bx, PCS.z0 - 3],
        [px, PCS.z0 - 3]
      ]
    })
  }

  // —— 交流：逆变器 / PCS → 东西主干道 → 东环 → 升压站
  routes.push({
    color: 'ac',
    pts: [
      [INVERTER.x0 + 28, INVERTER.z0 + 6],
      [53, INVERTER.z0 + 6],
      [53, -46.5],
      [62, -46.5],
      [62, -3],
      [142, -3],
      [142, -21]
    ]
  })
  routes.push({
    color: 'ac',
    pts: [
      [PCS.x0 + 30, PCS.z0 + 3],
      [55.5, PCS.z0 + 3],
      [55.5, -41.5],
      [64.5, -41.5],
      [64.5, -3],
      [108, -3],
      [108, -21]
    ]
  })

  return routes
}

/* ------------------------------------------------------------ 悬链线 */
function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const mid = a.clone().lerp(b, 0.5)
  mid.y -= sag
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

export interface FlowResult {
  group: THREE.Group
  update: (dt: number) => void
}

export function buildFlow(root: THREE.Object3D): FlowResult {
  const group = new THREE.Group()
  group.name = 'flow'
  root.add(group)

  const routes = buildRoutes()
  const paths: { path: RoundedPath; color: FlowRoute['color']; arrows: number[] }[] = []

  const tubeByColor: Record<string, THREE.BufferGeometry[]> = { dc: [], ac: [], store: [] }
  for (const r of routes) {
    const path = new RoundedPath(
      r.pts.map((p) => [p[0], FLOW_Y, p[1]] as [number, number, number]),
      4,
      6,
      !!r.closed
    )
    paths.push({ path, color: r.color, arrows: [] })
    const segs = Math.max(12, Math.round(path.total / 2.2))
    tubeByColor[r.color].push(new THREE.TubeGeometry(path, segs, TUBE_R, 7, false))
  }

  const matOf = { dc: M.wireDC, ac: M.wireAC, store: M.wireStore } as const
  for (const k of ['dc', 'ac', 'store'] as const) {
    if (!tubeByColor[k].length) continue
    const m = new THREE.Mesh(merge(tubeByColor[k]), matOf[k])
    m.name = `flow-${k}`
    group.add(m)
  }

  /* ---------------------------------------------------- 流动箭头 */
  const cone = new THREE.ConeGeometry(0.42, 1.25, 7)
  cone.rotateX(Math.PI / 2) // 尖端指向 +Z
  const arrowMat = { dc: M.arrowDC, ac: M.arrowAC, store: M.arrowStore } as const

  interface ArrowRec {
    route: number
    offset: number
  }
  const arrowRecs: Record<string, ArrowRec[]> = { dc: [], ac: [], store: [] }
  for (let i = 0; i < paths.length; i++) {
    const n = Math.max(2, Math.round(paths[i].path.total / ARROW_GAP))
    for (let k = 0; k < n; k++) arrowRecs[paths[i].color].push({ route: i, offset: k / n })
  }

  const arrowMeshes: Record<string, THREE.InstancedMesh> = {}
  for (const k of ['dc', 'ac', 'store'] as const) {
    const list = arrowRecs[k]
    if (!list.length) continue
    const im = new THREE.InstancedMesh(cone, arrowMat[k], list.length)
    im.frustumCulled = false
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    group.add(im)
    arrowMeshes[k] = im
  }

  const pos = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const mtx = new THREE.Matrix4()
  const Z = new THREE.Vector3(0, 0, 1)
  const scl = new THREE.Vector3(1, 1, 1)
  let clock = 0

  const update = (dt: number) => {
    clock += dt
    for (const k of ['dc', 'ac', 'store'] as const) {
      const im = arrowMeshes[k]
      if (!im) continue
      const list = arrowRecs[k]
      for (let i = 0; i < list.length; i++) {
        const rec = list[i]
        const p = paths[rec.route].path
        let t = (rec.offset + (clock * ARROW_SPEED) / p.total) % 1
        if (t < 0) t += 1
        p.getPoint(t, pos)
        p.tangentAt(t, tan)
        q.setFromUnitVectors(Z, tan)
        pos.y += 0.16
        mtx.compose(pos, q, scl)
        im.setMatrixAt(i, mtx)
      }
      im.instanceMatrix.needsUpdate = true
    }
  }
  update(0)

  /* ---------------------------------------------------- 架空线路 */
  const lineGeos: THREE.BufferGeometry[] = []
  const towers: { x: number; z: number; arms: [number, number][]; peak: number }[] = []
  const h = TOWER.h
  const arms: [number, number][] = [
    [h * 0.68, 13],
    [h * 0.82, 10.5],
    [h * 0.94, 8]
  ]
  for (let i = 0; i < config.tower.count; i++) {
    towers.push({ x: TOWER.x, z: TOWER.z + i * TOWER.dz, arms, peak: h + 4.5 })
  }

  // 门型构架 → 最近一塔（从绝缘子串下端起弧）
  const gantryZ = SUB.gantryZ
  const firstTower = towers[towers.length - 1]
  const gx = [SUB.minX + 12 + (SUB.maxX - SUB.minX - 24) * 0.18, SUB.minX + 12 + (SUB.maxX - SUB.minX - 24) * 0.5, SUB.minX + 12 + (SUB.maxX - SUB.minX - 24) * 0.82]
  const insulY = 14 - 0.9 - 7 * 0.24 - 0.25
  for (let a = 0; a < arms.length; a++) {
    const [ay, aw] = arms[a]
    for (let s = -1; s <= 1; s += 2) {
      const start = new THREE.Vector3(gx[a], insulY, gantryZ)
      const end = new THREE.Vector3(firstTower.x + s * aw, ay, firstTower.z)
      lineGeos.push(new THREE.TubeGeometry(catenary(start, end, 2.6), 26, 0.11, 5, false))
    }
  }

  // 塔间导线 + 地线
  for (let i = 0; i < towers.length - 1; i++) {
    const A = towers[towers.length - 1 - i]
    const B = towers[towers.length - 2 - i]
    for (let a = 0; a < arms.length; a++) {
      const [ay, aw] = arms[a]
      for (let s = -1; s <= 1; s += 2) {
        const start = new THREE.Vector3(A.x + s * aw, ay, A.z)
        const end = new THREE.Vector3(B.x + s * aw, ay, B.z)
        lineGeos.push(new THREE.TubeGeometry(catenary(start, end, 2.6), 30, 0.11, 5, false))
      }
    }
    for (let s = -1; s <= 1; s += 2) {
      const start = new THREE.Vector3(A.x + s * 1.6, A.peak, A.z)
      const end = new THREE.Vector3(B.x + s * 1.6, B.peak, B.z)
      lineGeos.push(new THREE.TubeGeometry(catenary(start, end, 2.2), 30, 0.08, 4, false))
    }
  }

  // 南端出线：笔直向南引出场地
  const south = towers[0]
  for (let a = 0; a < arms.length; a++) {
    const [ay, aw] = arms[a]
    for (let s = -1; s <= 1; s += 2) {
      const start = new THREE.Vector3(south.x + s * aw, ay, south.z)
      const end = new THREE.Vector3(south.x + s * aw, ay - 1.5, south.z + 78)
      lineGeos.push(new THREE.TubeGeometry(catenary(start, end, 2.4), 20, 0.11, 5, false))
    }
  }
  for (let s = -1; s <= 1; s += 2) {
    const start = new THREE.Vector3(south.x + s * 1.6, south.peak, south.z)
    const end = new THREE.Vector3(south.x + s * 1.6, south.peak - 1.2, south.z + 78)
    lineGeos.push(new THREE.TubeGeometry(catenary(start, end, 2.0), 20, 0.08, 4, false))
  }
  const lineMesh = new THREE.Mesh(merge(lineGeos), M.conductor)
  lineMesh.name = 'overhead-lines'
  group.add(lineMesh)

  /* 汇总给外部的统计 */
  const stats = {
    routeCount: routes.length,
    arrowCount: arrowRecs.dc.length + arrowRecs.ac.length + arrowRecs.store.length
  }
  void COMBINER
  void setInstances

  return { group, update, ...stats } as FlowResult & typeof stats
}
