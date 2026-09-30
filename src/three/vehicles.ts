/**
 * vehicles.ts —— 巡检车 / 工程车 / 装载机
 * 车辆沿道路折线路径循环行驶（或往返），每台车带一张程序化软阴影贴片，
 * 从而在「阴影贴图冻结」的前提下依然有可信的接地感。
 * 数量由 config.vehicles 控制。
 */
import * as THREE from 'three'
import { M, track } from './materials'
import { C } from './palette'
import { RoundedPath, merge, blobShadowTexture, rand } from './utils'
import { PARKING, OM_PARKING } from './layout'
import { config, registerDevice, vehicleMetrics } from '../data/mock'

const shadowTex = blobShadowTexture()

/* --------------------------------------------------------------- 车身 */
interface CarGeos {
  body: THREE.BufferGeometry
  glass: THREE.BufferGeometry
  tyre: THREE.BufferGeometry
  accent: THREE.BufferGeometry
  size: [number, number]
}

function box(arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  arr.push(g)
}

function wheel(arr: THREE.BufferGeometry[], r: number, w: number, x: number, y: number, z: number) {
  const g = new THREE.CylinderGeometry(r, r, w, 12)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  arr.push(g)
  const hub: THREE.BufferGeometry[] = []
  void hub
}

function makePatrolCar(): CarGeos {
  const body: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const tyre: THREE.BufferGeometry[] = []
  const accent: THREE.BufferGeometry[] = []
  // 车身（前 +X）
  box(body, 4.5, 0.72, 1.92, 0, 0.72, 0)
  // 前引擎盖收窄
  box(body, 1.0, 0.42, 1.8, 1.85, 0.55, 0)
  // 车厢
  box(body, 2.35, 0.78, 1.78, -0.45, 1.42, 0)
  // 车窗
  box(glass, 2.1, 0.6, 1.82, -0.4, 1.46, 0)
  box(glass, 0.1, 0.62, 1.72, 0.75, 1.42, 0)
  // 轮眉 / 保险杠
  box(accent, 0.3, 0.34, 2.0, 2.28, 0.6, 0)
  box(accent, 0.3, 0.34, 2.0, -2.24, 0.6, 0)
  // 车顶警灯条
  box(accent, 0.9, 0.18, 1.2, -0.4, 1.9, 0)
  // 后视镜
  box(body, 0.16, 0.16, 0.36, 0.72, 1.5, 1.02)
  box(body, 0.16, 0.16, 0.36, 0.72, 1.5, -1.02)
  // 车轮
  wheel(tyre, 0.42, 0.3, 1.42, 0.42, 0.98)
  wheel(tyre, 0.42, 0.3, 1.42, 0.42, -0.98)
  wheel(tyre, 0.42, 0.3, -1.42, 0.42, 0.98)
  wheel(tyre, 0.42, 0.3, -1.42, 0.42, -0.98)
  return { body: merge(body), glass: merge(glass), tyre: merge(tyre), accent: merge(accent), size: [4.7, 0.7] }
}

function makeTruck(): CarGeos {
  const body: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const tyre: THREE.BufferGeometry[] = []
  const accent: THREE.BufferGeometry[] = []
  // 驾驶室
  box(body, 2.3, 2.1, 2.4, 3.0, 1.95, 0)
  box(glass, 0.12, 0.9, 2.15, 2.1, 2.6, 0)
  box(glass, 2.1, 0.8, 2.2, 3.0, 2.7, 0)
  // 货箱
  box(body, 6.2, 2.3, 2.5, -1.3, 2.1, 0)
  box(accent, 6.3, 0.16, 2.6, -1.3, 1.0, 0)
  // 底盘
  box(body, 8.6, 0.4, 2.2, 0, 0.9, 0)
  box(accent, 0.3, 0.5, 2.5, 4.25, 1.1, 0)
  wheel(tyre, 0.56, 0.4, 3.1, 0.56, 1.18)
  wheel(tyre, 0.56, 0.4, 3.1, 0.56, -1.18)
  wheel(tyre, 0.56, 0.4, -2.6, 0.56, 1.18)
  wheel(tyre, 0.56, 0.4, -2.6, 0.56, -1.18)
  wheel(tyre, 0.56, 0.4, -3.7, 0.56, 1.18)
  wheel(tyre, 0.56, 0.4, -3.7, 0.56, -1.18)
  return { body: merge(body), glass: merge(glass), tyre: merge(tyre), accent: merge(accent), size: [9.2, 0.9] }
}

