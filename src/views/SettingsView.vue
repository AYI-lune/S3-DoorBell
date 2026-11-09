<script setup>
import { computed, reactive, ref } from 'vue'
import Icon from '../components/Icon.vue'
import { DEFAULT_CFG, cfg, connect, disconnect, saveCfg, state } from '../lib/device'
import { changePassword, currentSession, listUsers } from '../lib/auth'
import { toast } from '../lib/toast'

const props = defineProps({ user: { type: Object, default: () => ({}) } })

const draft = reactive({
  url: cfg.url,
  dataTopic: cfg.dataTopic,
  cmdTopic: cfg.cmdTopic,
  key: cfg.key,
})
const me = computed(() => currentSession() || props.user)

const pwd = reactive({ old: '', next: '', confirm: '' })
const pwdError = ref('')

const confirmWipe = ref(false)
const userCount = computed(() => listUsers().length)

const PRESETS = [
  { label: 'EMQX 公共 broker（wss 8084）', url: 'wss://broker.emqx.io:8084/mqtt' },
  { label: 'EMQX 公共 broker（ws 8083）', url: 'ws://broker.emqx.io:8083/mqtt' },
  { label: '本机 Mosquitto（WebSocket）', url: 'ws://127.0.0.1:9001' },
]

function applyPreset(p) {
  draft.url = p.url
}

function saveAndReconnect() {
  if (!/^(wss?|mqtts?):\/\//.test(draft.url)) {
    toast('地址要以 ws:// 或 wss:// 开头', 'error')
    return
  }
  if (!draft.dataTopic.trim() || !draft.cmdTopic.trim()) {
    toast('数据主题和命令主题都不能为空', 'error')
    return
  }
  saveCfg({
    url: draft.url.trim(),
    dataTopic: draft.dataTopic.trim(),
    cmdTopic: draft.cmdTopic.trim(),
    key: draft.key,
  })
  toast('已保存，正在重连', 'ok')
  connect()
}

function resetCfg() {
  Object.assign(draft, {
    url: DEFAULT_CFG.url,
    dataTopic: DEFAULT_CFG.dataTopic,
    cmdTopic: DEFAULT_CFG.cmdTopic,
    key: DEFAULT_CFG.key,
  })
  saveCfg({ ...draft })
  connect()
  toast('已恢复默认连接参数', 'ok')
}

function toggleAuto(e) {
  saveCfg({ autoConnect: e.target.checked })
}

function changePwd() {
  pwdError.value = ''
  if (pwd.next !== pwd.confirm) {
    pwdError.value = '两次输入的新密码不一致'
    return
  }
  const r = changePassword(me.value.id, pwd.old, pwd.next)
  if (!r.ok) {
    pwdError.value = r.error
    return
  }
  pwd.old = pwd.next = pwd.confirm = ''
  toast('密码已更新', 'ok')
}

function wipeAll() {
  if (!confirmWipe.value) {
    confirmWipe.value = true
    setTimeout(() => (confirmWipe.value = false), 5000)
    return
  }
  Object.keys(localStorage)
    .filter((k) => k.startsWith('s3db:'))
    .forEach((k) => localStorage.removeItem(k))
  location.reload()
}

const statusText = computed(() => {
  if (state.connected) return '已连接'
  if (state.connecting) return '连接中…'
  return state.error ? `失败：${state.error}` : '未连接'
})
</script>

