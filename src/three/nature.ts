/**
 * nature.ts —— 树木与灌木
 * 低模扁平着色（flatShading 的二十面体）+ GPU 顶点风摆，与 SASAKI 图的圆头树一致。
 * 三种树型各用 2 个 InstancedMesh（树干 / 树冠），全站仅 6 个 draw call。
 */
import * as THREE from 'three'
import { M, track } from './materials'
import { C } from './palette'
import {
  PV_AREA,
  COMBINER,
  INVERTER,
  BATTERY,
  PCS,
  EMS,
  OM,
  ADMIN,
  OM_PARKING,
  WAREHOUSE,
  TOOLHOUSE,
  SUB,
  PARKING,
  GATE,
  SITE,
  PLATE,
  roads,
  TOWER
} from './layout'
import { merge, setInstances, rand, assertPointsOnPlate } from './utils'
import { config } from '../data/mock'

/* ------------------------------------------------------------- 风摆注入 */
let swayUniforms: { uTime: { value: number }; uSway: { value: number } } | null = null

function applySway(mat: THREE.Material, amount: number) {
  const m = mat as THREE.MeshLambertMaterial
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayUniforms!.uTime
    shader.uniforms.uSway = { value: amount }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uSway;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = iPos.x * 0.17 + iPos.z * 0.23;
          float amp = uSway * smoothstep(0.6, 5.0, transformed.y);
          transformed.x += (sin(uTime * 1.05 + ph) * 0.6 + sin(uTime * 0.53 + ph * 1.7) * 0.4) * amp;
          transformed.z += (sin(uTime * 0.87 + ph * 1.3) * 0.5) * amp;
        #endif`
      )
  }
  m.customProgramCacheKey = () => `sway-${amount}`
}

export function initSway() {
  swayUniforms = { uTime: { value: 0 }, uSway: { value: 1 } }
}
export function updateSway(t: number) {
  if (swayUniforms) swayUniforms.uTime.value = t
}

/* ------------------------------------------------------------- 几何定义 */
interface TreeGeos {
  trunk: THREE.BufferGeometry
  leaf: THREE.BufferGeometry
  /** 供实例着色的基准色 */
  tint: string
}

function makeTreeA(): TreeGeos {
  const trunkG: THREE.BufferGeometry[] = []
  const t = new THREE.CylinderGeometry(0.2, 0.32, 2.9, 6)
  t.translate(0, 1.45, 0)
  trunkG.push(t)
  const leafG: THREE.BufferGeometry[] = []
  const blobs: [number, number, number, number][] = [
    [0, 4.5, 0, 2.35],
    [-1.15, 3.7, 0.6, 1.5],
    [1.05, 3.9, -0.5, 1.6],
    [0.25, 5.9, 0.35, 1.35]
  ]
  for (const [x, y, z, s] of blobs) {
    const g = new THREE.IcosahedronGeometry(s, 0)
    g.scale(1, 0.92, 1)
    g.translate(x, y, z)
    leafG.push(g)
  }
  return { trunk: merge(trunkG), leaf: merge(leafG), tint: C.leafA }
}

function makeTreeB(): TreeGeos {
  const trunkG: THREE.BufferGeometry[] = []
  const t = new THREE.CylinderGeometry(0.17, 0.26, 3.6, 6)
  t.translate(0, 1.8, 0)
  trunkG.push(t)
  const leafG: THREE.BufferGeometry[] = []
  const a = new THREE.IcosahedronGeometry(1.9, 0)
  a.scale(1.0, 1.55, 1.0)
  a.translate(0, 5.6, 0)
  leafG.push(a)
  const b = new THREE.IcosahedronGeometry(1.25, 0)
  b.translate(0, 7.6, 0)
  leafG.push(b)
  return { trunk: merge(trunkG), leaf: merge(leafG), tint: C.leafC }
}

function makeShrub(): TreeGeos {
  const leafG: THREE.BufferGeometry[] = []
  for (const [x, y, z, s] of [
    [0, 0.75, 0, 0.95],
    [0.75, 0.6, 0.35, 0.65],
    [-0.6, 0.62, -0.3, 0.7]
  ] as [number, number, number, number][]) {
    const g = new THREE.IcosahedronGeometry(s, 0)
    g.scale(1.1, 0.85, 1.1)
    g.translate(x, y, z)
    leafG.push(g)
  }
  return { trunk: new THREE.BufferGeometry(), leaf: merge(leafG), tint: C.leafD }
}

/* --------------------------------------------------------------- 排除区 */
type Rect = [number, number, number, number] // minX, maxX, minZ, maxZ

function margin(r: Rect, m: number): Rect {
  return [r[0] - m, r[1] + m, r[2] - m, r[3] + m]
}

