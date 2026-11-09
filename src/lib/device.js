import { reactive } from 'vue'
import mqtt from 'mqtt'
import { saveFace } from './family'

/**
 * 设备状态中心（单例）
 *
 * 数据全部来自 MQTT，没有后端。主题分两类（可由设置页修改）：
 *
 *   数据主题 <dataTopic>（设备 → 网页，订阅 <dataTopic>/#）
 *     /status          每 5s 一包 JSON（retain=true，网页一打开就有数据）
 *     /event           每次抓拍一包元数据
 *     /img/meta        图片分片元信息 {id, chunks, size, src, enrolled, count}
 *     /img/data/<id>/<i>   图片二进制分片
 *
 *   命令主题 <cmdTopic>（网页 → 设备，设备订阅）
 *
 * 图片不走 base64：MQTT 载荷二进制安全，直接拼字节省 33% 流量，
 * 也不会在浏览器里多存一份超长字符串。
 */

const CFG_KEY = 's3db:cfg'
const EVT_KEY = 's3db:events'

export const DEFAULT_CFG = {
  url: 'wss://broker.emqx.io:8084/mqtt',
  dataTopic: 'manmuweixia-S3-DoorBell-Data',
  cmdTopic: 'manmuweixia-S3-DoorBell-Cmd',
  key: 's3db-2026',
  autoConnect: true,
}

function loadCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}')
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_CFG }
    // 旧版本存的是单个 prefix，主题已经改名，直接丢弃走新默认值
    delete raw.prefix
    return { ...DEFAULT_CFG, ...raw }
  } catch {
    return { ...DEFAULT_CFG }
  }
}

function loadEvents() {
  try {
    const raw = JSON.parse(localStorage.getItem(EVT_KEY) || '[]')
    return Array.isArray(raw) ? raw.slice(0, 60) : []
  } catch {
    return []
  }
}

export const cfg = reactive(loadCfg())

export const state = reactive({
  connecting: false,
  connected: false,
  error: '',
  device: {},
  deviceAt: 0, // 最后一次 status 时间（本地时间戳）
  imageUrl: '',
  imageMeta: null,
  imageAt: 0,
  imgProgress: null, // { got, total } 正在接收第几张图的进度
  events: loadEvents(),
  logs: [],
  now: Date.now(),
})

// 让界面上的"在线 12 秒前"能自己走，不用轮询刷新
setInterval(() => {
  state.now = Date.now()
}, 1000)

export function pushLog(text, level = 'info') {
  state.logs.unshift({ t: Date.now(), text, level })
  if (state.logs.length > 40) state.logs.length = 40
}

export function saveCfg(patch) {
  Object.assign(cfg, patch)
  localStorage.setItem(CFG_KEY, JSON.stringify({ ...cfg }))
}

export function clearEvents() {
  state.events = []
  localStorage.removeItem(EVT_KEY)
}

/* ---------------- MQTT ---------------- */

let client = null
// id -> { meta, chunks: Array, at: 收到 meta 的时间 }
const pendingImages = new Map()

// 一张图最久该在多久内收齐。设备一张图 1~7 秒就发完了，
// 超过这个时间还没齐 = 有分片丢了（公共 broker 偶尔会丢），
// 一直挂着会让"照片区域"看起来像卡死，所以到点就扔掉并记一条日志。
const PENDING_TIMEOUT_MS = 12000

// 每 3 秒清一次过期未收齐的图
setInterval(() => {
  if (!pendingImages.size) return
  const now = Date.now()
  for (const [id, p] of pendingImages) {
    if (now - p.at > PENDING_TIMEOUT_MS) {
      const got = p.chunks.filter(Boolean).length
      pushLog(`图片分片超时（收到 ${got}/${p.meta.chunks} 片，已丢弃）`, 'warn')
      pendingImages.delete(id)
      if (state.imageMeta?.id === id) state.imgProgress = null
    }
  }
  if (!pendingImages.size) state.imgProgress = null
  else {
    // 展示最新一张的进度
    const last = [...pendingImages.values()].at(-1)
    if (last) {
      state.imgProgress = { got: last.chunks.filter(Boolean).length, total: Number(last.meta.chunks) }
    }
  }
}, 3000)

