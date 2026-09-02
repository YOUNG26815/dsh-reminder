# dsh-reminder · 对话式定时提醒 ⏰

对 AI 说一句话就能设提醒，到点浏览器弹窗 + 响铃，**重启服务也不会丢**。

**English**: Conversational reminders for DeepSeek Harness. Tell the agent "remind me to drink water in 20 minutes" — fires a desktop notification when due. Reminders persist across restarts.

## ✨ 功能

### 🤖 Agent 工具（AI 可直接调用）

| 工具 | 说明 |
|------|------|
| `reminder_set` | 设提醒：支持 `minutes`（N 分钟后）或 `at`（HH:MM，已过则排到明天） |
| `reminder_list` | 列出所有未完成提醒 |
| `reminder_cancel` | 按序号取消提醒 |

对话示例：

> 你：**"20分钟后提醒我喝水"**
> AI：*（调用 reminder_set）* ✅ 已设置提醒：「喝水」· 到点时间 15:37（约 20 分钟后）。到点时浏览器会弹窗通知。

> 你：**"明天早上 8 点叫我起床"**
> AI：*（调用 reminder_set，at="08:00"）* ✅ 已设置……

### ⏰ Web UI

- **输入框上方倒计时徽章**：有未完成提醒时显示 `⏰ 19:32` 实时倒计时，点击打开管理面板
- **输入框右侧闹钟图标**：随时打开管理面板
- **管理面板**：手动添加（内容 + HH:MM 或 `25m` 简写）、小睡 +10m、取消
- **到点通知**：浏览器系统通知 + 提示音 + 输入框上方 🔥 呼吸提醒

## 💾 持久化

提醒存在 `~/.dsh/dsh-reminder/reminders.json`，**重启服务 / 重启电脑（配合开机自启）都不会丢**。3 天前的已完成记录自动清理。

## 📦 安装

```bash
dsh plugin --profile web add github:YOUNG26815/dsh-reminder
```

## 🔔 通知权限

首次到点时浏览器会请求通知权限，允许后即可系统级弹窗。拒绝也不影响页内提醒（徽章变 🔥 + 响铃）。

## 🧩 技术实现

- **零 npm 依赖**：纯 Node 内置模块 + 浏览器 Notification/AudioContext API
- 服务端：cordis 插件 + `ctx.webServer` RPC（`POST /reminder/api/*`）
- 客户端：ModuleLoader 静态 bundle，挂载 `conversation.composer.dock` + `conversation.input.right` slot

## License

MIT
