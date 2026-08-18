# dsh-convo-cost

> English: [README.en.md](README.en.md)

实时统计**当前对话**的 token 用量与费用，在会话输入框下方的状态行显示一行
`本对话 ¥x.xx · xx tok`，悬停可看调用次数 / 输入（含缓存命中）/ 输出（含推理）/
费用 / 计价模式 / 模型明细。

- 计价标准：**DeepSeek 官方价目表**（人民币 / 百万 tokens），已与
  [api-docs.deepseek.com/zh-cn/quick_start/pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) 核对
- 自动切换计价：`2026-08-17 00:00`（北京时间）前用基础价，之后按峰谷价
- 高峰时段（北京时间 09:00-12:00、14:00-18:00）自动按高峰价计
- 模型名来自请求头，未知模型按 ¥0 计

## 安装

```sh
dsh plugin --profile web add dsh-convo-cost
```

重启 `dsh web` 后，会话状态行出现「本对话 ¥x.xx · xx tok」。

## 效果

| 状态行 | 悬停明细 |
| --- | --- |
| `本对话 ¥1.47 · 20.9M tok` | 调用 152 次 · 输入 20,812,672 tok（缓存命中 20,812,672）· 输出 118,945 tok（推理 …）· ≈ ¥1.47 · 计价：基础价 · 模型：deepseek-v4-flash |

## 原理

- **Host 侧**（`lib/index.js`）：通过 DSH 的 `sessionProjections` 服务订阅会话事件流，
  在每条 `assistant/message` 的精确 usage 上累计 token，并按官方价目计价，
  注册为 `convoCost` 投影
- **Client 侧**（`lib/client.js`）：注入 `conversation.composer.dock` 插槽，
  用 `useProjection("convoCost")` 渲染费用行，随对话实时刷新

实现模式参考官方全家桶中的 `@linxin666/dsh-live-stats`。

## 价格表（deepseek-v4-flash，人民币 / 百万 tokens）

| 项目 | 基础价（8-17 前） | 峰谷·空闲 | 峰谷·高峰 |
| --- | --- | --- | --- |
| 输入·缓存命中 | 0.02 | 0.05 | 0.10 |
| 输入·未命中 | 1.0 | 1.5 | 3.0 |
| 输出 | 2.0 | 4.5 | 9.0 |

`deepseek-v4-pro` 与峰谷完整价目见 `lib/index.js` 的 `PRICING` 表；价格以
DeepSeek 官方页面为准，官方调整后可修改该表。

## 测试

```sh
npm test
```

用模拟事件流验证投影的 token 累计与计费（无网络、无真实调用）。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 状态行不出现 | 安装后需重启 `dsh web`；确认插件已进入 `dsh.profile.bundles`（`dsh plugin add` 会自动 reconcile） |
| 一直显示 ¥0.00 | 模型不在官方价目表内（未知模型按 ¥0 计）；等待首次 `assistant/message` 事件产生 usage |
| 金额与账单不一致 | 价格为估算：按请求头模型名与官方价目表计算，不含折扣/活动/平台加价；以官方账单为准 |
| 官方调价后想立即生效 | 修改 `lib/index.js` 的 `PRICING` 表与 `EFFECTIVE_AT`，重新发布 npm 包并更新 |
| 悬停明细为空 | 投影需累积至少一次带 usage 的 `assistant/message` 事件；新会话从 0 开始 |

## License

MIT
