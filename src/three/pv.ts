/**
 * pv.ts —— 光伏阵列区
 * ---------------------------------------------------------------------------
 * 性能策略：把「一行 24 块组件 + 支架」预合并成 2 个几何体（玻璃 / 钢结构），
 * 每个区块用 2 个 InstancedMesh 铺 6 行 → 全站 6 区块共 12 个 draw call，
 * 承载 config.pv 推导出的全部组件（默认 864 块）。
 * 每个区块 clone 一套材质，从而支持「整区高亮」。
 */
import * as THREE from 'three'
import { M, track } from './materials'
import { C } from './palette'
import { PV, pvBlockOrigin, pvBlockCenter, PV_BLOCK_COLS, PV_BLOCK_ROWS } from './layout'
import { config, registerDevice, pvMetrics } from '../data/mock'
import { merge, meshOf, setInstances } from './utils'

const DEG = Math.PI / 180

export interface PvBlock {
  id: string
  group: THREE.Group
  center: [number, number, number]
  mats: THREE.Material[]
  baseMats: THREE.Material[]
  meshes: THREE.Mesh[]
}

export interface PvResult {
  blocks: PvBlock[]
  moduleCount: number
}

/* ------------------------------------------------- 行几何（本地坐标，行心在原点） */
function buildRowGeometries() {
  const N = config.pv.modulesPerRow
  const a = config.pv.tiltDeg * DEG
  const L = PV.moduleL
  const half = (L / 2) * Math.sin(a)
  /** 抬升量：让组件南侧下沿正好落在 PV.lowEdge 高度 */
  const lift = PV.lowEdge + half
  const rowLen = (N - 1) * PV.modulePitch

  /* 组件（玻璃 + 背板 + 含边框贴图） */
  const glass: THREE.BufferGeometry[] = []
  for (let i = 0; i < N; i++) {
    const g = new THREE.BoxGeometry(PV.moduleW, PV.moduleT, L)
    g.rotateX(a)
    g.translate(-rowLen / 2 + i * PV.modulePitch, lift, 0)
    glass.push(g)
  }

  /* 支架：扭矩管 + 立柱 + 底板 */
  const struct: THREE.BufferGeometry[] = []
  const tube = new THREE.CylinderGeometry(PV.tubeR, PV.tubeR, rowLen + 0.6, 10)
  tube.rotateZ(Math.PI / 2)
  tube.translate(0, lift - PV.moduleT - PV.tubeR, 0)
  struct.push(tube)

  const legTop = lift - PV.moduleT - PV.tubeR * 2
  const legXs = N >= 12 ? [-rowLen / 2 + 0.5, 0, rowLen / 2 - 0.5] : [-rowLen / 2 + 0.5, rowLen / 2 - 0.5]
  for (const lx of legXs) {
    const leg = new THREE.BoxGeometry(PV.legSize, legTop, PV.legSize)
    leg.translate(lx, legTop / 2, 0)
    struct.push(leg)
    const plate = new THREE.BoxGeometry(0.42, 0.07, 0.42)
    plate.translate(lx, 0.035, 0)
    struct.push(plate)
  }

  return { glass: merge(glass), struct: merge(struct), rowLen, lift }
}

export function buildPv(root: THREE.Object3D): PvResult {
  const { glass, struct } = buildRowGeometries()
  const blocks: PvBlock[] = []
  const modulesPerBlock = config.pv.rowsPerBlock * config.pv.modulesPerRow

  for (let col = 0; col < PV_BLOCK_COLS; col++) {
    for (let row = 0; row < PV_BLOCK_ROWS; row++) {
      const id = `pv-${String.fromCharCode(65 + col)}${row + 1}`
      const [bx, bz] = pvBlockOrigin(col, row)
      const [cx, cz] = pvBlockCenter(col, row)
      const g = new THREE.Group()
      g.name = id
      g.position.set(cx, 0, bz) // 行在本地 X 居中、Z 从区块北边界起算
      g.userData.deviceId = id
      root.add(g)

      // 每个区块独立材质 → 支持整区高亮与整区压暗
      const glassMat = track(M.pvGlass.clone() as THREE.MeshLambertMaterial, '#ffffff', true)
      const steelMat = track(M.steel.clone() as THREE.MeshLambertMaterial, C.steelGrey, true)

      const glassMesh = new THREE.InstancedMesh(glass, glassMat, config.pv.rowsPerBlock)
      const structMesh = new THREE.InstancedMesh(struct, steelMat, config.pv.rowsPerBlock)
      for (const m of [glassMesh, structMesh]) {
        m.castShadow = true
        m.receiveShadow = false
        m.frustumCulled = true
        g.add(m)
      }

      const list = []
      for (let i = 0; i < config.pv.rowsPerBlock; i++) {
        list.push({ p: [0, 0, PV.rowInset + i * PV.rowPitch] as [number, number, number] })
      }
      setInstances(glassMesh, list)
      setInstances(structMesh, list)
      glassMesh.computeBoundingSphere()
      structMesh.computeBoundingSphere()

      const seed = 1000 + col * 37 + row * 91
      const { status, metrics } = pvMetrics(modulesPerBlock, seed)
      registerDevice({
        id,
        group: '光伏阵列区',
        name: `光伏阵列 ${String.fromCharCode(65 + col)}${row + 1} 区`,
        kind: 'pv',
        status,
        position: [cx, 8, cz],
        focusDist: 78,
        desc: `固定支架 ${config.pv.tiltDeg}° 倾角，${config.pv.rowsPerBlock} 排 × ${config.pv.modulesPerRow} 块 = ${modulesPerBlock} 块组件。`,
        metrics
      })

      // 记录区块中心（世界）用于电流路径起点
      blocks.push({
        id,
        group: g,
        center: [cx, 0, cz],
        mats: [glassMat, steelMat],
        baseMats: [M.pvGlass, M.steel],
        meshes: [glassMesh, structMesh]
      })

      void bx
    }
  }

  return { blocks, moduleCount: PV_BLOCK_COLS * PV_BLOCK_ROWS * modulesPerBlock }
}
