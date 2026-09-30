<script setup lang="ts">
import { VIEWS } from '../three/engine'

interface Props {
  view: string
  weather: string
  time: string
  summary: { capacity: number; power: number; today: number; modules: number; devices: number; online: number }
  deviceCount: number
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'view', id: string): void
  (e: 'weather', id: string): void
  (e: 'time', id: string): void
}>()

const weathers = [
  { id: 'sunny', label: '晴天' },
  { id: 'rain', label: '下雨' },
  { id: 'snow', label: '下雪' }
]
const times = [
  { id: 'morning', label: '早上' },
  { id: 'noon', label: '中午' },
  { id: 'night', label: '晚上' }
]

const nf = (v: number, d = 1) => v.toFixed(d)
void props
</script>

<template>
  <div class="panel panel-left">
    <div class="group">
      <div class="group-title">视角切换</div>
      <div class="btns">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          class="btn"
          :class="{ active: view === v.id }"
          @click="emit('view', v.id)"
        >
          {{ v.name }}
        </button>
      </div>
    </div>

    <div class="group">
      <div class="group-title">天气</div>
      <div class="btns">
        <button
          v-for="w in weathers"
          :key="w.id"
          class="btn"
          :class="{ active: weather === w.id }"
          @click="emit('weather', w.id)"
        >
          {{ w.label }}
        </button>
      </div>
    </div>

    <div class="group">
      <div class="group-title">时间</div>
      <div class="btns">
        <button
          v-for="t in times"
          :key="t.id"
          class="btn"
          :class="{ active: time === t.id }"
          @click="emit('time', t.id)"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <div class="group">
      <div class="group-title">运行总览</div>
      <div class="metrics">
        <div class="metric">
          <div class="k">装机容量</div>
          <div class="v">{{ nf(summary.capacity, 2) }}<small>MWp</small></div>
        </div>
        <div class="metric">
          <div class="k">实时功率</div>
          <div class="v">{{ nf(summary.power, 2) }}<small>MW</small></div>
        </div>
        <div class="metric">
          <div class="k">今日发电</div>
          <div class="v">{{ nf(summary.today, 1) }}<small>MWh</small></div>
        </div>
        <div class="metric">
          <div class="k">在线设备</div>
          <div class="v">{{ summary.online }}<small>/ {{ deviceCount }}</small></div>
        </div>
      </div>
    </div>
  </div>
</template>
