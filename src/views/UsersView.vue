<script setup>
import { computed, reactive, ref } from 'vue'
import Icon from '../components/Icon.vue'
import {
  currentSession,
  listUsers,
  register,
  removeUser,
  resetPassword,
  setRole,
} from '../lib/auth'
import { fmtDateTime } from '../lib/format'
import { toast } from '../lib/toast'

const props = defineProps({ user: { type: Object, default: () => ({}) } })

const users = ref(listUsers())
const form = reactive({ name: '', password: '', role: 'member' })
const error = ref('')
const resetFor = ref('')
const resetPw = ref('')
const confirmDel = ref('')
const confirmSelf = ref(false)

const isAdmin = computed(() => props.user?.role === 'admin')
const me = computed(() => currentSession() || props.user)

function refresh() {
  users.value = listUsers()
}

function addUser() {
  error.value = ''
  if (!isAdmin.value) {
    error.value = '只有管理员能添加账号'
    return
  }
  const r = register({ name: form.name, password: form.password, role: form.role })
  if (!r.ok) {
    error.value = r.error
    return
  }
  toast(`已添加账号「${r.user.name}」`, 'ok')
  form.name = ''
  form.password = ''
  form.role = 'member'
  refresh()
}

function startReset(u) {
  resetFor.value = resetFor.value === u.id ? '' : u.id
  resetPw.value = ''
}

function doReset(u) {
  const r = resetPassword(u.id, resetPw.value)
  if (!r.ok) {
    toast(r.error, 'error')
    return
  }
  toast(`已重置「${u.name}」的密码`, 'ok')
  resetFor.value = ''
  resetPw.value = ''
}

function askDelete(u) {
  if (u.id === me.value.id) {
    confirmSelf.value = true
    setTimeout(() => (confirmSelf.value = false), 3000)
    return
  }
  if (confirmDel.value === u.id) {
    const r = removeUser(u.id, me.value.id)
    if (!r.ok) {
      toast(r.error, 'error')
    } else {
      toast(`已删除账号「${u.name}」`, 'ok')
    }
    confirmDel.value = ''
    refresh()
    return
  }
  confirmDel.value = u.id
  setTimeout(() => {
    if (confirmDel.value === u.id) confirmDel.value = ''
  }, 4000)
}

function toggleRole(u) {
  const next = u.role === 'admin' ? 'member' : 'admin'
  const r = setRole(u.id, next)
  if (!r.ok) {
    toast(r.error, 'error')
    return
  }
  toast(`「${u.name}」现在是${next === 'admin' ? '管理员' : '成员'}`, 'ok')
  refresh()
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1>账号管理</h1>
      <p class="sub">账号只存在这台设备的浏览器里，用来限制谁能操作门铃</p>
    </div>
    <span class="pill" :class="isAdmin ? 'tone-ok' : 'tone-muted'">
      {{ isAdmin ? '管理员' : '普通成员' }}
    </span>
  </div>

  <section class="grid">
    <article v-if="isAdmin" class="card col-5">
      <div class="card-head">
        <div class="card-title"><Icon name="userplus" :size="17" /><b>添加账号</b></div>
      </div>

      <form class="stack" @submit.prevent="addUser">
        <label class="field">
          <span>用户名</span>
          <div class="input-wrap">
            <Icon name="user" :size="16" />
            <input v-model.trim="form.name" placeholder="2~16 个字符" autocomplete="off" />
          </div>
        </label>

        <label class="field">
          <span>初始密码</span>
          <div class="input-wrap">
            <Icon name="lock" :size="16" />
            <input v-model="form.password" type="password" placeholder="至少 6 位" autocomplete="new-password" />
          </div>
        </label>

        <label class="field">
          <span>角色</span>
          <div class="select-wrap">
            <select v-model="form.role">
              <option value="member">普通成员 · 只能看和控制</option>
              <option value="admin">管理员 · 可管理账号</option>
            </select>
          </div>
        </label>

        <Transition name="fade">
          <p v-if="error" class="form-error"><Icon name="alert" :size="15" />{{ error }}</p>
        </Transition>

        <button class="btn primary block" type="submit">
          <Icon name="plus" :size="16" />创建账号
        </button>
      </form>

      <p class="hint"><Icon name="alert" :size="14" />密码用 SHA-256 加盐后存储，但仍然挡不住能直接改浏览器数据的人。</p>
    </article>

    <article class="card" :class="isAdmin ? 'col-7' : 'col-12'">
      <div class="card-head">
        <div class="card-title"><Icon name="users" :size="17" /><b>全部账号</b></div>
        <span class="pill ghost">{{ users.length }} 个</span>
      </div>

      <div class="user-table">
        <div v-for="u in users" :key="u.id" class="user-row">
          <span class="avatar">{{ u.name.slice(0, 1).toUpperCase() }}</span>

          <div class="user-main">
            <div class="user-line">
              <b>{{ u.name }}</b>
              <span v-if="u.id === me.id" class="pill tiny tone-ok">当前登录</span>
              <span class="pill tiny" :class="u.role === 'admin' ? 'tone-violet' : 'tone-muted'">
                {{ u.role === 'admin' ? '管理员' : '成员' }}
              </span>
            </div>
            <div class="user-sub">创建于 {{ fmtDateTime(u.created / 1000) }}</div>
          </div>

          <div class="user-actions">
            <button v-if="isAdmin" class="icon-btn sm" title="重置密码" @click="startReset(u)">
              <Icon name="key" :size="15" />
            </button>
            <button v-if="isAdmin" class="icon-btn sm" title="切换角色" @click="toggleRole(u)">
              <Icon name="shield" :size="15" />
            </button>
            <button
              class="icon-btn sm danger"
              :class="{ armed: confirmDel === u.id || (confirmSelf && u.id === me.id) }"
              :title="u.id === me.id ? '不能删除当前账号' : '删除账号'"
              :disabled="u.id === me.id"
              @click="askDelete(u)"
            >
              <Icon name="trash" :size="15" />
            </button>
          </div>

          <Transition name="fade">
            <div v-if="resetFor === u.id" class="reset-row">
              <div class="input-wrap grow">
                <Icon name="lock" :size="15" />
                <input v-model="resetPw" type="password" placeholder="输入新密码（至少 6 位）" />
              </div>
              <button class="btn sm primary" @click="doReset(u)">保存</button>
              <button class="btn sm ghost" @click="resetFor = ''">取消</button>
            </div>
          </Transition>

          <div v-if="confirmDel === u.id" class="confirm-strip">
            删除后该账号立即失效（不影响设备）。再点一次删除按钮确认。
          </div>
          <div v-else-if="confirmSelf && u.id === me.id" class="confirm-strip warn">
            不能删除当前登录的账号 —— 否则就没人能管理这个页面了。
          </div>
        </div>
      </div>

      <div v-if="!users.length" class="empty-state">
        <Icon name="users" :size="26" /><b>没有账号</b>
      </div>

      <div v-if="!isAdmin" class="card-foot">
        <span class="muted">普通成员可以查看账号列表，但只有管理员能增删和改密码。</span>
      </div>
    </article>
  </section>
</template>