<template>
  <div class="page-head">
    <div>
      <h1>连接设置</h1>
      <p class="sub">网页通过 MQTT over WebSocket 直连 broker，不需要任何后端服务</p>
    </div>
    <span class="pill" :class="state.connected ? 'tone-ok' : state.connecting ? 'tone-warn' : 'tone-muted'">
      {{ statusText }}
    </span>
  </div>

  <section class="grid">
    <article class="card col-7">
      <div class="card-head">
        <div class="card-title"><Icon name="link" :size="17" /><b>MQTT 连接</b></div>
      </div>

      <div class="stack">
        <label class="field">
          <span>Broker 地址（WebSocket）</span>
          <div class="input-wrap">
            <Icon name="wifi" :size="16" />
            <input v-model.trim="draft.url" placeholder="wss://broker.emqx.io:8084/mqtt" />
          </div>
        </label>

        <div class="preset-row">
          <button v-for="p in PRESETS" :key="p.url" class="chip" @click="applyPreset(p)">
            {{ p.label }}
          </button>
        </div>

        <label class="field">
          <span>数据主题（设备 → 网页，订阅它的 <code>/#</code>）</span>
          <div class="input-wrap">
            <Icon name="chip" :size="16" />
            <input v-model.trim="draft.dataTopic" placeholder="manmuweixia-S3-DoorBell-Data" />
          </div>
        </label>

        <div class="two-col">
          <label class="field">
            <span>命令主题（网页 → 设备）</span>
            <div class="input-wrap">
              <Icon name="link" :size="16" />
              <input v-model.trim="draft.cmdTopic" placeholder="manmuweixia-S3-DoorBell-Cmd" />
            </div>
          </label>

          <label class="field">
            <span>命令口令</span>
            <div class="input-wrap">
              <Icon name="key" :size="16" />
              <input v-model.trim="draft.key" placeholder="和设备一致" />
            </div>
          </label>
        </div>

        <p class="hint">
          <Icon name="alert" :size="14" />
          两个主题和口令必须与固件 <code>Config.h</code> 里的 <code>MQTT_DATA_PREFIX</code> /
          <code>MQTT_CMD_TOPIC</code> 一致。公共 broker 上任何人都能订阅，口令只是防误操作，不是安全认证。
        </p>

        <label class="switch">
          <input type="checkbox" :checked="cfg.autoConnect" @change="toggleAuto" />
          <span class="track"><i></i></span>
          <span>打开页面自动连接</span>
        </label>

        <div class="row-actions">
          <button class="btn primary" @click="saveAndReconnect">
            <Icon name="check" :size="16" />保存并重连
          </button>
          <button class="btn ghost" @click="connect">
            <Icon name="refresh" :size="16" />重新连接
          </button>
          <button class="btn ghost" @click="disconnect">断开</button>
          <button class="btn ghost" @click="resetCfg">恢复默认</button>
        </div>
      </div>
    </article>

    <article class="card col-5">
      <div class="card-head">
        <div class="card-title"><Icon name="lock" :size="17" /><b>修改我的密码</b></div>
      </div>

      <form class="stack" @submit.prevent="changePwd">
        <label class="field">
          <span>原密码</span>
          <div class="input-wrap">
            <Icon name="key" :size="16" />
            <input v-model="pwd.old" type="password" autocomplete="current-password" />
          </div>
        </label>
        <label class="field">
          <span>新密码</span>
          <div class="input-wrap">
            <Icon name="lock" :size="16" />
            <input v-model="pwd.next" type="password" autocomplete="new-password" placeholder="至少 6 位" />
          </div>
        </label>
        <label class="field">
          <span>确认新密码</span>
          <div class="input-wrap">
            <Icon name="lock" :size="16" />
            <input v-model="pwd.confirm" type="password" autocomplete="new-password" />
          </div>
        </label>

        <Transition name="fade">
          <p v-if="pwdError" class="form-error"><Icon name="alert" :size="15" />{{ pwdError }}</p>
        </Transition>

        <button class="btn primary block" type="submit">
          <Icon name="check" :size="16" />更新密码
        </button>
      </form>
    </article>

    <article class="card col-7">
      <div class="card-head">
        <div class="card-title"><Icon name="zap" :size="17" /><b>连接日志</b></div>
        <span class="pill ghost">{{ state.logs.length }}</span>
      </div>

      <div class="logbox">
        <div v-if="!state.logs.length" class="muted small">还没有日志</div>
        <div v-for="(l, i) in state.logs" :key="i" class="logline" :class="`log-${l.level}`">
          <span class="log-time">{{ new Date(l.t).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
          <span>{{ l.text }}</span>
        </div>
      </div>
    </article>

    <article class="card col-5">
      <div class="card-head">
        <div class="card-title"><Icon name="trash" :size="17" /><b>本机数据</b></div>
      </div>

      <p class="muted small">
        所有内容都在这台设备的 localStorage 里：账号、事件记录、连接参数。换电脑或清浏览器数据都会丢。
      </p>

      <ul class="kv">
        <li><span>本机账号</span><b>{{ userCount }} 个</b></li>
        <li><span>事件记录</span><b>{{ state.events.length }} 条</b></li>
        <li><span>数据主题</span><b class="mono">{{ cfg.dataTopic }}</b></li>
        <li><span>命令主题</span><b class="mono">{{ cfg.cmdTopic }}</b></li>
      </ul>

      <div class="row-actions">
        <button class="btn danger" :class="{ armed: confirmWipe }" @click="wipeAll">
          <Icon name="alert" :size="16" />{{ confirmWipe ? '再点一次，全部清除' : '清除全部本地数据' }}
        </button>
      </div>
      <p class="hint">
        <Icon name="alert" :size="14" />清除后所有账号（包括当前登录）都会消失，页面会回到首次初始化。
      </p>
    </article>
  </section>
</template>