function makeLoader(): CarGeos {
  const body: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const tyre: THREE.BufferGeometry[] = []
  const accent: THREE.BufferGeometry[] = []
  box(accent, 2.6, 0.9, 1.9, 0, 1.0, 0)
  box(accent, 1.5, 1.3, 1.7, -1.3, 2.0, 0)
  box(glass, 1.4, 0.9, 1.72, -1.3, 2.1, 0)
  // 铲斗
  const bucket = new THREE.BoxGeometry(1.3, 0.7, 2.4)
  bucket.rotateZ(-0.35)
  bucket.translate(2.9, 0.75, 0)
  accent.push(bucket)
  const arm = new THREE.BoxGeometry(2.6, 0.28, 0.28)
  arm.rotateZ(0.28)
  arm.translate(1.6, 1.5, 0.78)
  accent.push(arm)
  const arm2 = new THREE.BoxGeometry(2.6, 0.28, 0.28)
  arm2.rotateZ(0.28)
  arm2.translate(1.6, 1.5, -0.78)
  accent.push(arm2)
  wheel(tyre, 0.68, 0.5, 1.2, 0.68, 1.15)
  wheel(tyre, 0.68, 0.5, 1.2, 0.68, -1.15)
  wheel(tyre, 0.95, 0.6, -1.6, 0.95, 1.25)
  wheel(tyre, 0.95, 0.6, -1.6, 0.95, -1.25)
  return { body: merge(body), glass: merge(glass), tyre: merge(tyre), accent: merge(accent), size: [4.2, 1.4] }
}

/* --------------------------------------------------------------- 路径 */
export interface PathDef {
  points: [number, number][]
  closed: boolean
  radius?: number
}

function buildPaths(): PathDef[] {
  return [
    // A：厂区大环线（南主干道 ↔ 东西主干道 ↔ 西环 / 东环）
    {
      closed: true,
      radius: 9,
      points: [
        [-166, -44],
        [62, -44],
        [62, 122],
        [-166, 122]
      ]
    },
    // B：光伏区环线
    {
      closed: true,
      radius: 8,
      points: [
        [-171, -130],
        [-15, -130],
        [-15, -44],
        [-171, -44]
      ]
    },
    // C：设备区连接路（往返）
    {
      closed: false,
      radius: 6,
      points: [
        [53, -44],
        [53, -110]
      ]
    },
    // D：升压站进出路（往返）
    {
      closed: false,
      radius: 6,
      points: [
        [66, -3],
        [160, -3]
      ]
    },
    // E：厂前区（往返）
    {
      closed: false,
      radius: 6,
      points: [
        [-96, 34],
        [96, 34]
      ]
    }
  ]
}

/* --------------------------------------------------------------- 车辆 */
export interface Vehicle {
  group: THREE.Group
  path: RoundedPath
  t: number
  speed: number
  dir: number
  closed: boolean
  lane: number
  shadow: THREE.Mesh
  wheelSpin: number
  device: ReturnType<typeof registerDevice>
}

export interface VehiclesResult {
  vehicles: Vehicle[]
  update: (dt: number) => void
}

