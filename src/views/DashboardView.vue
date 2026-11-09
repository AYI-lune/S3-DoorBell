<script setup>
import { computed, ref } from 'vue'
import Icon from '../components/Icon.vue'
import {
  clearEvents,
  deviceOnline,
  lastStatusAgo,
  sendCmd,
  state,
} from '../lib/device'
import {
  eventMeta,
  eventResult,
  eventTone,
  fmtAgo,
  fmtDateTime,
  fmtTime,
  fmtUptime,
} from '../lib/format'
import { clearFaces, family } from '../lib/family'
import { toast } from '../lib/toast'

defineProps({ user: { type: Object, default: () => ({}) } })

const filter = ref('all')
const confirmClear = ref(false)
const confirmUnlock = ref(false)
const previewFace = ref(null)

const filters = [
  { key: 'all', label: '全部' },
  { key: 'family', label: '家人' },
  { key: 'stranger', label: '陌生人' },
  { key: 'door', label: '门铃' },
]

const dev = computed(() => state.device || {})
const online = computed(() => deviceOnline())
const imageMeta = computed(() => state.imageMeta)
const imageAt = computed(() => state.imageAt)

const temp = computed(() => {
  const v = dev.value.temp
  return v == null ? '—' : Number(v).toFixed(1)
})
const hum = computed(() => {
  const v = dev.value.hum
  return v == null ? '—' : Number(v).toFixed(0)
})
const lux = computed(() => {
  const v = dev.value.lux
  return v == null ? '—' : Math.round(v)
})

const filtered = computed(() => {
  const list = state.events
  if (filter.value === 'family') return list.filter((e) => e.family)
  if (filter.value === 'stranger') return list.filter((e) => e.face && !e.family)
  if (filter.value === 'door') return list.filter((e) => e.type === 'door')
  return list
})

// 设备只存特征向量，没有照片。照片是"录入成功那一帧"由网页存下来的，
// 编号 = 录入后库里人数（家人1、家人2…）。
const faceList = computed(() => {
  const n = Number(dev.value.enrolled || 0)
  const list = []
  for (let i = 1; i <= n; i++) {
    const f = family[String(i)]
    if (f?.dataUrl) list.push({ idx: i, dataUrl: f.dataUrl, ts: f.ts })
  }
  return list
})

const facePlaceholders = computed(() => {
  const n = Number(dev.value.enrolled || 0)
  const have = new Set(faceList.value.map((f) => f.idx))
  const out = []
  for (let i = 1; i <= n; i++) if (!have.has(i)) out.push(i)
  return out
})

const shotLabel = computed(() => {
  const m = imageMeta.value
  if (!m) return ''
  if (m.family) return '家人'
  if (m.face) return '陌生人'
  return '未检出人脸'
})
const shotTone = computed(() => {
  const m = imageMeta.value
  if (!m) return 'muted'
  if (m.family) return 'ok'
  if (m.face) return 'warn'
  return 'muted'
})

function cmd(name, label) {
  const ok = sendCmd(name)
  toast(ok ? `已发送「${label}」` : 'MQTT 未连接，命令没发出去', ok ? 'ok' : 'warn')
}

function doClear() {
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => (confirmClear.value = false), 4000)
    return
  }
  confirmClear.value = false
  clearFaces()
  cmd('clear', '清空特征库')
}

const lightOn = computed(() => !!dev.value.light)

function toggleLight() {
  const next = !lightOn.value
  const ok = sendCmd('light', { v: next })
  toast(ok ? (next ? '补光灯已打开' : '补光灯已关闭') : 'MQTT 未连接', ok ? 'ok' : 'warn')
}

// 开锁是不可逆动作，点两次才发（4 秒内不点第二次自动取消）
function doUnlock() {
  if (!confirmUnlock.value) {
    confirmUnlock.value = true
    setTimeout(() => (confirmUnlock.value = false), 4000)
    return
  }
  confirmUnlock.value = false
  cmd('unlock', '开锁')
}

function onClearEvents() {
  clearEvents()
  toast('本地事件记录已清空', 'ok')
}