function exclusionRects(): Rect[] {
  const list: Rect[] = [
    // 光伏与设备区
    [PV_AREA.minX - 8, PV_AREA.maxX + 8, PV_AREA.minZ - 8, PV_AREA.maxZ + 8],
    [COMBINER.x - 5, INVERTER.x0 + INVERTER.cols * INVERTER.colPitch, -124, -100],
    [BATTERY.x0 - 9, BATTERY.x0 + BATTERY.cols * BATTERY.colPitch + 3, BATTERY.z0 - 6, BATTERY.z0 + BATTERY.rowPitch + 6],
    [PCS.x0 - 6, PCS.x0 + config.pcs.count * PCS.pitch, PCS.z0 - 5, PCS.z0 + 5],
    // 建筑
    [EMS.x - EMS.w / 2 - 8, EMS.x + EMS.w / 2 + 8, EMS.z - EMS.d / 2 - 8, EMS.z + EMS.d / 2 + 8],
    [OM.x - OM.w / 2 - 8, OM.x + OM.w / 2 + 8, OM.z - OM.d / 2 - 8, OM.z + OM.d / 2 + 8],
    [ADMIN.x - ADMIN.w / 2 - 8, ADMIN.x + ADMIN.w / 2 + 8, ADMIN.z - ADMIN.d / 2 - 8, ADMIN.z + ADMIN.d / 2 + 8],
    [
      OM_PARKING.x - OM_PARKING.w / 2 - 4,
      OM_PARKING.x + OM_PARKING.w / 2 + 4,
      OM_PARKING.z - OM_PARKING.d / 2 - 4,
      OM_PARKING.z + OM_PARKING.d / 2 + 4
    ],
    [
      WAREHOUSE.x - WAREHOUSE.w / 2 - 6,
      WAREHOUSE.x + WAREHOUSE.w / 2 + 6,
      WAREHOUSE.z - WAREHOUSE.d / 2 - 6,
      WAREHOUSE.z + WAREHOUSE.d / 2 + 6
    ],
    [
      TOOLHOUSE.x - TOOLHOUSE.w / 2 - 6,
      TOOLHOUSE.x + TOOLHOUSE.w / 2 + 6,
      TOOLHOUSE.z - TOOLHOUSE.d / 2 - 6,
      TOOLHOUSE.z + TOOLHOUSE.d / 2 + 6
    ],
    // 升压站与铁塔
    [SUB.minX - 6, SUB.maxX + 6, SUB.minZ - 6, SUB.maxZ + 6],
    [TOWER.x - 12, TOWER.x + 12, TOWER.z + TOWER.dz * (config.tower.count - 1) - 14, TOWER.z + 14],
    // 停车场 / 大门
    [PARKING.x - PARKING.w / 2 - 6, PARKING.x + PARKING.w / 2 + 6, PARKING.z - PARKING.d / 2 - 6, PARKING.z + PARKING.d / 2 + 6],
    [GATE.x - 18, GATE.x + 22, GATE.z - 12, GATE.z + 12]
  ]
  // 道路（含路肩）
  for (const r of roads) {
    list.push([r.x - r.w / 2 - 3.5, r.x + r.w / 2 + 3.5, r.z - r.d / 2 - 3.5, r.z + r.d / 2 + 3.5])
  }
  return list
}

function inside(r: Rect, x: number, z: number) {
  return x > r[0] && x < r[1] && z > r[2] && z < r[3]
}

