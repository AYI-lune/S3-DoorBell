import { reactive } from 'vue'

/** 极简 toast，不引组件库：一条消息 + 类型，2.8 秒自动消失 */
export const toasts = reactive([])

let seq = 0

export function toast(text, type = 'info', ms = 2800) {
  const id = ++seq
  toasts.push({ id, text, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, ms)
}