function updateProgress() {
  if (!pendingImages.size) {
    state.imgProgress = null
    return
  }
  const last = [...pendingImages.values()].at(-1)
  if (last) {
    state.imgProgress = { got: last.chunks.filter(Boolean).length, total: Number(last.meta.chunks) }
  }
}

function appendEvent(e) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type: e.type || 'other',
    face: !!e.face,
    family: !!e.family,
    enrolled: !!e.enrolled,
    score: Number(e.score || 0),
    sim: Number(e.sim || 0),
    bytes: Number(e.bytes || 0),
    count: Number(e.count || 0),
    ts: Number(e.ts || Math.floor(Date.now() / 1000)),
  }
  state.events.unshift(item)
  if (state.events.length > 60) state.events.length = 60
  try {
    localStorage.setItem(EVT_KEY, JSON.stringify(state.events))
  } catch {
    /* 存不下就算了，内存里还有 */
  }
}

function toBytes(payload) {
  if (payload instanceof Uint8Array) return payload
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
  return new Uint8Array(payload)
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => resolve('')
    fr.readAsDataURL(blob)
  })
}

function finishImage(id) {
  const p = pendingImages.get(id)
  if (!p) return
  const missing = p.chunks.findIndex((c) => !c)
  if (missing !== -1) return // 还没收全

  const total = p.chunks.reduce((n, c) => n + c.length, 0)
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of p.chunks) {
    buf.set(c, off)
    off += c.length
  }

  // JPEG 完整性自检：必须是 FFD8 开头、FFD9 结尾。
  // 不完整就别显示 —— 一张截断的 JPEG 在浏览器里就是下半截发灰/发绿的样子，
  // 用户会以为设备又出问题了，其实是传输丢片。
  const soi = buf[0] === 0xff && buf[1] === 0xd8
  const eoi = buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9
  if (!soi || !eoi) {
    pushLog(`图片数据不完整（SOI=${soi} EOI=${eoi}），已丢弃`, 'warn')
    pendingImages.delete(id)
    updateProgress()
    return
  }

  const blob = new Blob([buf], { type: 'image/jpeg' })
  const url = URL.createObjectURL(blob)
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl)
  state.imageUrl = url
  state.imageMeta = p.meta
  state.imageAt = Date.now()
  state.imgProgress = null
  pendingImages.delete(id)

  // 录入成功的那一帧：顺手存成「家人N」的照片，不需要后端
  const m = p.meta
  if (m && m.src === 'enroll' && m.enrolled && Number(m.count) > 0) {
    blobToDataUrl(blob).then((dataUrl) => {
      if (dataUrl) {
        saveFace(Number(m.count), dataUrl, m.ts)
        pushLog(`已保存「家人${m.count}」的照片`, 'ok')
      }
    })
  }
}