/* --------------------------------------------------------------- 构建 */
export function buildNature(root: THREE.Object3D) {
  initSway()

  const A = makeTreeA()
  const B = makeTreeB()
  const S = makeShrub()

  const leafA = track(M.leafA.clone() as THREE.MeshLambertMaterial, C.leafA, true)
  const leafB = track(M.leafB.clone() as THREE.MeshLambertMaterial, C.leafC, true)
  const leafS = track(M.leafD.clone() as THREE.MeshLambertMaterial, C.leafD, true)
  const leafM = track(M.leafC.clone() as THREE.MeshLambertMaterial, C.leafB, true)
  const trunkM = track(M.trunk.clone() as THREE.MeshLambertMaterial, C.trunk, true)
  applySway(leafA, 0.16)
  applySway(leafB, 0.14)
  applySway(leafS, 0.08)
  applySway(leafM, 0.16)

  const rnd = rand(20260930)
  const excl = exclusionRects().map((r) => margin(r, 0))

  const trees: { p: [number, number, number]; s: number; ry: number; t: number }[] = []
  const x0 = SITE.minX - 6
  const x1 = SITE.maxX + 6
  const z0 = SITE.minZ - 6
  const z1 = SITE.maxZ + 6
  let guard = 0
  while (trees.length < config.trees && guard < config.trees * 60) {
    guard++
    const x = x0 + rnd() * (x1 - x0)
    const z = z0 + rnd() * (z1 - z0)
    let ok = true
    for (const r of excl) {
      if (inside(r, x, z)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    // 简单的间距控制：与已有树保持 6m 以上
    let near = false
    for (let i = trees.length - 1; i >= 0 && i > trees.length - 40; i--) {
      const d = (trees[i].p[0] - x) ** 2 + (trees[i].p[2] - z) ** 2
      if (d < 36) {
        near = true
        break
      }
    }
    if (near) continue
    const roll = rnd()
    trees.push({
      p: [x, 0, z],
      s: 0.78 + rnd() * 0.55,
      ry: rnd() * Math.PI * 2,
      t: roll < 0.58 ? 0 : roll < 0.85 ? 1 : 2
    })
  }

  /* ------------------------------------------------- 站区外围防风林带
   * 设计稿里站区围墙之外是成片的绿色树林与田野，而不是空地。
   * 用两条环线林带（乔木为主）把微缩底盘"围"起来，成本只有 2 个 InstancedMesh。 */
  const belt = (bx0: number, bz0: number, bx1: number, bz1: number, step = 15) => {
    const len = Math.hypot(bx1 - bx0, bz1 - bz0)
    const n = Math.max(1, Math.round(len / step))
    for (let i = 0; i <= n; i++) {
      const k = i / n
      trees.push({
        p: [bx0 + (bx1 - bx0) * k + (rnd() - 0.5) * 6, 0, bz0 + (bz1 - bz0) * k + (rnd() - 0.5) * 6],
        s: 0.86 + rnd() * 0.62,
        ry: rnd() * Math.PI * 2,
        t: rnd() < 0.64 ? 1 : 0
      })
    }
  }
  {
    // 林带位置一律从「底盘边界」内缩反推，不要从 SITE 外扩 ——
    // 否则底盘一改尺寸，树就会站到草地外面飘在天空上。
    // 内缩量 = 视觉留白 + 树冠最大水平半径(≈5.3m) + 位置抖动(±3m) 的余量。
    const EDGE = 18 // 最外圈距底盘边缘的视觉留白
    const GAP = 20 // 两圈林带之间的间距
    const SAFE = 10 // 树冠半径 + 抖动余量
    const xA = PLATE.minX + EDGE + SAFE
    const xB = PLATE.maxX - EDGE - SAFE
    const zA = PLATE.minZ + EDGE + SAFE
    const zB = PLATE.maxZ - EDGE - SAFE
    belt(xA, zA, xB, zA) // 北侧两排
    belt(xA, zA + GAP, xB, zA + GAP)
    belt(xA, zB - GAP, xB, zB - GAP) // 市政道路以南两排
    belt(xA, zB, xB, zB)
    belt(xA, zA, xA, zB) // 西侧两列
    belt(xA + GAP, zA, xA + GAP, zB)
    belt(xB - GAP, zA, xB - GAP, zB) // 东侧两列
    belt(xB, zA, xB, zB)
  }

  const group = new THREE.Group()
  group.name = 'nature'
  root.add(group)

  // 自检：树木（含外围林带）必须站在底盘草地范围内。
  // pad = 6 是树冠水平半径的余量，避免树冠探出底盘外。
  assertPointsOnPlate(
    trees.map((t) => [t.p[0], t.p[2]] as [number, number]),
    '树木（含外围林带）',
    PLATE,
    6
  )

  const mkInst = (geo: THREE.BufferGeometry, mat: THREE.Material, subset: typeof trees) => {
    if (!geo.attributes.position || geo.attributes.position.count === 0) return null
    const im = new THREE.InstancedMesh(geo, mat, subset.length)
    im.castShadow = true
    im.receiveShadow = false
    group.add(im)
    setInstances(
      im,
      subset.map((t) => ({ p: t.p, ry: t.ry, s: t.s }))
    )
    im.computeBoundingSphere()
    // 轻微色相扰动，避免一片死绿
    const c = new THREE.Color()
    for (let i = 0; i < subset.length; i++) {
      const k = 0.9 + ((i * 37) % 21) / 100
      c.setRGB(k, k * (1 + (((i * 13) % 9) - 4) / 60), k * 0.98)
      im.setColorAt(i, c)
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    return im
  }

  const setA = trees.filter((t) => t.t === 0)
  const setB = trees.filter((t) => t.t === 1)
  const setS = trees.filter((t) => t.t === 2)

  mkInst(A.trunk, trunkM, setA)
  mkInst(A.leaf, leafA, setA)
  mkInst(B.trunk, trunkM, setB)
  mkInst(B.leaf, leafB, setB)
  mkInst(S.leaf, leafS, setS)
  void leafM

  return { total: trees.length }
}
