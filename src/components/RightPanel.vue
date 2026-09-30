<script setup lang="ts">
import type { Metric } from '../data/mock'

interface PanelDevice {
  name: string
  group: string
  status: string
  desc: string
  metrics: Metric[]
}

const props = defineProps<{ open: boolean; device: PanelDevice | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function toneOf(s: string) {
  if (s === '运行') return 'run'
  if (s === '待机') return 'idle'
  if (s === '告警') return 'bad'
  return 'warn'
}
function metricTone(m: Metric) {
  return m.tone && m.tone !== 'plain' ? m.tone : ''
}
void props
</script>

<template>
  <div class="panel panel-right" :class="{ open }">
    <template v-if="device">
      <div class="dev-head">
        <div class="bar"></div>
        <div>
          <h2>{{ device.name }}</h2>
          <div class="grp">{{ device.group }}</div>
        </div>
        <button class="close" title="关闭" @click="emit('close')">✕</button>
      </div>

      <div class="dev-body">
        <div class="status-row">
          <span class="badge" :class="toneOf(device.status)">{{ device.status }}</span>
          <span class="grp" style="margin: 0">实时遥测 · 秒级刷新</span>
        </div>

        <div class="metrics">
          <div v-for="m in device.metrics" :key="m.label" class="metric" :class="metricTone(m)">
            <div class="k">{{ m.label }}</div>
            <div class="v">
              {{ m.value }}<small v-if="m.unit">{{ m.unit }}</small>
            </div>
          </div>
        </div>

        <div class="desc">{{ device.desc }}</div>
        <div class="hint">点击场景中其它设备可切换查看</div>
      </div>
    </template>
  </div>
</template>
