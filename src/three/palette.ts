/**
 * palette.ts —— SASAKI 风格取色 + 环境（时间 / 天气）预设
 * 设计稿特征：高饱和草绿、亮蓝组件、暖白建筑、浅灰道路、橙色能量线。
 * 天空一律纯色（不用渐变），四种时段 = 四套独立标量预设。
 */

export const C = {
  /* 大地与绿化 —— SASAKI 稿的草地是低饱和黄绿（带灰调），不是荧光绿 */
  grass: '#a6c86e',
  grassDeep: '#8fb457',
  grassLight: '#bdd68c',
  grassBase: '#86a552', // 底座边缘一圈暗绿，用来"切"出微缩底板
  soil: '#c8b58c',

  /* 路面 */
  asphalt: '#b8b6ad',
  asphaltDark: '#a8a69d',
  concrete: '#d3d0c7',
  concreteDark: '#c2bfb5',
  markWhite: '#ffffff',
  markWarm: '#f5c542', // 设计稿里的黄色路缘线

  /* 建筑 */
  wall: '#f4f5f2',
  wallSide: '#e6e8e4',
  roof: '#dcdfdc',
  roofDark: '#cbd0cc',
  office: '#fbfbf9',
  officeBand: '#7ba0c8',
  officeBandDark: '#5d7fa8',
  glassDark: '#4d6b91',

  /* 光伏 —— 阳光下是明亮钴蓝 */
  pvCell: '#3f6dd6',
  pvCellLit: '#5c8ce8',
  pvRib: '#a8c0ee',
  pvFrame: '#dfe4ea',

  /* 设备 */
  steelGrey: '#b9bfc7',
  steelDark: '#8f97a1',
  metalWhite: '#eef0f2',
  container: '#f0f1ee',
  containerDark: '#d8dad6',
  doorBlue: '#3c6ea8',
  grille: '#5a626c',
  batteryBlue: '#2f5f9c',
  pcsBody: '#dfe3e6',

  /* 电气 */
  wireDC: '#2f95d8',
  wireAC: '#f08428',
  wireStore: '#3fb883',
  conductor: '#5d6670',
  insulator: '#9aa3ad',
  pylon: '#a9b2ba',

  /* 自然 */
  trunk: '#8a6a48',
  leafA: '#6aab4c',
  leafB: '#7cba5c',
  leafC: '#5c9c42',
  leafD: '#8ec468',

  /* 车辆 */
  carWhite: '#f7f8f7',
  carDark: '#3d434b',
  carOrange: '#f2a03c',
  tyre: '#4a4f55',

  /* 围栏 —— 设计稿里是蓝灰色金属栅栏，很显眼 */
  fence: '#9fb4c2',
  fencePost: '#7e94a4'
}

export type TimeKey = 'morning' | 'noon' | 'night'
export type WeatherKey = 'sunny' | 'rain' | 'snow'

export interface EnvPreset {
  sky: string
  fog: string
  fogNear: number
  fogFar: number
  sunColor: string
  sunIntensity: number
  sunDir: [number, number, number]
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  ambient: number
  /** 环境光补偿强度（半球之外的整体亮度） */
  exposure: number
  /** 草地 / 路面的整体着色系数（1 = 原色） */
  tint: number
  /** 建筑窗光（夜间点亮） */
  windowLight: number
  /** 灯具发光强度 */
  lampLight: number
  shadowOpacity: number
}

/* 一天三时 ------------------------------------------------ */
const noonEnv: EnvPreset = {
  sky: '#dcecf8',
  fog: '#dcecf8',
  fogNear: 560,
  fogFar: 1500,
  sunColor: '#fff8ec',
  sunIntensity: 2.0,
  sunDir: [-0.42, 0.86, 0.28],
  hemiSky: '#dff0ff',
  hemiGround: '#b0c98a',
  hemiIntensity: 0.92,
  ambient: 0.4,
  exposure: 1.0,
  tint: 1,
  windowLight: 0,
  lampLight: 0,
  shadowOpacity: 0.26
}

