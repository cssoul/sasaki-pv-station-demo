/**
 * utils.ts —— 几何 / 曲线 / 程序化贴图工具箱
 * 全站所有资产都由这里的函数生成，零外部模型与贴图。
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/* ---------------------------------------------------------------- 缓存 */
const boxCache = new Map<string, THREE.BoxGeometry>()
const cylCache = new Map<string, THREE.CylinderGeometry>()

export function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w}|${h}|${d}`
  let g = boxCache.get(k)
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    boxCache.set(k, g)
  }
  return g
}

export function cyl(rt: number, rb: number, h: number, seg = 12, open = false): THREE.CylinderGeometry {
  const k = `${rt}|${rb}|${h}|${seg}|${open}`
  let g = cylCache.get(k)
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
    cylCache.set(k, g)
  }
  return g
}

/** 生成一个放到指定位置的盒体几何（用于后续 merge） */
export function boxAt(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rot?: { x?: number; y?: number; z?: number }
): THREE.BufferGeometry {
  const g = box(w, h, d).clone()
  if (rot) {
    if (rot.x) g.rotateX(rot.x)
    if (rot.y) g.rotateY(rot.y)
    if (rot.z) g.rotateZ(rot.z)
  }
  g.translate(x, y, z)
  return g
}

export function cylAt(
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  seg = 12,
  rot?: { x?: number; y?: number; z?: number }
): THREE.BufferGeometry {
  const g = cyl(r, r, h, seg).clone()
  if (rot) {
    if (rot.x) g.rotateX(rot.x)
    if (rot.y) g.rotateY(rot.y)
    if (rot.z) g.rotateZ(rot.z)
  }
  g.translate(x, y, z)
  return g
}

/** 安全合并（自动补齐属性，失败时回退为逐个返回） */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = geos.filter(Boolean) as THREE.BufferGeometry[]
  if (list.length === 0) return new THREE.BufferGeometry()
  if (list.length === 1) return list[0]
  // 统一为非索引化，避免属性不一致导致 merge 失败
  const normalized = list.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone()
    // 只保留 position / normal / uv，去掉多余属性
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', c.getAttribute('position'))
    const n = c.getAttribute('normal')
    if (n) out.setAttribute('normal', n)
    const uv = c.getAttribute('uv')
    if (uv) out.setAttribute('uv', uv)
    else {
      const count = c.getAttribute('position').count
      out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    }
    return out
  })
  const m = mergeGeometries(normalized, false)
  return m || normalized[0]
}

/** 把若干几何体合成一个 Mesh（单材质），并挂到 parent */
export function meshOf(
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  parent: THREE.Object3D,
  name = ''
): THREE.Mesh {
  const m = new THREE.Mesh(merge(geos), mat)
  m.name = name
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

/* ---------------------------------------------------------------- 曲线 */
/**
 * 带圆角的折线曲线：把直角折点替换成圆弧，视觉上像埋地电缆/母线槽。
 */
export class RoundedPath extends THREE.Curve<THREE.Vector3> {
  pts: THREE.Vector3[]
  private cum: number[] = []
  total = 0
  closed: boolean

  constructor(points: [number, number, number][] | THREE.Vector3[], radius = 3, seg = 6, closed = false) {
    super()
    this.closed = closed
    const raw = points.map((p) => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])))
    this.pts = closed ? roundClosed(raw, radius, seg) : roundOpen(raw, radius, seg)
    // 弧长表
    this.cum.push(0)
    let acc = 0
    for (let i = 1; i < this.pts.length; i++) {
      acc += this.pts[i].distanceTo(this.pts[i - 1])
      this.cum.push(acc)
    }
    this.total = acc
    this.arcLengthDivisions = this.pts.length
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const n = this.pts.length
    if (n === 0) return target.set(0, 0, 0)
    if (n === 1) return target.copy(this.pts[0])
    const d = (t < 0 ? 0 : t > 1 ? 1 : t) * this.total
    // 二分查段
    let lo = 0
    let hi = this.cum.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] <= d) lo = mid
      else hi = mid
    }
    const segLen = this.cum[hi] - this.cum[lo] || 1
    const u = (d - this.cum[lo]) / segLen
    return target.copy(this.pts[lo]).lerp(this.pts[hi], u)
  }

  /** 取得弧长 t 处的切线（用于箭头朝向） */
  tangentAt(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.getPoint(Math.max(0, t - 0.004))
    const b = this.getPoint(Math.min(1, t + 0.004))
    return target.copy(b).sub(a).normalize()
  }
}

function roundOpen(raw: THREE.Vector3[], radius: number, seg: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const n = raw.length
  for (let i = 0; i < n; i++) {
    const cur = raw[i]
    if (i === 0) {
      out.push(cur.clone())
      if (n > 1) out.push(cur.clone().lerp(raw[1], Math.min(0.5, radius / Math.max(1e-3, cur.distanceTo(raw[1])))))
      continue
    }
    if (i === n - 1) {
      const prev = raw[i - 1]
      out.push(cur.clone().lerp(prev, Math.min(0.5, radius / Math.max(1e-3, cur.distanceTo(prev)))))
      out.push(cur.clone())
      continue
    }
    const prev = raw[i - 1]
    const next = raw[i + 1]
    const dIn = cur.distanceTo(prev)
    const dOut = cur.distanceTo(next)
    const rIn = Math.min(radius, dIn * 0.45)
    const rOut = Math.min(radius, dOut * 0.45)
    const a = cur.clone().lerp(prev, rIn / Math.max(1e-3, dIn))
    const b = cur.clone().lerp(next, rOut / Math.max(1e-3, dOut))
    // 二次贝塞尔近似圆角
    for (let s = 0; s <= seg; s++) {
      const t = s / seg
      const p = new THREE.Vector3()
      p.x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cur.x + t * t * b.x
      p.y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cur.y + t * t * b.y
      p.z = (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * cur.z + t * t * b.z
      out.push(p)
    }
  }
  return out
}

function roundClosed(raw: THREE.Vector3[], radius: number, seg: number): THREE.Vector3[] {
  const ext = raw.concat([raw[0], raw[1]])
  const out = roundOpen(ext, radius, seg).slice(0, -3)
  out.push(out[0].clone()) // 闭合回路：末点回到起点
  return out
}

/* ------------------------------------------------------- 程序化画布贴图 */
function canvas2d(w: number, h: number) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  return { cv, ctx }
}

function finish(cv: HTMLCanvasElement, repeatX = 1, repeatY = 1, aniso = 8) {
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.anisotropy = aniso
  tex.needsUpdate = true
  return tex
}

/** 光伏组件面板贴图：深蓝电池片 + 浅色栅线 + 银白边框 */
export function pvModuleTexture(): THREE.CanvasTexture {
  const W = 128
  const H = 256
  const { cv, ctx } = canvas2d(W, H)
  // 边框
  ctx.fillStyle = '#e3e8ee'
  ctx.fillRect(0, 0, W, H)
  const pad = 5
  const gx = pad
  const gy = pad
  const gw = W - pad * 2
  const gh = H - pad * 2
  // 电池片底色（上亮下暗，模拟倾斜受光）
  const grad = ctx.createLinearGradient(0, gy, 0, gy + gh)
  grad.addColorStop(0, '#5a89e6')
  grad.addColorStop(0.5, '#4a75d6')
  grad.addColorStop(1, '#3a5fc4')
  ctx.fillStyle = grad
  ctx.fillRect(gx, gy, gw, gh)
  // 电池片横向切缝
  ctx.strokeStyle = 'rgba(214,226,248,0.92)'
  ctx.lineWidth = 1.6
  for (let i = 1; i < 12; i++) {
    const y = gy + (gh / 12) * i
    ctx.beginPath()
    ctx.moveTo(gx, y)
    ctx.lineTo(gx + gw, y)
    ctx.stroke()
  }
  // 竖向细栅线
  ctx.strokeStyle = 'rgba(168,192,238,0.6)'
  ctx.lineWidth = 1.1
  for (let i = 1; i < 6; i++) {
    const x = gx + (gw / 6) * i
    ctx.beginPath()
    ctx.moveTo(x, gy)
    ctx.lineTo(x, gy + gh)
    ctx.stroke()
  }
  // 主栅（竖向汇流带）
  ctx.strokeStyle = 'rgba(238,244,255,0.9)'
  ctx.lineWidth = 3
  for (const f of [0.18, 0.5, 0.82]) {
    const x = gx + gw * f
    ctx.beginPath()
    ctx.moveTo(x, gy)
    ctx.lineTo(x, gy + gh)
    ctx.stroke()
  }
  return finish(cv, 1, 1)
}

/** 水泥 / 混凝土散水贴图（细颗粒） */
export function concreteTexture(seed = 7): THREE.CanvasTexture {
  const S = 256
  const { cv, ctx } = canvas2d(S, S)
  ctx.fillStyle = '#d3d0c7'
  ctx.fillRect(0, 0, S, S)
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const a = rnd()
    ctx.fillStyle = a > 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.1})` : `rgba(150,146,138,${0.05 + rnd() * 0.12})`
    ctx.fillRect(x, y, 1.2 + rnd() * 2.2, 1.2 + rnd() * 2.2)
  }
  return finish(cv, 4, 4)
}

