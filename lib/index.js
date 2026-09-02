// dsh-reminder —— Server 半端（Host 进程插件）
// 给 Agent 三个工具：reminder_set / reminder_list / reminder_cancel。
// 提醒持久化在 ~/.dsh/dsh-reminder/reminders.json（跨重启保留）。
// 浏览器端轮询 POST /reminder/api/pending 拿到期提醒并弹系统通知。
// 零依赖。

import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const name = 'dsh-reminder'
export const inject = ['webServer', 'tools']

const STORE_DIR = path.join(os.homedir(), '.dsh', 'dsh-reminder')
const STORE_FILE = path.join(STORE_DIR, 'reminders.json')

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
  } catch {
    return { reminders: [] }
  }
}

function saveStore(store) {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true })
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
  } catch { /* 磁盘失败时保底内存态 */ }
}

// 解析 dueTime：{minutes: 20} 或 {at: "14:30"}（今天已过则排到明天）
function resolveDue(args) {
  const now = new Date()
  if (args && Number.isFinite(args.minutes) && args.minutes > 0) {
    return now.getTime() + Math.round(args.minutes * 60 * 1000)
  }
  if (args && typeof args.at === 'string') {
    const m = args.at.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (m) {
      const t = new Date(now)
      t.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0)
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1) // 已过 → 明天
      return t.getTime()
    }
  }
  return null
}

export function apply(ctx) {
  const webServer = ctx.webServer
  let store = loadStore()

  const persist = () => saveStore(store)
  const active = () => store.reminders.filter((r) => !r.done)
  const pending = () => active().filter((r) => r.dueTs <= Date.now())

  function registerRoute(rpcName, handler) {
    if (!webServer) return
    webServer.register({
      kind: 'exact',
      path: '/reminder/api/' + rpcName,
      handler: async (req, res) => {
        let body = ''
        try { for await (const chunk of req) body += chunk } catch { /* ignore */ }
        let result
        try { result = await handler(body ? JSON.parse(body) : {}) } catch (e) {
          result = { error: String((e && e.message) || e).slice(0, 500) }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
      },
    })
  }

  // ===== RPC =====
  registerRoute('list', async () => ({ reminders: active().sort((a, b) => a.dueTs - b.dueTs), now: Date.now() }))
  registerRoute('pending', async () => ({ due: pending().sort((a, b) => a.dueTs - b.dueTs), now: Date.now() }))
  registerRoute('ack', async (args) => {
    const r = store.reminders.find((x) => x.id === args.id)
    if (r) { r.done = true; r.doneTs = Date.now(); persist() }
    return { ok: !!r }
  })
  registerRoute('cancel', async (args) => {
    const r = store.reminders.find((x) => x.id === args.id && !x.done)
    if (r) { r.done = true; r.cancelled = true; r.doneTs = Date.now(); persist() }
    return { ok: !!r }
  })
  registerRoute('snooze', async (args) => {
    const r = store.reminders.find((x) => x.id === args.id && !x.done)
    if (r && Number(args.minutes) > 0) {
      r.dueTs = Date.now() + Math.round(Number(args.minutes) * 60 * 1000)
      persist()
      return { ok: true, dueTs: r.dueTs }
    }
    return { ok: false }
  })
  registerRoute('add', async (args) => {
    const dueTs = resolveDue(args)
    if (!dueTs || !args.message) return { error: 'minutes 或 at(HH:MM) 之一 + message 必填' }
    const r = {
      id: crypto.randomUUID(),
      message: String(args.message).slice(0, 500),
      dueTs,
      createdTs: Date.now(),
      source: 'ui',
      done: false,
    }
    store.reminders.push(r)
    persist()
    return { ok: true, reminder: r }
  })

  // ===== Agent 工具 =====
  const tools = ctx.tools
  if (tools && typeof tools.register === 'function') {
    const stringOutput = {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    }
    const fmt = (ts) => {
      const d = new Date(ts)
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    tools.register({
      name: 'reminder_set',
      description:
        'Set a reminder for the user; fires a desktop browser notification when due. Survives server restarts. ' +
        'Provide EITHER `minutes` (from now) OR `at` (HH:MM local time; if already past today it fires tomorrow) — never both, never other formats. ' +
        'Use when the user says things like "20分钟后提醒我喝水" / "下午3点提醒我开会" / "remind me in 30 min". ' +
        'Convert natural language time expressions into minutes or HH:MM yourself before calling.',
      parameters: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: 'Minutes from now, e.g. 20. Use this OR `at`.' },
          at: { type: 'string', description: 'Local wall-clock time "HH:MM" (24h), e.g. "15:30". Use this OR `minutes`.' },
          message: { type: 'string', description: 'What to remind, kept verbatim from the user, e.g. "喝水" / "开会"' },
        },
        additionalProperties: false,
      },
      output: stringOutput,
      async execute(args) {
        const dueTs = resolveDue(args)
        if (!dueTs) return '设置失败：需要 minutes（分钟数）或 at（HH:MM）之一'
        const message = String(args.message || '提醒').slice(0, 500)
        const r = {
          id: crypto.randomUUID(),
          message,
          dueTs,
          createdTs: Date.now(),
          source: 'agent',
          done: false,
        }
        store.reminders.push(r)
        persist()
        const diffMin = Math.max(1, Math.round((dueTs - Date.now()) / 60000))
        return `✅ 已设置提醒：「${message}」· 到点时间 ${fmt(dueTs)}（约 ${diffMin >= 60 ? Math.round(diffMin / 60) + ' 小时' : diffMin + ' 分钟'}后）。到点时浏览器会弹窗通知。`
      },
    })

    tools.register({
      name: 'reminder_list',
      description: 'List all active (not yet fired/cancelled) reminders with their due times. Zero side effects.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: stringOutput,
      async execute() {
        const list = active().sort((a, b) => a.dueTs - b.dueTs)
        if (!list.length) return '当前没有未完成的提醒。'
        return list.map((r, i) => `${i + 1}. 「${r.message}」· ${fmt(r.dueTs)}${r.source === 'agent' ? '' : '（手动添加）'}`).join('\n')
      },
    })

    tools.register({
      name: 'reminder_cancel',
      description: 'Cancel one active reminder by its index in reminder_list output (1-based).',
      parameters: {
        type: 'object',
        properties: { index: { type: 'number', description: '1-based index from reminder_list' } },
        required: ['index'],
        additionalProperties: false,
      },
      output: stringOutput,
      async execute(args) {
        const list = active().sort((a, b) => a.dueTs - b.dueTs)
        const r = list[Number(args.index) - 1]
        if (!r) return '取消失败：序号无效，请先用 reminder_list 查看。'
        r.done = true
        r.cancelled = true
        r.doneTs = Date.now()
        persist()
        return `已取消提醒：「${r.message}」`
      },
    })
  }

  // 周期整理：把 3 天前的已完成记录清掉，防文件膨胀
  const cleanup = () => {
    const cutoff = Date.now() - 3 * 86400 * 1000
    const before = store.reminders.length
    store.reminders = store.reminders.filter((r) => !r.done || (r.doneTs || 0) > cutoff)
    if (store.reminders.length !== before) persist()
  }
  cleanup()
  const t = setInterval(cleanup, 3600 * 1000)
  try { ctx.effect?.(() => () => clearInterval(t)) } catch { /* ignore */ }
}
