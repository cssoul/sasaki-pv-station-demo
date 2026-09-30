/**
 * materials.ts —— 全站材质库（单例复用）
 * ---------------------------------------------------------------------------
 * 设计要点：
 *  1) 所有材质集中在这里创建并复用，draw call 与 GPU 状态切换最小化；
 *  2) 时间/天气切换不重建材质——只改 color / emissive / specular 标量；
 *  3) 提供高亮材质族（懒创建），拾取设备时按「基材质」换装，取消时还原。
 */
import * as THREE from 'three'
import { C } from './palette'
import {
  pvModuleTexture,
  concreteTexture,
  grassTexture,
  windowLightTexture
} from './utils'

interface Entry {
  mat: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial
  base: THREE.Color
  /** 受时间/天气压暗影响（天空/水面等除外） */
  lit: boolean
  /** 原 shininess（雨天加点湿滑感） */
  shin?: number
}

const entries: Entry[] = []

function reg<M extends THREE.MeshLambertMaterial | THREE.MeshPhongMaterial>(m: M, hex: string, lit = true, shin?: number): M {
  entries.push({ mat: m, base: new THREE.Color(hex), lit, shin })
  return m
}

function lam(hex: string, opts: THREE.MeshLambertMaterialParameters = {}, lit = true) {
  return reg(new THREE.MeshLambertMaterial({ color: hex, ...opts }), hex, lit)
}

function pho(hex: string, opts: THREE.MeshPhongMaterialParameters = {}, lit = true) {
  const shin = (opts.shininess as number) ?? 16
  return reg(new THREE.MeshPhongMaterial({ color: hex, ...opts }), hex, lit, shin)
}

/**
 * 把外部克隆出来的材质纳入「时间/天气压暗」体系。
 * 需要按设备单独高亮的场合（如每个光伏区块一套材质），就 clone 后在这里登记。
 */
export function track<M extends THREE.MeshLambertMaterial | THREE.MeshPhongMaterial>(
  m: M,
  hex: string,
  lit = true,
  shin?: number
): M {
  return reg(m, hex, lit, shin)
}

/* ------------------------------------------------------------- 大地 */
export const grassTextureInst = grassTexture()
export const concreteTextureInst = concreteTexture()
export const pvTex = pvModuleTexture()
export const windowTex = windowLightTexture(8, 4)