export function buildVehicles(root: THREE.Object3D): VehiclesResult {
  const group = new THREE.Group()
  group.name = 'vehicles'
  root.add(group)

  const carG = makePatrolCar()
  const truckG = makeTruck()
  const loaderG = makeLoader()
  const defs = buildPaths()
  const paths = defs.map(
    (p) => new RoundedPath(p.points.map((q) => [q[0], 0.06, q[1]] as [number, number, number]), p.radius ?? 8, 7, p.closed)
  )
  const closedFlags = defs.map((p) => p.closed)

  const rnd = rand(515151)
  const vehicles: Vehicle[] = []

  const addVehicle = (
    geos: CarGeos,
    pathIdx: number,
    t0: number,
    speed: number,
    lane: number,
    id: string,
    name: string,
    groupName: string,
    kind: 'vehicle',
    isTruck = false,
    seed = 1
  ) => {
    const g = new THREE.Group()
    g.name = id
    group.add(g)
    const mBody = track(M.carWhite.clone() as THREE.MeshPhongMaterial, C.carWhite, true, 90)
    const mTyre = track(M.tyre.clone() as THREE.MeshLambertMaterial, C.tyre, true)
    const mGlass = track(M.carGlass.clone() as THREE.MeshPhongMaterial, '#546a80', true, 110)
    const mAcc = track(M.carOrange.clone() as THREE.MeshLambertMaterial, C.carOrange, true)
    const mb = new THREE.Mesh(geos.body, mBody)
    const mt = new THREE.Mesh(geos.tyre, mTyre)
    const mg = new THREE.Mesh(geos.glass, mGlass)
    const ma = new THREE.Mesh(geos.accent, mAcc)
    for (const m of [mb, mt, mg, ma]) {
      m.castShadow = false
      m.receiveShadow = false
      g.add(m)
    }
    // 接地阴影
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(geos.size[0] * 1.5, geos.size[1] * 3.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false })
    )
    sh.rotation.x = -Math.PI / 2
    sh.position.y = 0.03
    sh.renderOrder = 1
    g.add(sh)

    const { status, metrics } = vehicleMetrics(seed * 17 + 3, isTruck)
    const dev = registerDevice({
      id,
      group: groupName,
      name,
      kind,
      status,
      position: [0, 2.4, 0], // 每帧由 update 刷新
      focusDist: isTruck ? 30 : 22,
      desc: isTruck ? '承担组件、备件与物资的场内转运。' : '车载终端上报定位与状态，按区段执行红外测温与组件巡检。',
      metrics
    })

    vehicles.push({
      group: g,
      path: paths[pathIdx],
      t: t0,
      speed,
      dir: 1,
      closed: closedFlags[pathIdx],
      lane,
      shadow: sh,
      wheelSpin: 0,
      device: dev
    })
  }

  // 巡检车
  for (let i = 0; i < config.vehicles.patrol; i++) {
    const pathIdx = i % 2 === 0 ? 0 : i === 1 ? 1 : 4
    addVehicle(
      carG,
      pathIdx,
      (i * 0.37) % 1,
      8.5 + rnd() * 4,
      i % 2 === 0 ? 3.2 : -3.2,
      `patrol-${i + 1}`,
      `巡检车 EV-${String(i + 1).padStart(2, '0')}`,
      '巡检车辆',
      'vehicle',
      false,
      9000 + i
    )
  }
  // 工程车
  for (let i = 0; i < config.vehicles.truck; i++) {
    addVehicle(
      truckG,
      0,
      (i * 0.21 + 0.55) % 1,
      7 + rnd() * 3,
      i % 2 === 0 ? -3.4 : 3.4,
      `truck-${i + 1}`,
      `工程车 TR-${String(i + 1).padStart(2, '0')}`,
      '巡检车辆',
      'vehicle',
      true,
      9500 + i
    )
  }
  // 装载机（固定作业，缓慢原地转向）
  for (let i = 0; i < config.vehicles.loader; i++) {
    addVehicle(
      loaderG,
      2,
      0.9,
      0,
      0,
      `loader-${i + 1}`,
      `装载机 LD-${String(i + 1).padStart(2, '0')}`,
      '巡检车辆',
      'vehicle',
      true,
      9800 + i
    )
  }

  /* ------------------------------------------------ 停放车辆（静态，投真阴影） */
  const mTyreShared = track(M.tyre.clone() as THREE.MeshLambertMaterial, C.tyre, true)
  const mGlassShared = track(M.carGlass.clone() as THREE.MeshPhongMaterial, '#546a80', true, 110)
  const mAccentShared = track(M.carOrange.clone() as THREE.MeshLambertMaterial, C.carOrange, true)
  const mBodyVariants = [C.carWhite, '#dfe3e6', '#c9d2d8', '#e8ecef'].map((hex) =>
    track(new THREE.MeshPhongMaterial({ color: hex, shininess: 90, specular: 0xb8c4cc }), hex, true, 90)
  )
  const rndP = rand(778899)
  const parkCar = (
    geos: CarGeos,
    x: number,
    z: number,
    ry: number,
    bodyMat: THREE.Material
  ) => {
    const g = new THREE.Group()
    g.position.set(x, 0.06, z)
    g.rotation.y = ry
    const mb = new THREE.Mesh(geos.body, bodyMat)
    const mt = new THREE.Mesh(geos.tyre, mTyreShared)
    const mg = new THREE.Mesh(geos.glass, mGlassShared)
    const ma = new THREE.Mesh(geos.accent, mAccentShared)
    for (const m of [mb, mt, mg, ma]) {
      m.castShadow = true
      m.receiveShadow = false
      g.add(m)
    }
    group.add(g)
  }
  const parkRow = (p: { x: number; z: number; cols: number }, count: number) => {
    const bw = 2.6
    const cols = Math.min(p.cols, 9)
    const startX = p.x - ((cols - 1) * bw) / 2
    const rows = [p.z - 3.6, p.z + 3.6]
    let placed = 0
    for (let r = 0; r < 2 && placed < count; r++) {
      for (let i = 0; i < cols && placed < count; i++) {
        if (rndP() < 0.22) continue
        parkCar(
          carG,
          startX + i * bw,
          rows[r],
          rows[r] < p.z ? -Math.PI / 2 : Math.PI / 2,
          mBodyVariants[Math.floor(rndP() * mBodyVariants.length)]
        )
        placed++
      }
    }
  }
  parkRow(PARKING, config.parking.cars)
  parkRow(OM_PARKING, 6)

  const tmp = new THREE.Vector3()
  const tan = new THREE.Vector3()

  const update = (dt: number) => {
    for (const v of vehicles) {
      if (v.speed > 0) {
        const dLen = (v.speed * dt) / v.path.total
        v.t += dLen * v.dir
        if (v.closed) {
          if (v.t > 1) v.t -= 1
          if (v.t < 0) v.t += 1
        } else {
          if (v.t > 1) {
            v.t = 1
            v.dir = -1
          }
          if (v.t < 0) {
            v.t = 0
            v.dir = 1
          }
        }
      }
      v.path.getPoint(v.t, tmp)
      v.path.tangentAt(v.t, tan)
      if (v.dir < 0) tan.multiplyScalar(-1)
      // 车道偏移
      const px = -tan.z
      const pz = tan.x
      v.group.position.set(tmp.x + px * v.lane, 0.06, tmp.z + pz * v.lane)
      v.group.rotation.y = Math.atan2(-tan.z, tan.x)
      v.wheelSpin += dt * 6
      // 同步设备坐标，供拾取与相机聚焦使用
      v.device.position[0] = v.group.position.x
      v.device.position[1] = 2.4
      v.device.position[2] = v.group.position.z
    }
  }
  update(0)

  return { vehicles, update }
}
