<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import { hasAnyUser, login, register } from '../lib/auth'
import { toast } from '../lib/toast'

const emit = defineEmits(['login'])

const firstRun = ref(!hasAnyUser())
const mode = ref(firstRun.value ? 'register' : 'login')
const name = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const showPwd = ref(false)

const title = computed(() => (mode.value === 'register' ? '创建账号' : '登录控制台'))
const subtitle = computed(() =>
  firstRun.value
    ? '这台浏览器还没有任何账号，第一个注册的账号自动成为管理员。'
    : '账号只保存在这台设备的浏览器里，不会上传到任何服务器。'
)

function switchMode(m) {
  mode.value = m
  error.value = ''
  confirm.value = ''
}

function submit() {
  error.value = ''

  if (mode.value === 'register') {
    if (password.value !== confirm.value) {
      error.value = '两次输入的密码不一致'
      return
    }
    const r = register({ name: name.value, password: password.value })
    if (!r.ok) {
      error.value = r.error
      return
    }
    const l = login({ name: name.value, password: password.value })
    if (!l.ok) {
      error.value = l.error
      return
    }
    firstRun.value = false
    toast('账号已创建，欢迎使用', 'ok')
    emit('login', l.user)
    return
  }

  const r = login({ name: name.value, password: password.value })
  if (!r.ok) {
    error.value = r.error
    return
  }
  toast(`欢迎回来，${r.user.name}`, 'ok')
  emit('login', r.user)
}
</script>

<template>
  <div class="auth">
    <div class="auth-glow" aria-hidden="true"></div>

    <section class="auth-hero">
      <div class="brand big">
        <span class="brand-mark"><Icon name="bell" :size="24" /></span>
        <span class="brand-text">
          <b>S3 智能门铃</b>
          <small>ESP32-S3 · 端侧人脸识别</small>
        </span>
      </div>

      <h1>门铃看得见<br /><span class="grad">家人认得出</span></h1>
      <p class="lead">
        摄像头在门口抓拍，人脸识别跑在设备本地，只有结果和一张压缩图通过 MQTT 送到这个页面。
      </p>

      <ul class="feature-list">
        <li>
          <span class="fico"><Icon name="cpu" :size="17" /></span>
          <div><b>识别在端侧</b><i>esp-dl 检测 + 特征比对，照片不出门</i></div>
        </li>
        <li>
          <span class="fico"><Icon name="zap" :size="17" /></span>
          <div><b>MQTT 实时推送</b><i>门铃一按，网页立刻出图和时间线</i></div>
        </li>
        <li>
          <span class="fico"><Icon name="lock" :size="17" /></span>
          <div><b>本地账号</b><i>没有后端，密码哈希后存在浏览器里</i></div>
        </li>
      </ul>
    </section>

    <section class="auth-card card">
      <div class="tabs">
        <button :class="{ on: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button :class="{ on: mode === 'register' }" @click="switchMode('register')">
          注册
        </button>
      </div>

      <h2>{{ title }}</h2>
      <p class="sub">{{ subtitle }}</p>

      <form @submit.prevent="submit">
        <label class="field">
          <span>用户名</span>
          <div class="input-wrap">
            <Icon name="user" :size="16" />
            <input v-model.trim="name" autocomplete="username" placeholder="2~16 个字符" />
          </div>
        </label>

        <label class="field">
          <span>密码</span>
          <div class="input-wrap">
            <Icon name="lock" :size="16" />
            <input
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="至少 6 位"
            />
            <button type="button" class="ghost-eye" @click="showPwd = !showPwd">
              <Icon name="eye" :size="16" />
            </button>
          </div>
        </label>

        <label v-if="mode === 'register'" class="field">
          <span>确认密码</span>
          <div class="input-wrap">
            <Icon name="key" :size="16" />
            <input
              v-model="confirm"
              :type="showPwd ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="再输一次"
            />
          </div>
        </label>

        <Transition name="fade">
          <p v-if="error" class="form-error"><Icon name="alert" :size="15" />{{ error }}</p>
        </Transition>

        <button class="btn primary block" type="submit">
          <Icon :name="mode === 'register' ? 'userplus' : 'logout'" :size="17" />
          {{ mode === 'register' ? '创建并进入' : '进入控制台' }}
        </button>
      </form>

      <p class="hint">
        <Icon name="alert" :size="14" />
        这是演示用的本地账号，清掉浏览器数据就会重置。
      </p>
    </section>
  </div>
</template>
