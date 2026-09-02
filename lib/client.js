// dsh-reminder —— Client 半端（ModuleLoader 静态 bundle）
// 输入框上方显示最近提醒倒计时；右侧图标打开管理面板；轮询到期提醒并弹系统通知。
window.__ModuleLoader__.load({
  id: 'dsh-reminder',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    var React = require('react');

    async function api(name, args) {
      const res = await fetch('/reminder/api/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return await res.json()
    }

    function insertStyles(css) {
      try {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
        return () => { try { style.remove() } catch (e) { /* ignore */ } }
      } catch (e) { return function () {} }
    }

    const css = `
.rem-ibtn{width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none;padding:0;}
.rem-ibtn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);}
.rem-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 10px;border-radius:999px;border:1px solid rgba(128,128,128,.25);background:rgba(128,128,128,.08);cursor:pointer;color:var(--dsw-alias-label-secondary);max-width:260px;}
.rem-chip:hover{color:var(--dsw-alias-label-primary);border-color:rgba(128,128,128,.45);}
.rem-chip .t{font-variant-numeric:tabular-nums;font-weight:700;}
.rem-chip.due{border-color:#f59e0b;color:#f59e0b;animation:rem-pulse 1.2s infinite;}
@keyframes rem-pulse{0%,100%{opacity:1}50%{opacity:.55}}
.rem-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px;}
.rem-panel{width:520px;max-width:94vw;max-height:86vh;overflow:auto;border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 18px 60px rgba(0,0,0,.35);padding:18px 20px;font-size:13px;}
.rem-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.rem-title{font-size:15px;font-weight:700;}
.rem-close{border:none;background:transparent;cursor:pointer;font-size:16px;color:inherit;opacity:.6;padding:4px 8px;border-radius:6px;}
.rem-close:hover{opacity:1;background:rgba(128,128,128,.15);}
.rem-form{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.rem-form input{flex:1;min-width:120px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;padding:6px 10px;font-size:13px;}
.rem-form input.msg{flex:2 1 100%;}
.rem-add{border:none;border-radius:8px;background:#4d6bfe;color:#fff;padding:6px 14px;cursor:pointer;font-size:13px;}
.rem-add:hover{filter:brightness(1.1);}
.rem-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.15);margin-bottom:8px;}
.rem-item .msg{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rem-item .due{font-variant-numeric:tabular-nums;opacity:.6;font-size:12px;flex:none;}
.rem-item .act{border:none;background:transparent;cursor:pointer;opacity:.55;font-size:12px;padding:2px 6px;border-radius:6px;color:inherit;flex:none;}
.rem-item .act:hover{opacity:1;background:rgba(128,128,128,.15);}
.rem-empty{opacity:.5;text-align:center;padding:24px 0;}
.rem-toast{position:fixed;right:20px;bottom:20px;z-index:2147483600;display:flex;flex-direction:column;gap:8px;}
.rem-toast-card{width:320px;border-radius:12px;padding:12px 14px;background:#1f2437;color:#fff;box-shadow:0 10px 40px rgba(0,0,0,.4);animation:rem-in .25s;}
@keyframes rem-in{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.rem-toast-card .h{font-weight:700;margin-bottom:4px;color:#fbbf24;}
.rem-toast-card .b{font-size:13px;}
.rem-toast-card .f{margin-top:8px;display:flex;gap:8px;}
.rem-toast-card button{border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:12px;}
.rem-toast-card button.pri{background:#4d6bfe;border-color:#4d6bfe;}
`

    function fmtCountdown(ms) {
      const s = Math.max(0, Math.floor(ms / 1000))
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
      return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0') : m + ':' + String(ss).padStart(2, '0')
    }
    function fmtTime(ts) {
      const d = new Date(ts), pad = (n) => String(n).padStart(2, '0')
      return pad(d.getHours()) + ':' + pad(d.getMinutes())
    }
    function fmtFull(ts) {
      const d = new Date(ts), pad = (n) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    function beep() {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ac.createOscillator(), gain = ac.createGain()
        osc.connect(gain); gain.connect(ac.destination)
        osc.type = 'sine'; osc.frequency.value = 880
        gain.gain.setValueAtTime(0.001, ac.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6)
        osc.start(); osc.stop(ac.currentTime + 0.65)
        setTimeout(() => { try { ac.close() } catch (e) { /* ignore */ } }, 900)
      } catch (e) { /* 无声环境 */ }
    }

    function notify(message) {
      try {
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('⏰ DeepSeek 提醒', { body: message, tag: 'dsh-reminder-' + Date.now() })
        } else if (window.Notification && Notification.permission !== 'denied') {
          Notification.requestPermission()
        }
      } catch (e) { /* ignore */ }
      beep()
    }

    // ===== 到期弹窗 toast =====
    function Toasts({ items, onAck, onSnooze }) {
      if (!items.length) return null
      return React.createElement('div', { className: 'rem-toast' },
        items.map((r) => React.createElement('div', { key: r.id, className: 'rem-toast-card' },
          React.createElement('div', { className: 'h' }, '⏰ 时间到了'),
          React.createElement('div', { className: 'b' }, r.message),
          React.createElement('div', { className: 'f' },
            React.createElement('button', { className: 'pri', onClick: () => onAck(r.id) }, '完成'),
            React.createElement('button', { onClick: () => onSnooze(r.id, 10) }, '再睡 10 分钟'),
          ),
        )))
    }

    // ===== 管理面板 =====
    function Panel({ onClose }) {
      const [list, setList] = React.useState(null)
      const [msg, setMsg] = React.useState('')
      const [at, setAt] = React.useState('')
      const [err, setErr] = React.useState('')

      async function refresh() {
        try { const d = await api('list'); setList(d.reminders || []) } catch (e) { setErr(String(e.message || e)) }
      }
      React.useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [])

      async function add() {
        if (!msg.trim() || !at.trim()) { setErr('内容和时间都要填'); return }
        setErr('')
        const d = await api('add', { message: msg.trim(), at: at.trim() })
        if (d.error) { setErr(d.error); return }
        setMsg(''); setAt(''); refresh()
      }
      async function cancel(id) { await api('cancel', { id }); refresh() }
      async function snooze(id) { await api('snooze', { id, minutes: 10 }); refresh() }

      return React.createElement('div', { className: 'rem-overlay', onClick: onClose },
        React.createElement('div', { className: 'rem-panel', onClick: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'rem-head' },
            React.createElement('div', { className: 'rem-title' }, '⏰ 定时提醒'),
            React.createElement('button', { className: 'rem-close', onClick: onClose }, '✕'),
          ),
          React.createElement('div', { className: 'rem-form' },
            React.createElement('input', { className: 'msg', placeholder: '提醒内容，如：喝水 / 站起来活动 / 开会', value: msg, onChange: (e) => setMsg(e.target.value) }),
            React.createElement('input', { placeholder: '时间 HH:MM（或 25m）', value: at, onChange: (e) => setAt(e.target.value), style: { width: 150 } }),
            React.createElement('button', { className: 'rem-add', onClick: add }, '添加'),
          ),
          err ? React.createElement('div', { style: { color: '#ef4444', fontSize: 12, marginBottom: 8 } }, err) : null,
          list === null ? React.createElement('div', { className: 'rem-empty' }, '加载中…')
            : list.length ? list.map((r) => React.createElement('div', { key: r.id, className: 'rem-item' },
              React.createElement('span', null, r.dueTs <= Date.now() ? '🔥' : '⏰'),
              React.createElement('span', { className: 'msg', title: r.message }, r.message),
              React.createElement('span', { className: 'due' }, fmtFull(r.dueTs)),
              React.createElement('button', { className: 'act', onClick: () => snooze(r.id) }, '+10m'),
              React.createElement('button', { className: 'act', onClick: () => cancel(r.id) }, '取消'),
            ))
              : React.createElement('div', { className: 'rem-empty' }, '没有未完成的提醒。对 AI 说「20分钟后提醒我…」试试'),
        ))
    }

    // ===== 输入框上方的小倒计时 chip =====
    function Chip({ onClick }) {
      const [next, setNext] = React.useState(null)
      const [dueCount, setDueCount] = React.useState(0)
      const [, forceTick] = React.useState(0)

      React.useEffect(() => {
        let alive = true
        async function tick() {
          try {
            const d = await api('pending')
            if (!alive) return
            const due = d.due || []
            setDueCount(due.length)
            if (due.length) {
              notifyEach(due)
              // 到期了就地标记 ack 由用户在 toast 操作；这里只把最近一条作为 chip
              setNext(due[0])
            } else {
              const l = await api('list')
              if (!alive) return
              const act = (l.reminders || []).filter((r) => r.dueTs > Date.now())
              setNext(act.length ? act[0] : null)
            }
          } catch (e) { /* 静默 */ }
        }
        const seen = new Set()
        function notifyEach(due) {
          for (const r of due) {
            if (seen.has(r.id)) continue
            seen.add(r.id)
            notify(r.message)
            api('ack', { id: r.id }).catch(() => {}) // 弹了就先置已发，避免重复；用户可在 toast 完成或小睡
            break // 一次弹一条
          }
        }
        tick()
        const t = setInterval(tick, 5000)
        const t2 = setInterval(() => forceTick((x) => x + 1), 1000) // 每秒刷新倒计时
        return () => { alive = false; clearInterval(t); clearInterval(t2) }
      }, [])

      if (!next) return null
      const isDue = next.dueTs <= Date.now()
      return React.createElement('div', {
        className: 'rem-chip' + (isDue ? ' due' : ''), onClick, title: '定时提醒',
      },
        React.createElement('span', null, isDue ? '🔥 到点了：' : '⏰ '),
        React.createElement('span', { className: 't' }, isDue ? next.message.slice(0, 12) : fmtCountdown(next.dueTs - Date.now())),
        dueCount > 1 ? React.createElement('span', null, '（+' + (dueCount - 1) + '）') : null,
      )
    }

    function App() {
      const [open, setOpen] = React.useState(false)
      const [toasts, setToasts] = React.useState([])
      // toast 队列由 chip 轮询产生，这里只处理 ack/snooze —— 简化：toast 在 Panel 外独立维护太复杂，
      // 直接用系统通知 + chip 状态即可；toast 组件保留给未来扩展。
      async function ack(id) { await api('ack', { id }) }
      async function snooze(id, minutes) { await api('snooze', { id, minutes }) }
      return React.createElement(React.Fragment, null,
        React.createElement(Chip, { onClick: () => setOpen(true) }),
        React.createElement(IconBtn, { onClick: () => setOpen(true) }),
        open ? React.createElement(Panel, { onClose: () => setOpen(false) }) : null,
        React.createElement(Toasts, { items: toasts, onAck: ack, onSnooze: snooze }),
      )
    }

    function IconBtn({ onClick }) {
      return React.createElement('button', { className: 'rem-ibtn', onClick, title: '定时提醒' },
        React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('circle', { cx: 12, cy: 13, r: 8 }),
          React.createElement('path', { d: 'M12 9v4l2.5 2.5' }),
          React.createElement('path', { d: 'M5 3 2 6' }), React.createElement('path', { d: 'M19 3l3 3' }),
        ))
    }

    const inject = ['timer']

    function apply(ctx) {
      insertStyles(css)
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('conversation.composer.dock', () => slots.register(
        { name: 'conversation.composer.dock', id: 'reminder-chip', order: 80, label: '定时提醒' },
        () => React.createElement(ChipAndPanel),
      ))
      slots.inject('conversation.input.right', () => slots.register(
        { name: 'conversation.input.right', id: 'reminder-btn', order: 95, label: '定时提醒' },
        () => React.createElement(App),
      ))
    }

    // Chip 自带面板开关（dock 里点击也要能打开面板）
    function ChipAndPanel() {
      const [open, setOpen] = React.useState(false)
      return React.createElement(React.Fragment, null,
        React.createElement(Chip, { onClick: () => setOpen(true) }),
        open ? React.createElement(Panel, { onClose: () => setOpen(false) }) : null,
      )
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
