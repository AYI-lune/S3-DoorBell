<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './components/Icon.vue'
import ToastHost from './components/ToastHost.vue'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import UsersView from './views/UsersView.vue'
import SettingsView from './views/SettingsView.vue'
import { currentSession, logout } from './lib/auth'
import { cfg, connect, deviceOnline, disconnect, state } from './lib/device'
import { toast } from './lib/toast'

const user = ref(currentSession())
const route = ref('dashboard')

const online = computed(() => deviceOnline())

const connText = computed(() => {
  if (!state.connected) return state.connecting ? '连接中…' : '未连接'
  return online.value ? '设备在线' : '等待设备'
})
const connTone = computed(() => {
  if (!state.connected) return state.connecting ? 'warn' : 'bad'
  return online.value ? 'ok' : 'warn'
})

const TITLES = {
  dashboard: '概览',
  users: '账号管理',
  settings: '连接设置',
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '')
  route.value = TITLES[h] ? h : 'dashboard'
}

function onLogin(u) {
  user.value = u
  location.hash = '#/dashboard'
  parseHash()
  if (cfg.autoConnect) connect()
}

function doLogout() {
  logout()
  disconnect()
  user.value = null
  toast('已退出登录', 'ok')
}

onMounted(() => {
  parseHash()
  window.addEventListener('hashchange', parseHash)
  if (user.value && cfg.autoConnect) connect()
})

onUnmounted(() => {
  window.removeEventListener('hashchange', parseHash)
})

watch(
  () => cfg.autoConnect,
  (on) => {
    if (!user.value) return
    if (on) connect()
    else disconnect()
  }
)
</script>

<template>
  <LoginView v-if="!user" @login="onLogin" />

  <div v-else class="app-shell">
    <header class="topbar">
      <a class="brand" href="#/dashboard">
        <span class="brand-mark"><Icon name="bell" :size="20" /></span>
        <span class="brand-text">
          <b>S3 智能门铃</b>
          <small>ESP32-S3 · 端侧人脸识别</small>
        </span>
      </a>

      <nav class="nav">
        <a href="#/dashboard" :class="{ active: route === 'dashboard' }">
          <Icon name="eye" :size="16" /><span>概览</span>
        </a>
        <a href="#/users" :class="{ active: route === 'users' }">
          <Icon name="users" :size="16" /><span>账号</span>
        </a>
        <a href="#/settings" :class="{ active: route === 'settings' }">
          <Icon name="settings" :size="16" /><span>设置</span>
        </a>
      </nav>

      <div class="topbar-right">
        <span class="conn" :class="connTone">
          <i class="dot"></i>{{ connText }}
        </span>
        <span class="userchip" :title="user.role === 'admin' ? '管理员' : '成员'">
          <span class="avatar">{{ user.name.slice(0, 1).toUpperCase() }}</span>
          <span class="uname">{{ user.name }}</span>
        </span>
        <button class="icon-btn" title="退出登录" @click="doLogout">
          <Icon name="logout" :size="17" />
        </button>
      </div>
    </header>

    <main class="page">
      <DashboardView v-if="route === 'dashboard'" :user="user" />
      <UsersView v-else-if="route === 'users'" :user="user" />
      <SettingsView v-else-if="route === 'settings'" :user="user" />
    </main>

    <footer class="foot">
      <span>{{ TITLES[route] }} · 纯前端 · 数据经 MQTT 直连设备</span>
      <span class="mono">{{ cfg.dataTopic }}</span>
    </footer>
  </div>

  <ToastHost />
</template>
