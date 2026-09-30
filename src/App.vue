<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, reactive, shallowRef } from 'vue'
import * as THREE from 'three'
import LeftPanel from './components/LeftPanel.vue'
import RightPanel from './components/RightPanel.vue'
import { Engine, type EngineStats } from './three/engine'
import { labelAnchors } from './three/layout'
import {
  devices,
  getDevice,
  stationSummary,
  tickMetrics,
  pvModuleCount,
  config,
  type Device,
  type Metric
} from './data/mock'

const stage = ref<HTMLDivElement | null>(null)
const labelLayer = ref<HTMLDivElement | null>(null)
const labelEls: (HTMLElement | null)[] = []

const view = ref('overview')
const weather = ref('sunny')
const time = ref('noon')

const stats = reactive<EngineStats>({ fps: 0, calls: 0, tris: 0, modules: 0 })
const summary = reactive({
  capacity: 0,
  power: 0,
  today: 0,
  modules: pvModuleCount,
  devices: devices.length,
  online: 0
})

interface PanelDevice {
  name: string
  group: string
  status: string
  desc: string
  metrics: Metric[]
}
const panelOpen = ref(false)
const panelDevice = ref<PanelDevice | null>(null)

let engine: Engine | null = null
let selected: Device | null = null
let timer: number | null = null
let raf = 0

/* --------------------------------------------------------- 右浮层同步 */
function syncPanel() {
  if (!selected) {
    panelOpen.value = false
    panelDevice.value = null
    return
  }
  panelDevice.value = {
    name: selected.name,
    group: selected.group,
    status: selected.status,
    desc: selected.desc,
    metrics: selected.metrics.map((m) => ({ ...m }))
  }
  panelOpen.value = true
}

/* --------------------------------------------------------- 标签投影 */
const tmpVec = new THREE.Vector3()
const proj = { x: 0, y: 0, visible: false }
function tickLabels() {
  raf = requestAnimationFrame(tickLabels)
  if (!engine || !labelLayer.value) return
  const w = window.innerWidth
  const h = window.innerHeight
  for (let i = 0; i < labelAnchors.length; i++) {
    const el = labelEls[i]
    if (!el) continue
    const a = labelAnchors[i]
    tmpVec.set(a.x, a.y, a.z)
    engine.project(tmpVec, proj)
    if (!proj.visible || proj.x < -140 || proj.x > w + 140 || proj.y < -60 || proj.y > h + 60) {
      el.style.opacity = '0'
      continue
    }
    el.style.opacity = '1'
    el.style.transform = `translate3d(${proj.x}px, ${proj.y}px, 0) translate(-50%, -100%)`
  }
}

onMounted(() => {
  if (!stage.value) return
  engine = new Engine(stage.value, {
    onStats: (s) => {
      stats.fps = s.fps
      stats.calls = s.calls
      stats.tris = s.tris
      stats.modules = s.modules
    },
    onPick: (d) => {
      selected = d
      syncPanel()
    }
  })
  engine.setTime('noon')
  engine.setWeather('sunny')

  const tick = () => {
    const s = stationSummary(performance.now() / 1000)
    summary.capacity = s.capacity
    summary.power = s.power
    summary.today = s.today
    summary.online = s.online
    summary.devices = s.total
    tickMetrics(performance.now() / 1000)
    if (selected) syncPanel()
  }
  tick()
  // 指标抖动：1.6s 一次，模拟实时遥测
  timer = window.setInterval(tick, 1600)

  requestAnimationFrame(tickLabels)

  window.addEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    engine?.select(null)
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (timer) window.clearInterval(timer)
  cancelAnimationFrame(raf)
  engine?.dispose()
  engine = null
})

/* --------------------------------------------------------- 交互 */
function pickView(id: string) {
  view.value = id
  engine?.gotoView(id)
}
function pickWeather(id: string) {
  weather.value = id
  engine?.setWeather(id as 'sunny' | 'rain' | 'snow')
}
function pickTime(id: string) {
  time.value = id
  engine?.setTime(id as 'morning' | 'noon' | 'night')
}
function closePanel() {
  engine?.select(null)
}

/* 供自动化验证使用的窗口钩子 */
declare global {
  interface Window {
    __PV__?: Record<string, unknown>
  }
}
onMounted(() => {
  window.__PV__ = {
    engine: () => engine,
    pick: (x: number, y: number) => engine?.pickAt(x, y),
    select: (id: string | null) => engine?.select(id),
    deviceIds: () => devices.map((d) => d.id),
    stats: () => engine?.getStats(),
    config,
    deviceAt: (id: string) => getDevice(id)
  }
})
</script>

<template>
  <div class="stage" ref="stage"></div>

  <div class="overlay">
    <div class="title-card">
      <h1>光伏储能电站 · 数字孪生</h1>
      <p>清洁能源 · 智能管理 · 绿色未来</p>
    </div>

    <LeftPanel
      :view="view"
      :weather="weather"
      :time="time"
      :summary="summary"
      :device-count="summary.devices"
      @view="pickView"
      @weather="pickWeather"
      @time="pickTime"
    />

    <RightPanel :open="panelOpen" :device="panelDevice" @close="closePanel" />

    <div class="stats">
      <span>帧率 <b>{{ stats.fps.toFixed(0) }}</b> FPS</span>
      <span>Draw Call <b>{{ stats.calls }}</b></span>
      <span>三角面 <b>{{ (stats.tris / 1000).toFixed(0) }}</b> k</span>
      <span>光伏组件 <b>{{ stats.modules }}</b></span>
    </div>
  </div>

  <div class="labels" ref="labelLayer">
    <div
      v-for="(a, i) in labelAnchors"
      :key="a.text"
      class="label-chip"
      :ref="(el) => (labelEls[i] = el as HTMLElement)"
      style="opacity: 0"
    >
      <span class="dot"></span>{{ a.text }}
    </div>
  </div>
</template>