export const M = {
  /* 大地 */
  grass: lam(C.grass, { map: grassTextureInst }),
  grassEdge: lam(C.grassBase),
  grassLight: lam(C.grassLight, { transparent: true, opacity: 0.2, depthWrite: false }),
  grassDeep: lam(C.grassDeep, { transparent: true, opacity: 0.16, depthWrite: false }),
  soil: lam(C.soil),

  /* 硬质铺装 */
  asphalt: pho(C.asphalt, { shininess: 8, specular: 0x2a2a26 }),
  concrete: pho(C.concrete, { map: concreteTextureInst, shininess: 6, specular: 0x222222 }),
  concretePlain: lam(C.concreteDark),
  pad: lam(C.concreteDark, { map: concreteTextureInst }),
  markWhite: lam(C.markWhite, { emissive: 0x000000 }),
  markWarm: lam(C.markWarm, { emissive: 0x000000 }),

  /* 光伏：颜色完全交给贴图，材质本色保持白（便于时间/天气整体压暗）
   * 刻意用 Lambert 而非 Phong —— 全站组件朝向一致，Phong 的镜面高光会在
   * 整个阵列上叠成一层均匀白雾，把钴蓝洗成灰蓝；SASAKI 是平涂风格，不要它。 */
  pvGlass: lam('#ffffff', { map: pvTex }),
  pvFrame: lam(C.pvFrame),
  steel: lam(C.steelGrey),
  steelDark: lam(C.steelDark),

  /* 建筑 */
  wall: lam(C.wall),
  wallDim: lam(C.wallSide),
  roof: lam(C.roof),
  roofDark: lam(C.roofDark),
  office: lam(C.office),
  band: pho(C.officeBand, { shininess: 60, specular: 0x8fb4dd }),
  bandDark: pho(C.officeBandDark, { shininess: 60, specular: 0x6f92bb }),
  glass: pho(C.glassDark, { shininess: 80, specular: 0x9ec0e8, transparent: true, opacity: 0.9 }),
  windowGlow: new THREE.MeshBasicMaterial({
    map: windowTex,
    transparent: true,
    opacity: 0,
    depthWrite: false
  }),

  /* 设备 */
  container: lam(C.container),
  containerTop: lam(C.containerDark),
  doorBlue: lam(C.doorBlue),
  grille: lam(C.grille),
  metalWhite: lam(C.metalWhite),
  metalDark: lam(C.steelDark),
  batteryBlue: lam(C.batteryBlue),
  pcsBody: pho(C.pcsBody, { shininess: 26, specular: 0x555555 }),

  /* 电气 */
  pylon: lam(C.pylon),
  pylonDark: lam(C.steelDark),
  conductor: lam(C.conductor),
  insulator: lam(C.insulator),
  insulatorBrown: lam('#8d6a4a'),

  /* 线缆（能量流用自发光基础材质，不受时间影响，保证夜里也读得清） */
  wireDC: new THREE.MeshBasicMaterial({ color: C.wireDC }),
  wireAC: new THREE.MeshBasicMaterial({ color: C.wireAC }),
  wireStore: new THREE.MeshBasicMaterial({ color: C.wireStore }),
  arrowDC: new THREE.MeshBasicMaterial({ color: '#7fd4ff' }),
  arrowAC: new THREE.MeshBasicMaterial({ color: '#ffc271' }),
  arrowStore: new THREE.MeshBasicMaterial({ color: '#8ff0c0' }),

  /* 自然 */
  trunk: lam(C.trunk),
  leafA: lam(C.leafA, { flatShading: true }),
  leafB: lam(C.leafB, { flatShading: true }),
  leafC: lam(C.leafC, { flatShading: true }),
  leafD: lam(C.leafD, { flatShading: true }),

  /* 车辆 */
  carWhite: pho(C.carWhite, { shininess: 90, specular: 0xb8c4cc }),
  carDark: lam(C.carDark),
  carOrange: lam(C.carOrange),
  carGlass: pho('#546a80', { shininess: 110, specular: 0xcfe0ee }),
  tyre: lam(C.tyre),

  /* 附属 */
  fence: lam(C.fence),
  post: lam(C.fencePost),
  lampPole: lam('#c9ced3'),
  lampHead: lam('#e8ebee'),
  lampGlow: new THREE.MeshBasicMaterial({ color: '#ffeab0', transparent: true, opacity: 0 }),

  /* 拾取辅助 */
  ring: new THREE.MeshBasicMaterial({
    color: '#ffb020',
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false
  }),
  ringFill: new THREE.MeshBasicMaterial({
    color: '#ffb020',
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  })
} as const

/* ---------------------------------------------------- 时间/天气标量应用 */
export interface EnvTint {
  tint: number
  windowLight: number
  lampLight: number
  wet: number
  snow: number
}

export function applyEnvTint(e: EnvTint) {
  const t = e.tint
  for (const en of entries) {
    if (en.lit) en.mat.color.copy(en.base).multiplyScalar(t)
    else en.mat.color.copy(en.base)
    // 雨天：路面/金属湿滑，抬一点高光；雪天：整体去高光
    if (en.mat instanceof THREE.MeshPhongMaterial && en.shin != null) {
      en.mat.shininess = e.wet > 0.5 ? en.shin * 1.9 : e.snow > 0.5 ? en.shin * 0.35 : en.shin
    }
  }
  // 路缘暖色线在夜里也保持可读
  M.markWarm.emissive.setHex(e.lampLight > 0.5 ? 0x3a2405 : 0x000000)
  M.markWhite.emissive.setHex(e.lampLight > 0.5 ? 0x2a2a2a : 0x000000)
  ;(M.windowGlow as THREE.MeshBasicMaterial).opacity = e.windowLight
  ;(M.lampGlow as THREE.MeshBasicMaterial).opacity = e.lampLight * 0.95
}

