# dsh-convo-cost

Real-time token usage and cost tracking for the **current** DSH conversation: a status line under the composer
shows `¥x.xx · xx tok` for this conversation, and hovering reveals call count / input (cache-hit included) /
output (reasoning included) / cost / pricing regime / model details.

- Pricing: **DeepSeek official price list** (CNY per 1M tokens), cross-checked against
  [api-docs.deepseek.com/zh-cn/quick_start/pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)
- Automatic regime switch: base prices before `2026-08-17 00:00` (Beijing time), peak/valley prices after
- Peak hours (Beijing time 09:00-12:00 and 14:00-18:00) are billed at the peak rate automatically
- The model name is read from request headers; unknown models are billed as ¥0

## Install

```sh
dsh plugin --profile web add dsh-convo-cost
```

Restart `dsh web`, and the conversation status line shows `本对话 ¥x.xx · xx tok`.

## Effect

| Status line | Hover details |
| --- | --- |
| `本对话 ¥1.47 · 20.9M tok` | 152 calls · input 20,812,672 tok (cache hit 20,812,672) · output 118,945 tok (reasoning …) · ≈ ¥1.47 · pricing: base · model: deepseek-v4-flash |

## How it works

- **Host side** (`lib/index.js`): subscribes to the session event stream through the `sessionProjections`
  service, accumulates tokens on each `assistant/message` event's exact usage, prices them against the
  official table, and registers the `convoCost` projection.
- **Client side** (`lib/client.js`): injects into the `conversation.composer.dock` slot and renders the cost
  line with `useProjection("convoCost")`, refreshing live with the conversation.

## Pricing table (deepseek-v4-flash, CNY per 1M tokens)

| Item | Base (before 08-17) | Peak/valley · off-peak | Peak/valley · peak |
| --- | --- | --- | --- |
| Input · cache hit | 0.02 | 0.05 | 0.10 |
| Input · cache miss | 1.0 | 1.5 | 3.0 |
| Output | 2.0 | 4.5 | 9.0 |

`deepseek-v4-pro` and the full peak/valley table live in the `PRICING` table in `lib/index.js`; prices follow
the official DeepSeek page — update the table there when the official prices change.

## Test

```sh
npm test
```

The projection's token accounting and billing are verified with a simulated event stream (no network, no real
calls).

## License

MIT
