/**
 * engine.ts —— 场景引擎
 * 相机 / 光照 / 环境预设 / 轨道控制 / 射线拾取与高亮 / 丝滑聚焦 / 渲染循环统计
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { M, applyEnvTint, highlightOf, disposeMaterials } from './materials'
import { resolveEnv, type TimeKey, type WeatherKey } from './palette'
import { buildGround } from './ground'
import { buildPv } from './pv'
import { buildEquipment } from './equipment'
import { buildFacilities } from './buildings'
import { buildNature, updateSway } from './nature'
import { buildVehicles } from './vehicles'
import { buildFlow } from './flow'
import { WeatherSystem } from './weather'
import { SITE_CX, SITE_CZ } from './layout'
import { devices, getDevice, type Device } from '../data/mock'

const DEG = Math.PI / 180

export interface ViewPreset {
  id: string
  name: string
  target: [number, number, number]
  dist: number
  az: number
  el: number
  fov?: number
}

export const VIEWS: ViewPreset[] = [
  { id: 'overview', name: '全景视角', target: [4, 4, -16], dist: 430, az: 30, el: 40 },
  // 顶视总平面：与参考设计稿的构图一致，也最容易一眼看出「贴地图层越出底盘」这类问题
  { id: 'top', name: '顶视总平面', target: [10, 0, -12], dist: 800, az: 0, el: 88 },
  { id: 'pv', name: '光伏阵列', target: [-90, 8, -82], dist: 250, az: 26, el: 36 },
  { id: 'storage', name: '储能系统', target: [18, 8, -70], dist: 150, az: 24, el: 33 },
  { id: 'inverter', name: '逆变升压', target: [16, 8, -104], dist: 130, az: 42, el: 35 },
  { id: 'sub', name: '升压变电站', target: [112, 12, -64], dist: 205, az: 38, el: 34 },
  { id: 'line', name: '高压输电线路', target: [178, 26, -24], dist: 235, az: -24, el: 24 },
  { id: 'front', name: '厂前区', target: [20, 6, 56], dist: 235, az: 18, el: 27 },
  { id: 'level', name: '正面平视', target: [4, 10, -22], dist: 450, az: 3, el: 17 }
]

export interface EngineStats {
  fps: number
  calls: number
  tris: number
  modules: number
}

export interface EngineHost {
  onStats?: (s: EngineStats) => void
  onPick?: (d: Device | null) => void
}

export class Engine {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  ambient: THREE.AmbientLight

  private host: EngineHost
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private downPos = new THREE.Vector2()
  private clock = new THREE.Clock()
  private weather = new WeatherSystem()
  private time: TimeKey = 'noon'
  private weatherKey: WeatherKey = 'sunny'

  private vehicles?: ReturnType<typeof buildVehicles>
  private flow?: ReturnType<typeof buildFlow>

  private deviceRoots = new Map<string, THREE.Object3D>()
  private selectedId: string | null = null
  private swaps: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  private ring: THREE.Mesh
  private ringFill: THREE.Mesh
  private ringBase = 1

  private tween: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; k: number; dur: number; fov0: number; fov1: number } | null = null

  private frames = 0
  private acc = 0
  private fps = 0
  private disposed = false
  private modules = 0
  private shadowFrames = 3

  constructor(canvasHost: HTMLElement, host: EngineHost = {}) {
    this.host = host

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // SASAKI 风格需要「所见即所得」的高饱和平涂：关掉电影级色调映射，
    // 让光照总量刚好落在 1.0 附近，材质本色即最终色。
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.toneMappingExposure = 1.0
    canvasHost.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 1, 4200)
    this.camera.position.set(300, 400, 460)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.screenSpacePanning = false
    this.controls.minDistance = 26
    this.controls.maxDistance = 1400
    this.controls.maxPolarAngle = 84 * DEG
    this.controls.target.set(SITE_CX * 0, 6, -20)
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }

    /* 光照 */
    this.ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0xa8cf7c, 0.95)
    this.sun = new THREE.DirectionalLight(0xfff6e8, 2.0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    const sc = this.sun.shadow.camera
    sc.left = -260
    sc.right = 260
    sc.top = 260
    sc.bottom = -260
    sc.near = 10
    sc.far = 1600
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.55
    this.scene.add(this.ambient, this.hemi, this.sun, this.sun.target)

    /* 选中环 */
    const ringGeo = new THREE.RingGeometry(2.6, 3.4, 48)
    ringGeo.rotateX(-Math.PI / 2)
    this.ring = new THREE.Mesh(ringGeo, M.ring)
    this.ringFill = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40).rotateX(-Math.PI / 2), M.ringFill)
    this.ring.visible = false
    this.ringFill.visible = false
    this.ring.renderOrder = 5
    this.ringFill.renderOrder = 4
    this.scene.add(this.ring, this.ringFill)

    this.scene.fog = new THREE.Fog(0xdcecf8, 460, 1150)

    this.buildScene()
    this.applyEnv()
    this.gotoView('overview', true)

    window.addEventListener('resize', this.onResize)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.renderer.setAnimationLoop(this.tick)
  }

  /* ------------------------------------------------------------- 构建 */
  private buildScene() {
    const root = this.scene
    buildGround(root)
    const pv = buildPv(root)
    this.modules = pv.moduleCount
    buildEquipment(root)
    buildFacilities(root)
    buildNature(root)
    this.vehicles = buildVehicles(root)
    this.flow = buildFlow(root)
    root.add(this.weather.group)

    // 建立 deviceId → 根对象索引
    root.traverse((o) => {
      const id = o.userData && o.userData.deviceId
      if (id && !this.deviceRoots.has(id)) this.deviceRoots.set(id, o)
    })
  }

  /* ------------------------------------------------------------- 环境 */
  setTime(t: TimeKey) {
    this.time = t
    this.applyEnv()
  }
  setWeather(w: WeatherKey) {
    this.weatherKey = w
    this.applyEnv()
  }

  private applyEnv() {
    const env = resolveEnv(this.time, this.weatherKey)
    this.scene.background = new THREE.Color(env.sky)
    const fog = this.scene.fog as THREE.Fog
    fog.color.set(env.fog)
    fog.near = env.fogNear
    fog.far = env.fogFar

    this.hemi.color.set(env.hemiSky)
    this.hemi.groundColor.set(env.hemiGround)
    this.hemi.intensity = env.hemiIntensity
    this.ambient.intensity = env.ambient
    this.sun.color.set(env.sunColor)
    this.sun.intensity = env.sunIntensity
    const d = new THREE.Vector3(env.sunDir[0], env.sunDir[1], env.sunDir[2]).normalize()
    this.sun.position.copy(d).multiplyScalar(620).add(new THREE.Vector3(SITE_CX * 0.1, 0, SITE_CZ))
    this.sun.target.position.set(SITE_CX * 0.1, 0, SITE_CZ)
    this.sun.target.updateMatrixWorld()
    this.renderer.toneMappingExposure = env.exposure

    applyEnvTint({
      tint: env.tint,
      windowLight: env.windowLight,
      lampLight: env.lampLight,
      wet: env.wet,
      snow: env.snow
    })
    this.weather.set(env.rain, env.snow)

    // 光照变化 → 重算一次阴影贴图
    this.shadowFrames = 3
    this.renderer.shadowMap.needsUpdate = true
  }

  /* ------------------------------------------------------------ 视角 */
  private viewPos(v: ViewPreset) {
    const az = v.az * DEG
    const el = v.el * DEG
    const t = new THREE.Vector3(v.target[0], v.target[1], v.target[2])
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    return { target: t, pos: t.clone().add(dir.multiplyScalar(v.dist)) }
  }

  gotoView(id: string, instant = false) {
    const v = VIEWS.find((x) => x.id === id)
    if (!v) return
    const { target, pos } = this.viewPos(v)
    if (instant) {
      this.camera.position.copy(pos)
      this.controls.target.copy(target)
      this.camera.fov = v.fov ?? 28
      this.camera.updateProjectionMatrix()
      this.controls.update()
      this.tween = null
      return
    }
    this.tween = {
      p0: this.camera.position.clone(),
      p1: pos,
      t0: this.controls.target.clone(),
      t1: target,
      k: 0,
      dur: 1.15,
      fov0: this.camera.fov,
      fov1: v.fov ?? 28
    }
  }

  /** 聚焦到设备：保持当前观察方向，仅调整目标点与距离 —— 观感更连贯 */
  focusDevice(d: Device) {
    const target = new THREE.Vector3(d.position[0], d.position[1] * 0.45, d.position[2])
    const az = 30 * DEG
    const el = 33 * DEG
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const pos = target.clone().add(dir.multiplyScalar(d.focusDist))
    this.tween = {
      p0: this.camera.position.clone(),
      p1: pos,
      t0: this.controls.target.clone(),
      t1: target,
      k: 0,
      dur: 1.05,
      fov0: this.camera.fov,
      fov1: 30
    }
  }

  /* ------------------------------------------------------------ 拾取 */
  private onPointerDown = (e: PointerEvent) => {
    this.downPos.set(e.clientX, e.clientY)
  }

  private onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return
    const dx = e.clientX - this.downPos.x
    const dy = e.clientY - this.downPos.y
    if (dx * dx + dy * dy > 25) return // 拖拽旋转，不算点击
    this.pick(e.clientX, e.clientY)
  }

  pickAt(x: number, y: number) {
    this.pick(x, y)
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.scene.children, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o) {
        const id = o.userData && o.userData.deviceId
        if (id) {
          this.select(id)
          return
        }
        o = o.parent
      }
    }
    this.select(null)
  }

  select(id: string | null) {
    this.clearHighlight()
    this.selectedId = id
    if (!id) {
      this.ring.visible = false
      this.ringFill.visible = false
      this.host.onPick?.(null)
      return
    }
    const rootObj = this.deviceRoots.get(id)
    if (rootObj) {
      rootObj.traverse((o) => {
        const m = o as THREE.Mesh
        if ((m as any).isMesh && m.material) {
          this.swaps.push([m, m.material])
          if (Array.isArray(m.material)) m.material = m.material.map((mm) => highlightOf(mm))
          else m.material = highlightOf(m.material)
        }
      })
    }
    const d = getDevice(id)
    if (d) {
      const r = d.kind === 'pv' ? 19 : d.kind === 'transformer' ? 7 : 5
      this.ringBase = r / 3.2
      this.ring.scale.setScalar(this.ringBase)
      this.ringFill.scale.setScalar(this.ringBase)
      this.ring.position.set(d.position[0], 0.35, d.position[2])
      this.ringFill.position.set(d.position[0], 0.3, d.position[2])
      this.ring.visible = true
      this.ringFill.visible = true
      this.focusDevice(d)
    }
    this.host.onPick?.(d ?? null)
  }

  private clearHighlight() {
    for (const [mesh, mat] of this.swaps) mesh.material = mat as THREE.Material
    this.swaps.length = 0
  }

  /* ------------------------------------------------------------- 循环 */
  private onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private easeInOutCubic(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  private tick = () => {
    if (this.disposed) return
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime

    // 相机缓动
    if (this.tween) {
      const tw = this.tween
      tw.k = Math.min(1, tw.k + dt / tw.dur)
      const e = this.easeInOutCubic(tw.k)
      this.camera.position.lerpVectors(tw.p0, tw.p1, e)
      this.controls.target.lerpVectors(tw.t0, tw.t1, e)
      this.camera.fov = tw.fov0 + (tw.fov1 - tw.fov0) * e
      this.camera.updateProjectionMatrix()
      if (tw.k >= 1) this.tween = null
    }
    this.controls.update()

    this.vehicles?.update(dt)
    this.flow?.update(dt)
    this.weather.update(dt, this.controls.target)
    updateSway(t)

    // 选中环呼吸
    if (this.ring.visible) {
      const k = 1 + Math.sin(t * 3.1) * 0.07
      this.ring.scale.setScalar(this.ringBase * k)
      this.ringFill.scale.setScalar(this.ringBase * k)
      ;(M.ring as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(t * 3.1) * 0.26
      ;(M.ringFill as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 3.1) * 0.03
    }

    if (this.shadowFrames > 0) {
      this.shadowFrames--
      this.renderer.shadowMap.needsUpdate = true
    }

    this.renderer.render(this.scene, this.camera)

    /* 统计 */
    this.frames++
    this.acc += dt
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc
      this.frames = 0
      this.acc = 0
      this.host.onStats?.({
        fps: this.fps,
        calls: this.renderer.info.render.calls,
        tris: this.renderer.info.render.triangles,
        modules: this.modules
      })
    }
  }

  /* ------------------------------------------------------------- 工具 */
  project(v: THREE.Vector3, out: { x: number; y: number; visible: boolean }) {
    const p = v.clone().project(this.camera)
    const w = window.innerWidth
    const h = window.innerHeight
    out.x = (p.x * 0.5 + 0.5) * w
    out.y = (-p.y * 0.5 + 0.5) * h
    out.visible = p.z > -1 && p.z < 1
    return out
  }

  getStats(): EngineStats {
    return {
      fps: this.fps,
      calls: this.renderer.info.render.calls,
      tris: this.renderer.info.render.triangles,
      modules: this.modules
    }
  }

  get deviceCount() {
    return devices.length
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this.onResize)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.controls.dispose()
    disposeMaterials()
    this.weather.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if ((m as any).isMesh) {
        m.geometry?.dispose()
      }
    })
    this.renderer.dispose()
  }
}
