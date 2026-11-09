<script setup>
import { toasts } from '../lib/toast'
import Icon from './Icon.vue'

function iconOf(type) {
  if (type === 'error') return 'alert'
  if (type === 'ok') return 'check'
  if (type === 'warn') return 'alert'
  return 'zap'
}
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast-${t.type}`">
        <Icon :name="iconOf(t.type)" :size="16" />
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