/** 草地微噪点（很淡，避免 SASAKI 风格被纹理抢戏） */
export function grassTexture(): THREE.CanvasTexture {
  const S = 256
  const { cv, ctx } = canvas2d(S, S)
  ctx.fillStyle = '#a6c86e'
  ctx.fillRect(0, 0, S, S)
  let s = 99
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const r = 3 + rnd() * 9
    ctx.fillStyle = rnd() > 0.5 ? `rgba(196,220,150,${0.08 + rnd() * 0.12})` : `rgba(128,158,78,${0.06 + rnd() * 0.12})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return finish(cv, 26, 20)
}

/** 接触阴影（软椭圆，给动态车辆用） */
export function blobShadowTexture(): THREE.CanvasTexture {
  const S = 128
  const { cv, ctx } = canvas2d(S, S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(24,34,30,0.55)')
  g.addColorStop(0.5, 'rgba(24,34,30,0.28)')
  g.addColorStop(1, 'rgba(24,34,30,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 围栏网片贴图（细密方孔，透明底） */
export function fenceTexture(): THREE.CanvasTexture {
  const S = 64
  const { cv, ctx } = canvas2d(S, S)
  ctx.clearRect(0, 0, S, S)
  ctx.strokeStyle = 'rgba(228,232,229,0.95)'
  ctx.lineWidth = 1.6
  for (let i = 0; i <= S; i += 8) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, S)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(S, i)
    ctx.stroke()
  }
  // 偶发加深，避免完全机械
  ctx.strokeStyle = 'rgba(190,198,194,0.5)'
  ctx.lineWidth = 2.4
  for (let i = 0; i <= S; i += 16) {
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(S, i)
    ctx.stroke()
  }
  return finish(cv, 1, 1, 4)
}

/** 夜间窗光贴图（楼宇立面发光格） */
export function windowLightTexture(cols = 6, rows = 3): THREE.CanvasTexture {
  const cw = 32
  const ch = 32
  // 背景保持全透明：夜间直接叠加在幕墙前，白天 opacity=0 完全隐藏
  const { cv, ctx } = canvas2d(cols * cw, rows * ch)
  ctx.clearRect(0, 0, cv.width, cv.height)
  let s = 1234
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() > 0.42) {
        const warm = rnd()
        ctx.fillStyle = warm > 0.75 ? '#ffe6b4' : warm > 0.4 ? '#ffd58c' : '#cfe2ff'
        ctx.globalAlpha = 0.65 + rnd() * 0.35
        ctx.fillRect(c * cw + 5, r * ch + 8, cw - 10, ch - 18)
        ctx.globalAlpha = 1
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/* ---------------------------------------------------------------- 随机 */
export function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------- 桁架杆件 */
const _va = new THREE.Vector3()
const _vb = new THREE.Vector3()
const _vd = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _q = new THREE.Quaternion()

/** 生成一根连接 a→b 的圆管（用于铁塔、门型构架的桁架） */
export function strut(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r = 0.09,
  seg = 5
): THREE.BufferGeometry {
  _va.set(ax, ay, az)
  _vb.set(bx, by, bz)
  _vd.subVectors(_vb, _va)
  const len = _vd.length() || 0.001
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false)
  _q.setFromUnitVectors(_up, _vd.normalize())
  g.applyQuaternion(_q)
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
  return g
}

/** 带 UV 缩放的竖平面（围栏网片用） */
export function uvPlane(w: number, h: number, repX: number, repY: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * repX, uv.getY(i) * repY)
  }
  uv.needsUpdate = true
  return g
}

/** 从 a 到 b 的竖直平面（用于沿折线布置围栏网片） */
export function uvPlaneBetween(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h: number,
  y: number,
  repPerMeter = 0.5,
  repY = 2
): THREE.BufferGeometry {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  const g = uvPlane(len, h, Math.max(1, Math.round(len * repPerMeter)), repY)
  const ang = Math.atan2(dx, dz)
  g.rotateY(ang + Math.PI / 2)
  g.translate((ax + bx) / 2, y + h / 2, (az + bz) / 2)
  return g
}

/** 一次性写入 InstancedMesh 的所有实例矩阵 */export function setInstances(
  im: THREE.InstancedMesh,
  list: { p: [number, number, number]; ry?: number; s?: number | [number, number, number] }[]
) {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  for (let i = 0; i < list.length; i++) {
    const it = list[i]
    e.set(0, it.ry ?? 0, 0)
    q.setFromEuler(e)
    pos.set(it.p[0], it.p[1], it.p[2])
    if (it.s == null) scl.set(1, 1, 1)
    else if (typeof it.s === 'number') scl.set(it.s, it.s, it.s)
    else scl.set(it.s[0], it.s[1], it.s[2])
    m.compose(pos, q, scl)
    im.setMatrixAt(i, m)
  }
  im.instanceMatrix.needsUpdate = true
  im.count = list.length
}

/* ------------------------------------------------------------------ 自检 */

/** dev 环境标志（构建产物里恒为 false，自检代码会被摇掉） */
const IS_DEV = (import.meta as any).env?.DEV ?? false

/**
 * 贴地图层自检：确认物体没有越出微缩底盘的草地范围。
 *
 * 「草地色块 / 防风林带飘到底盘外面压到天空上」是这类微缩场景最典型的硬伤，
 * 而且只在特定俯角才看得见，肉眼很容易漏。这里在 dev 环境主动报出来。
 * 传入底盘的世界包围盒（minX / maxX / minZ / maxZ）。
 */
export function assertOnPlate(
  obj: THREE.Object3D,
  label: string,
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  pad = 0.5
) {
  if (!IS_DEV) return true
  const b = new THREE.Box3().setFromObject(obj)
  const ok =
    b.min.x >= box.minX - pad && b.max.x <= box.maxX + pad && b.min.z >= box.minZ - pad && b.max.z <= box.maxZ + pad
  if (!ok) {
    console.warn(
      `[plate] ${label} 越出微缩底盘：` +
        `x[${b.min.x.toFixed(1)}, ${b.max.x.toFixed(1)}] z[${b.min.z.toFixed(1)}, ${b.max.z.toFixed(1)}] vs ` +
        `底盘 x[${box.minX.toFixed(1)}, ${box.maxX.toFixed(1)}] z[${box.minZ.toFixed(1)}, ${box.maxZ.toFixed(1)}]`
    )
  }
  return ok
}

/**
 * 同上，但用于逐点散布（树 / 灌木这类 InstancedMesh 无法靠 Box3 判断实例位置）。
 * 返回越界的点数量，并在 dev 环境打印一次汇总。
 */
export function assertPointsOnPlate(
  points: [number, number][],
  label: string,
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  pad = 0
): number {
  if (!IS_DEV) return 0
  let bad = 0
  let worst = ''
  for (const [x, z] of points) {
    if (x < box.minX + pad || x > box.maxX - pad || z < box.minZ + pad || z > box.maxZ - pad) {
      bad++
      if (!worst) worst = `(${x.toFixed(1)}, ${z.toFixed(1)})`
    }
  }
  if (bad > 0) {
    console.warn(
      `[plate] ${label} 有 ${bad} 个点越出微缩底盘，首个：${worst}；` +
        `底盘 x[${box.minX.toFixed(1)}, ${box.maxX.toFixed(1)}] z[${box.minZ.toFixed(1)}, ${box.maxZ.toFixed(1)}]`
    )
  }
  return bad
}
