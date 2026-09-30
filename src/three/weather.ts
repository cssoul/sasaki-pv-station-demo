/**
 * weather.ts —— 降雨 / 降雪粒子系统 + 积雪覆盖
 * 雨：LineSegments（每滴一条短线段，带风向倾斜）
 * 雪：Points（软圆点精灵，程序化生成）
 * 粒子在相机目标点周围的立方体内循环，永远覆盖可视区域。
 */
import * as THREE from 'three'

const RAIN_COUNT = 1400
const SNOW_COUNT = 1300

const BOX_W = 300
const BOX_H = 120
const BOX_D = 300

function snowSprite(): THREE.CanvasTexture {
  const S = 32
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
  ctx.fill()
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class WeatherSystem {
  group = new THREE.Group()
  private rain: THREE.LineSegments
  private snow: THREE.Points
  private cover: THREE.Mesh
  private rainPos: Float32Array
  private snowPos: Float32Array
  private rainSpeed: Float32Array
  private snowSpeed: Float32Array
  private snowPhase: Float32Array
  private rainMat: THREE.LineBasicMaterial
  private snowMat: THREE.PointsMaterial
  private coverMat: THREE.MeshBasicMaterial

  private rainAmt = 0
  private snowAmt = 0
  private center = new THREE.Vector3()

  constructor() {
    this.group.name = 'weather'

    /* 雨 */
    this.rainPos = new Float32Array(RAIN_COUNT * 6)
    this.rainSpeed = new Float32Array(RAIN_COUNT)
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.spawnRain(i, true)
      this.rainSpeed[i] = 62 + Math.random() * 34
    }
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3))
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xc8dcea,
      transparent: true,
      opacity: 0
    })
    this.rain = new THREE.LineSegments(rg, this.rainMat)
    this.rain.frustumCulled = false
    this.rain.visible = false
    this.group.add(this.rain)

    /* 雪 */
    this.snowPos = new Float32Array(SNOW_COUNT * 3)
    this.snowSpeed = new Float32Array(SNOW_COUNT)
    this.snowPhase = new Float32Array(SNOW_COUNT)
    for (let i = 0; i < SNOW_COUNT; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * BOX_W
      this.snowPos[i * 3 + 1] = Math.random() * BOX_H
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * BOX_D
      this.snowSpeed[i] = 4.5 + Math.random() * 5.5
      this.snowPhase[i] = Math.random() * Math.PI * 2
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3))
    this.snowMat = new THREE.PointsMaterial({
      map: snowSprite(),
      size: 0.95,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
    this.snow = new THREE.Points(sg, this.snowMat)
    this.snow.frustumCulled = false
    this.snow.visible = false
    this.group.add(this.snow)

    /* 积雪覆盖 */
    const cg = new THREE.PlaneGeometry(760, 620)
    cg.rotateX(-Math.PI / 2)
    this.coverMat = new THREE.MeshBasicMaterial({
      color: 0xf2f7fb,
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
    this.cover = new THREE.Mesh(cg, this.coverMat)
    this.cover.position.set(10, 0.03, 0)
    this.cover.renderOrder = 1
    this.cover.visible = false
    this.group.add(this.cover)
  }

  private spawnRain(i: number, initial: boolean) {
    const x = (Math.random() - 0.5) * BOX_W
    const y = initial ? Math.random() * BOX_H : BOX_H
    const z = (Math.random() - 0.5) * BOX_D
    const len = 2.4 + Math.random() * 2.2
    const o = i * 6
    this.rainPos[o] = x
    this.rainPos[o + 1] = y
    this.rainPos[o + 2] = z
    this.rainPos[o + 3] = x + len * 0.16
    this.rainPos[o + 4] = y - len
    this.rainPos[o + 5] = z + len * 0.06
  }

  set(rain: number, snow: number) {
    this.rainAmt = rain
    this.snowAmt = snow
    this.rain.visible = rain > 0.01
    this.snow.visible = snow > 0.01
    this.cover.visible = snow > 0.01
    this.rainMat.opacity = 0.52 * rain
    this.snowMat.opacity = 0.92 * snow
    this.coverMat.opacity = 0.62 * snow
  }

  update(dt: number, center: THREE.Vector3) {
    this.center.copy(center)

    /* 雨 */
    if (this.rain.visible) {
      const p = this.rainPos
      const c = this.center
      for (let i = 0; i < RAIN_COUNT; i++) {
        const o = i * 6
        const fall = this.rainSpeed[i] * dt
        p[o + 1] -= fall
        p[o + 4] -= fall
        const drift = fall * 0.16
        p[o] += drift
        p[o + 3] += drift
        if (p[o + 4] < -22) this.spawnRain(i, false)
      }
      // 粒子场整体跟随相机目标
      this.rain.position.set(c.x, c.y - 10, c.z)
      ;(this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    }

    /* 雪 */
    if (this.snow.visible) {
      const p = this.snowPos
      for (let i = 0; i < SNOW_COUNT; i++) {
        const o = i * 3
        p[o + 1] -= this.snowSpeed[i] * dt
        this.snowPhase[i] += dt * 0.9
        p[o] += Math.sin(this.snowPhase[i]) * dt * 1.6
        p[o + 2] += Math.cos(this.snowPhase[i] * 0.7) * dt * 1.1
        if (p[o + 1] < -18) {
          p[o] = (Math.random() - 0.5) * BOX_W
          p[o + 1] = BOX_H
          p[o + 2] = (Math.random() - 0.5) * BOX_D
        }
      }
      this.snow.position.set(this.center.x, this.center.y - 10, this.center.z)
      ;(this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    }
  }

  dispose() {
    this.rain.geometry.dispose()
    this.snow.geometry.dispose()
    this.cover.geometry.dispose()
    this.rainMat.dispose()
    this.snowMat.map?.dispose()
    this.snowMat.dispose()
    this.coverMat.dispose()
  }
}