/* ------------------------------------------------------------- 高亮族 */
/** 基材质 → 高亮材质 的懒创建缓存 */
const hlCache = new Map<THREE.Material, THREE.Material>()
/**
 * 高亮自发光取青色系：暖橙自发光叠在白色墙面上会把整栋楼洗成米黄，
 * 反而"看不出被选中"；青色高亮对白墙 / 钴蓝组件 / 灰钢都有清晰增益，
 * 又与地面那圈橙色选中环形成冷暖对比（也呼应站内蓝色的电流管线）。
 * 强度按基色亮度自适应，只提亮、不改写材质本色。
 */
const HL_EMISSIVE = new THREE.Color(0x36c8f2)
/** 自发光强度区间：浅色材质取下限，深色材质取上限 */
const HL_I_MAX = 0.36
const HL_I_MIN = 0.16
/** 暖色偏移目标（给没有 emissive 通道的材质用） */
const HL_TINT = new THREE.Color(0xffb545)

/**
 * 取基材质对应的「选中高亮」材质（懒创建、按基材质去重）。
 *
 * 注意：MeshBasicMaterial 的着色器里**没有** emissive uniform，
 * 若给它硬写 material.emissive，three 在 refreshUniformsCommon 里会读
 * uniforms.emissive.value 而抛 TypeError。因此这里按材质类型分流：
 *  - 受光材质（Lambert / Phong / Standard）→ 加 emissive 自发光；
 *  - 不受光材质（Basic）→ 把底色向暖橙偏移并提亮，靠颜色本身表达选中。
 */
export function highlightOf(src: THREE.Material): THREE.Material {
  const base = src as any
  if (base.__hl) return base.__hl
  const cached = hlCache.get(src)
  if (cached) return cached

  const c = base.clone() as any
  if (c.isMeshBasicMaterial || !('emissive' in c)) {
    // 基础材质：只调颜色，绝不碰 emissive
    if (base.color) c.color = base.color.clone().lerp(HL_TINT, 0.55)
    if (c.transparent && c.opacity < 0.25) c.opacity = Math.max(c.opacity, 0.25)
  } else {
    c.emissive = HL_EMISSIVE.clone()
    // 按基色亮度自适应强度：白色墙面本来就很亮，再叠 0.45 的自发光会把
    // 整栋楼洗成一片青白；深色设备则需要更强的自发光才看得出来。
    const lum = base.color ? base.color.r * 0.299 + base.color.g * 0.587 + base.color.b * 0.114 : 0.5
    c.emissiveIntensity = Math.min(HL_I_MAX, Math.max(HL_I_MIN, 0.5 - 0.4 * lum))
    // 高亮材质不在 entries 里，不会被 applyEnvTint 压暗，保持鲜亮
    if (base.color) c.color = base.color.clone().multiplyScalar(1.06)
  }
  c.__isHighlight = true
  base.__hl = c
  hlCache.set(src, c)
  return c as THREE.Material
}

/** 选中时让基材质本身也发一点光（用于 InstancedMesh 等无法换材质的场合） */
export function setBaseEmissive(src: THREE.Material, on: boolean, hex = 0xffa020, intensity = 0.5) {
  const m = src as any
  if (!m.emissive) return
  if (!m.__origEmissive) m.__origEmissive = m.emissive.clone()
  m.emissive.copy(on ? new THREE.Color(hex) : (m.__origEmissive as THREE.Color))
  m.emissiveIntensity = on ? intensity : 1
}

/* ------------------------------------------------------------- 释放 */
export function disposeMaterials() {
  for (const en of entries) en.mat.dispose()
  for (const m of hlCache.values()) m.dispose()
  hlCache.clear()
  grassTextureInst.dispose()
  concreteTextureInst.dispose()
  pvTex.dispose()
  windowTex.dispose()
  ;(M.windowGlow as THREE.Material).dispose()
  ;(M.lampGlow as THREE.Material).dispose()
  ;(M.ring as THREE.Material).dispose()
  ;(M.ringFill as THREE.Material).dispose()
  entries.length = 0
}
