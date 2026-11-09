export function fmtTime(ts) {
  if (!ts) return '--:--'
  const d = new Date(Number(ts) * 1000)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

export function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts) * 1000)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', { hour12: false })}`
}

export function fmtAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - Number(ts) * 1000
  if (diff < 0) return '刚刚'
  const s = Math.floor(diff / 1000)
  if (s < 10) return '刚刚'
  if (s < 60) return `${s} 秒前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

export function fmtUptime(sec) {
  const s = Number(sec || 0)
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h < 24) return `${h} 小时 ${mm} 分`
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`
}

export const EVENT_META = {
  door: { label: '门铃按下', icon: 'bell', tone: 'accent' },
  pir: { label: '人体感应', icon: 'motion', tone: 'blue' },
  snap: { label: '远程抓拍', icon: 'camera', tone: 'blue' },
  enroll: { label: '人脸录入', icon: 'userplus', tone: 'violet' },
  clear: { label: '清空特征库', icon: 'trash', tone: 'danger' },
  unlock: { label: '远程开锁', icon: 'lock', tone: 'danger' },
  other: { label: '设备事件', icon: 'chip', tone: 'muted' },
}

export function eventMeta(e) {
  return EVENT_META[e?.type] || EVENT_META.other
}

/** 一次事件的人类可读结论 */
export function eventResult(e) {
  if (!e) return ''
  if (e.type === 'clear') return '特征库已清空'
  if (e.type === 'unlock') return '舵机已动作'
  if (e.type === 'enroll') return e.enrolled ? '录入成功' : '录入失败'
  if (e.family) return '家人'
  if (e.face) return '陌生人'
  return '未检测到人脸'
}

export function eventTone(e) {
  if (!e) return 'muted'
  if (e.type === 'clear' || e.type === 'unlock') return 'danger'
  if (e.type === 'enroll') return e.enrolled ? 'ok' : 'warn'
  if (e.family) return 'ok'
  if (e.face) return 'warn'
  return 'muted'
}
