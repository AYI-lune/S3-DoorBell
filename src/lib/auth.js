import { sha256Hex } from './sha256'

/**
 * 账号体系（纯前端）
 *
 * 存储：localStorage
 *   s3db:users   [{ id, name, role, salt, hash, created }]
 *   s3db:session { id, exp }
 *
 * 这不是生产级认证 —— 没有服务端，谁拿到浏览器就能改 localStorage。
 * 它解决的是「别人打开我的网页不能随便按门铃 / 清特征库」，
 * 以及演示「有注册就得有删除」的完整增删流程。
 */

const USERS_KEY = 's3db:users'
const SESSION_KEY = 's3db:session'
const SESSION_DAYS = 7

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const v = JSON.parse(raw)
    return v ?? fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function loadUsers() {
  const u = readJSON(USERS_KEY, [])
  return Array.isArray(u) ? u : []
}

function saveUsers(list) {
  writeJSON(USERS_KEY, list)
}

function newId() {
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function newSalt() {
  const a = new Uint8Array(8)
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(a)
  } else {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256)
  }
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hashOf(password, salt) {
  return sha256Hex(`s3db:${salt}:${password}`)
}

/** 对外只暴露安全字段，永远不要把 hash 传到界面层 */
function publicUser(u) {
  return { id: u.id, name: u.name, role: u.role, created: u.created }
}

export function hasAnyUser() {
  return loadUsers().length > 0
}

export function listUsers() {
  return loadUsers()
    .slice()
    .sort((a, b) => a.created - b.created)
    .map(publicUser)
}

export function getUser(id) {
  const u = loadUsers().find((x) => x.id === id)
  return u ? publicUser(u) : null
}

export function currentSession() {
  const s = readJSON(SESSION_KEY, null)
  if (!s || !s.id || !s.exp) return null
  if (Date.now() > s.exp) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  const u = loadUsers().find((x) => x.id === s.id)
  return u ? publicUser(u) : null
}

export function register({ name, password, role }) {
  const username = String(name || '').trim()
  if (username.length < 2 || username.length > 16) {
    return { ok: false, error: '用户名请用 2~16 个字符' }
  }
  if (String(password || '').length < 6) {
    return { ok: false, error: '密码至少 6 位' }
  }

  const users = loadUsers()
  if (users.some((u) => u.name.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: '这个用户名已经被注册了' }
  }

  // 第一个账号自动成为管理员；之后注册的一律是普通成员
  const finalRole = users.length === 0 ? 'admin' : role === 'admin' ? 'admin' : 'member'

  const salt = newSalt()
  const user = {
    id: newId(),
    name: username,
    role: finalRole,
    salt,
    hash: hashOf(password, salt),
    created: Date.now(),
  }
  users.push(user)
  saveUsers(users)
  return { ok: true, user: publicUser(user) }
}

export function login({ name, password }) {
  const username = String(name || '').trim()
  const users = loadUsers()
  const u = users.find((x) => x.name.toLowerCase() === username.toLowerCase())
  if (!u) return { ok: false, error: '用户不存在' }
  if (u.hash !== hashOf(password, u.salt)) return { ok: false, error: '密码不正确' }

  writeJSON(SESSION_KEY, { id: u.id, exp: Date.now() + SESSION_DAYS * 86400_000 })
  return { ok: true, user: publicUser(u) }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

/**
 * 删除账号。
 * 两条硬约束：
 *   1) 不能删自己（删完就没人能管这个页面了）
 *   2) 不能删掉最后一个管理员
 */
export function removeUser(id, operatorId) {
  const users = loadUsers()
  const target = users.find((u) => u.id === id)
  if (!target) return { ok: false, error: '账号不存在' }
  if (id === operatorId) return { ok: false, error: '不能删除当前登录的账号' }
  if (target.role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
    return { ok: false, error: '至少要保留一个管理员' }
  }
  saveUsers(users.filter((u) => u.id !== id))
  return { ok: true }
}

/** 管理员重置别人的密码（不需要旧密码） */
export function resetPassword(id, newPassword) {
  if (String(newPassword || '').length < 6) {
    return { ok: false, error: '密码至少 6 位' }
  }
  const users = loadUsers()
  const u = users.find((x) => x.id === id)
  if (!u) return { ok: false, error: '账号不存在' }
  u.salt = newSalt()
  u.hash = hashOf(newPassword, u.salt)
  saveUsers(users)
  return { ok: true }
}

/** 自己改自己的密码，要验旧密码 */
export function changePassword(id, oldPassword, newPassword) {
  if (String(newPassword || '').length < 6) {
    return { ok: false, error: '新密码至少 6 位' }
  }
  const users = loadUsers()
  const u = users.find((x) => x.id === id)
  if (!u) return { ok: false, error: '账号不存在' }
  if (u.hash !== hashOf(oldPassword, u.salt)) return { ok: false, error: '原密码不正确' }
  u.salt = newSalt()
  u.hash = hashOf(newPassword, u.salt)
  saveUsers(users)
  return { ok: true }
}

export function setRole(id, role) {
  const users = loadUsers()
  const u = users.find((x) => x.id === id)
  if (!u) return { ok: false, error: '账号不存在' }
  if (role !== 'admin' && role !== 'member') return { ok: false, error: '角色非法' }
  if (u.role === 'admin' && role === 'member') {
    if (users.filter((x) => x.role === 'admin').length <= 1) {
      return { ok: false, error: '至少要保留一个管理员' }
    }
  }
  u.role = role
  saveUsers(users)
  return { ok: true }
}
