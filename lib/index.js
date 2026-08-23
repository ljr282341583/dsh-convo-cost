/**
 * dsh-convo-cost host entry: folds the session event stream into a
 * `convoCost` projection — the running token usage and DeepSeek official
 * cost estimate for the CURRENT conversation, consumed by the browser
 * half's composer-dock line.
 *
 * Cost model mirrors the official DeepSeek price table in CNY per 1M
 * tokens (verified against api-docs.deepseek.com/zh-cn/quick_start/pricing):
 * base prices before 2026-08-17 00:00 +08:00, peak/valley prices after;
 * Beijing peak hours 09:00-12:00 and 14:00-18:00. Models without an
 * official price count as 0.
 */

import { z } from 'zod'

/** DeepSeek official pricing, CNY per 1M tokens. */
const PRICING = {
  base: {
    'deepseek-v4-flash': { cacheHit: 0.02, cacheMiss: 1.0, output: 2.0 },
    'deepseek-v4-pro': { cacheHit: 0.025, cacheMiss: 3.0, output: 6.0 },
  },
  peakValley: {
    'deepseek-v4-flash': {
      offPeak: { cacheHit: 0.05, cacheMiss: 1.5, output: 4.5 },
      peak: { cacheHit: 0.1, cacheMiss: 3.0, output: 9.0 },
    },
    'deepseek-v4-pro': {
      offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
      peak: { cacheHit: 0.3, cacheMiss: 9.0, output: 27.0 },
    },
  },
}

/** Peak/valley prices take effect at 2026-08-17 00:00 Beijing time. */
const EFFECTIVE_AT = Date.parse('2026-08-17T00:00:00+08:00')

/** Rough CNY→USD conversion for the reference figure only (estimate). */
const USD_CNY = 7.1

/** Map any model name to its price bucket; unknown models cost 0. */
function modelKey(model) {
  const m = String(model ?? '').toLowerCase()
  if (m.includes('flash')) return 'deepseek-v4-flash'
  if (m.includes('pro')) return 'deepseek-v4-pro'
  return 'unknown'
}

/** Beijing-time peak hours: 09:00-12:00 and 14:00-18:00. */
function isPeak(ts) {
  const d = new Date(ts + 8 * 3600 * 1000)
  const t = d.getUTCHours() * 60 + d.getUTCMinutes()
  return (t >= 9 * 60 && t < 12 * 60) || (t >= 14 * 60 && t < 18 * 60)
}

/**
 * Cost of one call. The price table is CNY per 1M tokens, so `cny` is the
 * primary figure; `usd` is a rough reference (cny / 7.1).
 * @returns {usd, cny, period} where period is 'base' or 'peakValley'.
 */
function costFor(time, model, miss, hit, out) {
  const mk = modelKey(model)
  const bucket = PRICING.base[mk] ?? PRICING.peakValley[mk]
  let cny = 0
  let period = 'base'
  if (bucket !== undefined && time < EFFECTIVE_AT) {
    cny = (hit * bucket.cacheHit + miss * bucket.cacheMiss + out * bucket.output) / 1e6
  } else if (bucket !== undefined) {
    const pv = PRICING.peakValley[mk]
    if (pv !== undefined) {
      const p = isPeak(time) ? pv.peak : pv.offPeak
      cny = (hit * p.cacheHit + miss * p.cacheMiss + out * p.output) / 1e6
      period = 'peakValley'
    }
  }
  return { usd: cny / USD_CNY, cny, period }
}

/** Client-visible view output, validated against this schema. */
const schema = z.object({
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  costCny: z.number().nonnegative(),
  period: z.string(),
  model: z.string().nullable(),
}).strict()

/**
 * Full persisted fold state — the view output plus the internal `_time`
 * bookkeeping field carried by `init`/`apply`.
 */
const stateSchema = z.object({
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  costCny: z.number().nonnegative(),
  period: z.string(),
  model: z.string().nullable(),
  _time: z.number(),
}).strict()

/** Services required by this host plugin. */
export const inject = ['sessionProjections']

/** Stable cordis plugin name. */
export const name = 'dsh-convo-cost'

/**
 * Register the convoCost projection against the session event stream.
 * Usage settles on `assistant/message` events (exact per-call usage, no
 * double counting); the model name is tracked from `request/header`.
 *
 * NOTE: the DSH host contract (@deepseek-ai/dsh-session-projection
 * `register()`) requires `stateSchema` plus a `wire: { viewSchema, view }`
 * block — only units with `wire` are client-visible, i.e. included in the
 * snapshot and the change feed the browser consumes. Earlier releases
 * passed `schema`/`view` at the top level, which silently made the unit
 * host-only: the dock line never received any `convoCost` value.
 */
export function apply(ctx) {
  ctx.sessionProjections.register({
    key: 'convoCost',
    stateSchema,
    init: () => ({
      calls: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
      costCny: 0,
      period: 'base',
      model: null,
      _time: 0,
    }),
    apply: (state, event) => {
      if (event.type === 'request/header') {
        const model = event.data?.header?.config?.model
        return model === undefined || model === state.model ? state : { ...state, model }
      }
      if (event.type !== 'assistant/message') return state
      const usage = event.data?.usage
      if (usage === undefined || usage === null) return state
      const miss = usage.inputTokens || 0
      const hit = usage.cacheReadTokens || 0
      const out = usage.outputTokens || 0
      const reasoning = usage.reasoningTokens || 0
      const time = event.time ?? state._time
      const { usd, cny, period } = costFor(time, state.model, miss, hit, out)
      return {
        calls: state.calls + 1,
        inputTokens: state.inputTokens + miss,
        cacheReadTokens: state.cacheReadTokens + hit,
        cacheWriteTokens: state.cacheWriteTokens + (usage.cacheWriteTokens || 0),
        outputTokens: state.outputTokens + out,
        reasoningTokens: state.reasoningTokens + reasoning,
        costUsd: state.costUsd + usd,
        costCny: state.costCny + cny,
        period: state.costUsd + usd > 0 ? period : state.period,
        model: state.model,
        _time: time,
      }
    },
    wire: {
      viewSchema: schema,
      view: (state) => ({
        calls: state.calls,
        inputTokens: state.inputTokens,
        cacheReadTokens: state.cacheReadTokens,
        cacheWriteTokens: state.cacheWriteTokens,
        outputTokens: state.outputTokens,
        reasoningTokens: state.reasoningTokens,
        costUsd: state.costUsd,
        costCny: state.costCny,
        period: state.period,
        model: state.model,
      }),
    },
    stateVersion: 1,
  })
}
