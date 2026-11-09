import { reactive } from 'vue'

/**
 * 家人照片（纯前端存储）
 *
 * 特征库在设备端的 SPIFFS 里，只存"特征向量"，没有照片、也没有姓名。
 * 所以"查看已录入的家人长什么样"这件事，靠设备是拿不到的 —— 但也不必做后端：
 * 设备在**录入成功**的那次抓拍里，本来就会把这一帧 JPEG 通过 MQTT 发出来，
 * 网页把它按「家人N」存进 localStorage 就行。
 *
 * 局限（要清楚）：
 *   - 照片只存在这台浏览器里，换电脑/清缓存就没了（特征库还在设备上）；
 *   - 编号 = 录入时特征库的人数，清空重录后编号会复用，所以清库时要一起清掉；
 *   - 不做人脸-姓名的绑定（那需要设备暴露特征索引，属于后续功能）。
 */

const KEY = 's3db:faces'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export const family = reactive(load())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(family))
  } catch {
    // 配额满了就只留在内存里，不影响主流程
  }
}

/** 存一张家人照片，n = 录入后特征库人数（1..N） */
export function saveFace(n, dataUrl, ts) {
  const idx = Number(n)
  if (!Number.isFinite(idx) || idx <= 0 || !dataUrl) return
  family[String(idx)] = { dataUrl, ts: Number(ts) || Math.floor(Date.now() / 1000) }
  persist()
}

export function getFace(n) {
  return family[String(n)] || null
}

export function clearFaces() {
  Object.keys(family).forEach((k) => delete family[k])
  persist()
}

export function faceCount() {
  return Object.keys(family).length
}