function onMessage(topic, payload) {
  const dp = cfg.dataTopic
  const body = toBytes(payload)

  if (topic === `${dp}/status`) {
    try {
      state.device = JSON.parse(new TextDecoder().decode(body))
      state.deviceAt = Date.now()
    } catch {
      pushLog('状态报文解析失败', 'warn')
    }
    return
  }

  if (topic === `${dp}/event`) {
    try {
      const e = JSON.parse(new TextDecoder().decode(body))
      appendEvent(e)
      pushLog(`事件：${e.type}${e.family ? ' · 家人' : e.face ? ' · 陌生人' : ''}`)
    } catch {
      pushLog('事件报文解析失败', 'warn')
    }
    return
  }

  if (topic === `${dp}/img/meta`) {
    try {
      const meta = JSON.parse(new TextDecoder().decode(body))
      if (!meta?.id || !meta?.chunks) return
      // 最多同时缓存 3 张，防止旧图没发完就堆着占内存
      while (pendingImages.size >= 3) {
        pendingImages.delete(pendingImages.keys().next().value)
      }
      pendingImages.set(meta.id, {
        meta,
        chunks: new Array(Number(meta.chunks)),
        at: Date.now(),
      })
      updateProgress()
    } catch {
      pushLog('图片元信息解析失败', 'warn')
    }
    return
  }

  // 设备发图失败时会主动通知，把没拼完的半成品清掉
  if (topic === `${dp}/img/abort`) {
    try {
      const a = JSON.parse(new TextDecoder().decode(body))
      if (a?.id) {
        pendingImages.delete(a.id)
        pushLog(`设备发送图片中断（${a.got}/${a.chunks} 片），已放弃这张`, 'warn')
        updateProgress()
      }
    } catch {
      /* 忽略 */
    }
    return
  }

  const imgPrefix = `${dp}/img/data/`
  if (topic.startsWith(imgPrefix)) {
    const rest = topic.slice(imgPrefix.length)
    const [id, idxStr] = rest.split('/')
    const idx = Number(idxStr)
    const pending = pendingImages.get(id)
    if (!pending || !Number.isInteger(idx) || idx < 0 || idx >= pending.chunks.length) return
    pending.chunks[idx] = body
    updateProgress()
    finishImage(id)
  }
}

export function connect() {
  disconnect()

  if (!cfg.url) {
    state.error = '未填写 MQTT 地址'
    return
  }
  if (!cfg.dataTopic) {
    state.error = '未填写数据主题'
    return
  }

  state.connecting = true
  state.error = ''

  const c = mqtt.connect(cfg.url, {
    clientId: 's3db-web-' + Math.random().toString(16).slice(2, 10),
    clean: true,
    keepalive: 30,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    protocolVersion: 4,
  })
  client = c

  c.on('connect', () => {
    state.connected = true
    state.connecting = false
    state.error = ''
    pushLog(`已连接 ${cfg.url}`, 'ok')
    c.subscribe(`${cfg.dataTopic}/#`, { qos: 0 }, (err) => {
      if (err) pushLog(`订阅失败：${err.message}`, 'error')
      else pushLog(`已订阅 ${cfg.dataTopic}/#`, 'ok')
    })
    // 主动要一包最新状态，别等下一个 5 秒
    c.publish(cfg.cmdTopic, JSON.stringify({ cmd: 'status', k: cfg.key }))
  })

  c.on('reconnect', () => {
    state.connecting = true
    pushLog('正在重连…', 'warn')
  })

  c.on('close', () => {
    state.connected = false
  })

  c.on('error', (err) => {
    state.error = err?.message || String(err)
    state.connecting = false
    pushLog(`连接错误：${state.error}`, 'error')
  })

  c.on('message', onMessage)
}

export function disconnect() {
  if (client) {
    try {
      client.removeAllListeners()
      client.end(true)
    } catch {
      /* ignore */
    }
    client = null
  }
  state.connected = false
  state.connecting = false
}

export function sendCmd(cmd, extra = {}) {
  if (!client || !client.connected) {
    pushLog('未连接，命令没有发出去', 'warn')
    return false
  }
  const payload = JSON.stringify({ cmd, k: cfg.key, ts: Math.floor(Date.now() / 1000), ...extra })
  client.publish(cfg.cmdTopic, payload)
  pushLog(`→ 已发送 ${cmd}`)
  return true
}

/* ---------------- 派生状态 ---------------- */

export function deviceOnline() {
  if (!state.deviceAt) return false
  const fresh = state.now - state.deviceAt < 15000
  return !!state.device.online && fresh
}

export function lastStatusAgo() {
  if (!state.deviceAt) return '—'
  const s = Math.round((state.now - state.deviceAt) / 1000)
  if (s < 2) return '刚刚'
  if (s < 60) return `${s} 秒前`
  return `${Math.round(s / 60)} 分钟前`
}