const morningEnv: EnvPreset = {
  sky: '#cfe6f4',
  fog: '#cfe6f4',
  fogNear: 520,
  fogFar: 1420,
  sunColor: '#ffdcae',
  sunIntensity: 1.95,
  sunDir: [0.78, 0.4, 0.42], // 低角度，从东南打过来拉长影子
  hemiSky: '#d8ebfb',
  hemiGround: '#a6bd82',
  hemiIntensity: 0.84,
  ambient: 0.42,
  exposure: 1.0,
  tint: 0.99,
  windowLight: 0.25,
  lampLight: 0.45,
  shadowOpacity: 0.24
}

const nightEnv: EnvPreset = {
  sky: '#20304e',
  fog: '#20304e',
  fogNear: 420,
  fogFar: 1250,
  sunColor: '#a9c0e8',
  sunIntensity: 0.58,
  sunDir: [0.5, 0.72, 0.5],
  hemiSky: '#44608c',
  hemiGround: '#2a4258',
  hemiIntensity: 0.62,
  ambient: 0.36,
  exposure: 1.0,
  tint: 0.72,
  windowLight: 1,
  lampLight: 1,
  shadowOpacity: 0.4
}

export const timePresets: Record<TimeKey, EnvPreset> = {
  morning: morningEnv,
  noon: noonEnv,
  night: nightEnv
}

/* 天气修正 ------------------------------------------------ */
export interface WeatherMod {
  sky: string | null
  fogNear: number
  fogFar: number
  sunScale: number
  hemiScale: number
  ambientAdd: number
  tint: number
  /** 地面湿化（雨水）或覆雪，0~1 */
  wet: number
  snow: number
  rain: number
  label: string
}

export const weatherPresets: Record<WeatherKey, WeatherMod> = {
  sunny: { sky: null, fogNear: 560, fogFar: 1500, sunScale: 1, hemiScale: 1, ambientAdd: 0, tint: 1, wet: 0, snow: 0, rain: 0, label: '晴天' },
  rain: { sky: '#9db2c2', fogNear: 300, fogFar: 880, sunScale: 0.4, hemiScale: 0.86, ambientAdd: 0.06, tint: 0.82, wet: 1, snow: 0, rain: 1, label: '下雨' },
  snow: { sky: '#c6d4e0', fogNear: 260, fogFar: 800, sunScale: 0.52, hemiScale: 0.98, ambientAdd: 0.1, tint: 0.9, wet: 0, snow: 1, rain: 0, label: '下雪' }
}

/** 合成最终环境参数 */
export function resolveEnv(time: TimeKey, weather: WeatherKey) {
  const base = timePresets[time]
  const w = weatherPresets[weather]
  const nightBoost = time === 'night' ? 1 : 0
  return {
    sky: w.sky && !nightBoost ? w.sky : base.sky,
    fog: w.sky && !nightBoost ? w.sky : base.fog,
    fogNear: w.fogNear * (base.fogNear / 460),
    fogFar: w.fogFar * (base.fogFar / 1150),
    sunColor: base.sunColor,
    sunIntensity: base.sunIntensity * w.sunScale,
    sunDir: base.sunDir,
    hemiSky: w.snow ? '#dfe8f0' : base.hemiSky,
    hemiGround: base.hemiGround,
    hemiIntensity: base.hemiIntensity * w.hemiScale,
    ambient: base.ambient + w.ambientAdd,
    exposure: base.exposure,
    tint: base.tint * w.tint,
    windowLight: base.windowLight,
    lampLight: base.lampLight,
    shadowOpacity: base.shadowOpacity,
    wet: w.wet,
    snow: w.snow,
    rain: w.rain
  }
}

export type ResolvedEnv = ReturnType<typeof resolveEnv>