function fmtBytes(n) {
  const b = Number(n || 0)
  if (!b) return '—'
  return b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>概览</h1>
      <p class="sub">门口画面、环境数据与识别结果，都来自设备通过 MQTT 推送的实时消息</p>
    </div>
    <div class="head-actions">
      <button class="btn ghost" @click="cmd('status', '刷新状态')">
        <Icon name="refresh" :size="16" />刷新状态
      </button>
    </div>
  </div>

  <section class="grid">
    <!-- 门口画面 -->
    <article class="card col-8">
      <div class="card-head">
        <div class="card-title"><Icon name="camera" :size="17" /><b>门口画面</b></div>
        <span v-if="imageMeta" class="pill ghost">{{ fmtAgo(imageAt / 1000) }}</span>
      </div>

      <div class="shot">
        <img v-if="state.imageUrl" :src="state.imageUrl" alt="最新抓拍画面" />
        <div v-else class="shot-empty">
          <span class="shot-empty-ico"><Icon name="image" :size="34" /></span>
          <b>还没有画面</b>
          <span>按一下门铃，或点下面的「立即抓拍」</span>
        </div>

        <div v-if="imageMeta" class="shot-badges">
          <span class="pill" :class="`tone-${shotTone}`">{{ shotLabel }}</span>
          <span class="pill dark">{{ fmtBytes(imageMeta.size) }}</span>
        </div>
        <div v-else-if="state.imgProgress" class="shot-badges">
          <span class="pill dark">接收中 {{ state.imgProgress.got }}/{{ state.imgProgress.total }}</span>
        </div>
      </div>

      <div class="hero-actions">
        <button class="btn primary" @click="cmd('snap', '立即抓拍')">
          <Icon name="camera" :size="16" />立即抓拍
        </button>
        <button class="btn" @click="cmd('ring', '远程响铃')">
          <Icon name="bell" :size="16" />远程响铃
        </button>
        <button class="btn" @click="cmd('page', '切换 OLED')">
          <Icon name="refresh" :size="16" />切换 OLED
        </button>
        <button class="btn" :class="{ danger: !lightOn }" @click="toggleLight">
          <Icon name="sun" :size="16" />{{ lightOn ? '关闭补光' : '打开补光' }}
        </button>
        <button class="btn danger" :class="{ armed: confirmUnlock }" @click="doUnlock">
          <Icon name="lock" :size="16" />{{ confirmUnlock ? '再点一次开锁' : '开锁' }}
        </button>
        <button class="btn ghost" title="先用硬件 PWM 扫一遍，再用纯 GPIO 打脉冲扫一遍，共约 7 秒" @click="cmd('servo', '舵机自检')">
          <Icon name="settings" :size="16" />舵机自检
        </button>
      </div>
    </article>

    <!-- 设备状态 -->
    <aside class="card col-4">
      <div class="card-head">
        <div class="card-title"><Icon name="chip" :size="17" /><b>设备状态</b></div>
        <span class="live" :class="online ? 'on' : 'off'"><i></i>{{ online ? '在线' : '离线' }}</span>
      </div>

      <div class="metrics">
        <div class="metric">
          <Icon name="temp" :size="16" />
          <span>温度</span>
          <b>{{ temp }}<i>°C</i></b>
        </div>
        <div class="metric">
          <Icon name="hum" :size="16" />
          <span>湿度</span>
          <b>{{ hum }}<i>%</i></b>
        </div>
        <div class="metric">
          <Icon name="sun" :size="16" />
          <span>光照</span>
          <b>{{ lux }}<i>lx</i></b>
        </div>
      </div>

      <ul class="kv">
        <li><span>设备名称</span><b>{{ dev.dev || '—' }}</b></li>
        <li><span>已录入家人</span><b>{{ dev.enrolled ?? 0 }} 人</b></li>
        <li><span>WiFi</span><b>{{ dev.ssid || '—' }}</b></li>
        <li><span>WiFi 信号</span><b>{{ dev.rssi ?? '—' }} dBm</b></li>
        <li><span>运行时长</span><b>{{ dev.uptime ? fmtUptime(dev.uptime) : '—' }}</b></li>
        <li>
          <span>补光灯</span>
          <b :class="lightOn ? 'tone-warn' : ''">{{ dev.light == null ? '—' : lightOn ? '开' : '关' }}</b>
        </li>
        <li>
          <span>人脸库备份</span>
          <b :class="dev.bk ? 'tone-ok' : 'tone-muted'">{{ dev.bk == null ? '—' : dev.bk ? 'W25Q64 就绪' : '未接' }}</b>
        </li>
        <li><span>固件版本</span><b>{{ dev.fw ? 'v' + dev.fw : '—' }}</b></li>
        <li><span>IP 地址</span><b class="mono">{{ dev.ip || '—' }}</b></li>
        <li><span>状态更新</span><b>{{ lastStatusAgo() }}</b></li>
      </ul>

      <div class="card-foot">
        <span class="muted">状态每 5 秒推送</span>
        <span class="live" :class="online ? 'on' : 'off'"><i></i>{{ online ? '在线' : '离线' }}</span>
      </div>
    </aside>

    <!-- 事件时间线 -->
    <article class="card col-7">
      <div class="card-head wrap">
        <div class="card-title"><Icon name="clock" :size="17" /><b>事件时间线</b></div>
        <div class="chips">
          <button
            v-for="f in filters"
            :key="f.key"
            :class="{ on: filter === f.key }"
            @click="filter = f.key"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <div v-if="filtered.length" class="timeline">
        <div v-for="e in filtered" :key="e.id" class="evt">
          <span class="evt-ico" :class="`tone-${eventMeta(e).tone}`">
            <Icon :name="eventMeta(e).icon" :size="15" />
          </span>
          <div class="evt-main">
            <div class="evt-line">
              <b>{{ eventMeta(e).label }}</b>
              <span class="pill tiny" :class="`tone-${eventTone(e)}`">
                {{ eventResult(e) }}
              </span>
            </div>
            <div class="evt-sub">
              {{ fmtTime(e.ts) }}
              <template v-if="e.sim">· 相似度 {{ Math.round(e.sim * 100) }}%</template>
              <template v-else-if="e.type === 'enroll' && e.enrolled">· 库中共 {{ e.count }} 人</template>
            </div>
          </div>
          <span class="evt-ago">{{ fmtAgo(e.ts) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <Icon name="clock" :size="26" />
        <b>还没有事件</b>
        <span>按下门铃或触发人体感应后，这里会出现记录</span>
      </div>

      <div class="card-foot">
        <span class="muted">只保留最近 60 条，存在本机浏览器</span>
        <button class="link-btn" @click="onClearEvents">清空记录</button>
      </div>
    </article>

    <!-- 家人识别 -->
    <article class="card col-5">
      <div class="card-head">
        <div class="card-title"><Icon name="shield" :size="17" /><b>家人识别</b></div>
        <span class="pill tiny" :class="dev.ai ? 'tone-ok' : 'tone-muted'">
          {{ dev.ai ? 'AI 就绪' : 'AI 未加载' }}
        </span>
      </div>

      <div class="family-count">
        <b>{{ dev.enrolled ?? 0 }}</b>
        <span>位已录入家人</span>
      </div>

      <p class="muted small">
        识别模型跑在 ESP32-S3 本地（esp-dl），只把结果和一张压缩图发到网页，原始画面不出设备。
      </p>

      <div v-if="faceList.length || facePlaceholders.length" class="face-grid">
        <button
          v-for="f in faceList"
          :key="f.idx"
          class="face-item"
          :title="`查看家人${f.idx}`"
          @click="previewFace = f"
        >
          <img :src="f.dataUrl" :alt="`家人${f.idx}`" />
          <span>家人{{ f.idx }}</span>
        </button>
        <div v-for="n in facePlaceholders" :key="'ph' + n" class="face-item empty">
          <Icon name="user" :size="18" />
          <span>家人{{ n }} 无照片</span>
        </div>
      </div>
      <p v-else class="muted small">
        还没有家人照片。录入成功的那一帧会自动存到这里（只存本地浏览器，不上传）。
      </p>

      <div class="family-actions">
        <button class="btn primary" @click="cmd('enroll', '录入人脸')">
          <Icon name="userplus" :size="16" />录入人脸
        </button>
        <button class="btn danger" :class="{ armed: confirmClear }" @click="doClear">
          <Icon name="trash" :size="16" />{{ confirmClear ? '再点一次' : '清空库' }}
        </button>
      </div>

      <ol class="steps">
        <li>站到镜头前 30~50cm，正对镜头、光线均匀</li>
        <li>长按机身设置键 3 秒，听到两声提示音</li>
        <li>屏幕显示「录入成功」即可，之后按门铃会标为家人</li>
      </ol>
    </article>
  </section>

  <Teleport to="body">
    <div v-if="previewFace" class="lightbox" @click.self="previewFace = null">
      <figure>
        <img :src="previewFace.dataUrl" :alt="`家人${previewFace.idx}`" />
        <figcaption>
          <b>家人{{ previewFace.idx }}</b>
          <span>{{ fmtDateTime(previewFace.ts) }} 录入</span>
          <button class="btn sm ghost" @click="previewFace = null">关闭</button>
        </figcaption>
      </figure>
    </div>
  </Teleport>
</template>
