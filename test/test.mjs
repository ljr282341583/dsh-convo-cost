// dsh-convo-cost host logic tests: fold a simulated session event stream
// through the convoCost projection and assert token accounting + pricing.
// No network, no real model calls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, name } from '../lib/index.js'

/** Register the projection against a stub context and return the definition. */
function registerProjection() {
  let def = null
  const ctx = { sessionProjections: { register: (d) => { def = d; return () => {} } } }
  apply(ctx)
  assert.ok(def !== null, 'projection should be registered')
  return def
}

test('plugin exports', () => {
  assert.equal(name, 'dsh-convo-cost')
})

test('projection folds usage events into totals and cost', () => {
  const def = registerProjection()
  assert.equal(def.key, 'convoCost')

  let s = def.init()
  s = def.apply(s, { type: 'request/header', data: { header: { config: { model: 'deepseek-v4-flash' } } } })
  s = def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-16T10:00:00+08:00'), data: { usage: { inputTokens: 8113, outputTokens: 336, cacheReadTokens: 384, reasoningTokens: 147 } } })
  s = def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-16T15:00:00+08:00'), data: { usage: { inputTokens: 5000, outputTokens: 200, cacheReadTokens: 1000, reasoningTokens: 90 } } })
  // non-usage events are no-ops
  s = def.apply(s, { type: 'step/start', data: {} })

  const view = def.view(s)
  assert.equal(view.calls, 2)
  assert.equal(view.inputTokens, 13113)
  assert.equal(view.cacheReadTokens, 1384)
  assert.equal(view.outputTokens, 536)
  assert.equal(view.reasoningTokens, 237)
  assert.equal(view.model, 'deepseek-v4-flash')
  // base regime (before 2026-08-17): CNY per 1M tokens
  // call1: (384*0.02 + 8113*1.0 + 336*2.0)/1e6 = 0.00879268
  // call2: (1000*0.02 + 5000*1.0 + 200*2.0)/1e6 = 0.00542
  assert.ok(Math.abs(view.costCny - 0.01421268) < 1e-9, `costCny=${view.costCny}`)
  assert.equal(view.period, 'base')

  // view output must satisfy the projection schema
  const check = def.schema.safeParse(view)
  assert.ok(check.success, `schema: ${JSON.stringify(check.error)}`)
})

test('peak/valley pricing applies after the effective date', () => {
  const def = registerProjection()
  let s = def.init()
  s = def.apply(s, { type: 'request/header', data: { header: { config: { model: 'deepseek-v4-flash' } } } })
  // After 2026-08-17 00:00 +08:00; 08:00 Beijing is OFF-PEAK
  s = def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-18T08:00:00+08:00'), data: { usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 100, reasoningTokens: 0 } } })
  const view = def.view(s)
  assert.equal(view.period, 'peakValley')
  // offPeak: (100*0.05 + 1000*1.5 + 100*4.5)/1e6 = (5 + 1500 + 450)/1e6 = 0.001955
  assert.ok(Math.abs(view.costCny - 0.001955) < 1e-9, `costCny=${view.costCny}`)

  // Peak hours: Beijing 14:00-18:00
  s = def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-18T15:00:00+08:00'), data: { usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 100, reasoningTokens: 0 } } })
  const view2 = def.view(s)
  // peak: (100*0.1 + 1000*3.0 + 100*9.0)/1e6 = (10 + 3000 + 900)/1e6 = 0.00391
  assert.ok(Math.abs(view2.costCny - (0.001955 + 0.00391)) < 1e-9, `costCny=${view2.costCny}`)
})

test('unknown models cost zero', () => {
  const def = registerProjection()
  let s = def.init()
  s = def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-16T10:00:00+08:00'), data: { usage: { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, reasoningTokens: 0 } } })
  const view = def.view(s)
  assert.equal(view.costCny, 0)
  assert.equal(view.calls, 1)
})

/** Float-safe assertion for CNY figures (unit prices are decimal literals). */
function near(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} ≈ ${expected}`)
}

test('peak-hour boundaries follow the Beijing peak windows', () => {
  const def = registerProjection()
  const run = (time) => {
    let s = def.init()
    s = def.apply(s, { type: 'request/header', data: { header: { config: { model: 'deepseek-v4-flash' } } } })
    return def.view(def.apply(s, { type: 'assistant/message', time, data: { usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 100, reasoningTokens: 0 } } }))
  }
  // After the 2026-08-17 effective date, Beijing peak hours are 09:00-12:00 and 14:00-18:00.
  const offPeakUnit = 0.001955 // (100*0.05 + 1000*1.5 + 100*4.5) / 1e6
  const peakUnit = 0.00391 // (100*0.1 + 1000*3.0 + 100*9.0) / 1e6
  near(run(Date.parse('2026-08-18T09:00:00+08:00')).costCny, peakUnit) // 09:00 -> peak
  near(run(Date.parse('2026-08-18T11:59:00+08:00')).costCny, peakUnit) // before 12:00 -> peak
  near(run(Date.parse('2026-08-18T12:00:00+08:00')).costCny, offPeakUnit) // 12:00 -> off-peak
  near(run(Date.parse('2026-08-18T14:00:00+08:00')).costCny, peakUnit) // 14:00 -> peak
  near(run(Date.parse('2026-08-18T18:00:00+08:00')).costCny, offPeakUnit) // 18:00 -> off-peak
})

test('model mapping picks the right price bucket', () => {
  const def = registerProjection()
  const run = (model) => {
    let s = def.init()
    s = def.apply(s, { type: 'request/header', data: { header: { config: { model } } } })
    return def.view(def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-16T10:00:00+08:00'), data: { usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 } } }))
  }
  // Base regime: 1M cache-miss input tokens priced per the official table.
  near(run('deepseek-v4-flash').costCny, 1.0) // 1M * 1.0 CNY/M
  near(run('deepseek-v4-pro').costCny, 3.0) // 1M * 3.0 CNY/M
  near(run('some-custom-model').costCny, 0) // unknown -> ¥0
  assert.equal(run('deepseek-v4-flash').model, 'deepseek-v4-flash')
})

test('cache-write tokens are accounted separately', () => {
  const def = registerProjection()
  let s = def.init()
  s = def.apply(s, { type: 'assistant/message', time: Date.parse('2026-08-16T10:00:00+08:00'), data: { usage: { inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 42, reasoningTokens: 0 } } })
  const view = def.view(s)
  assert.equal(view.cacheWriteTokens, 42)
  assert.equal(view.calls, 1)
  const check = def.schema.safeParse(view)
  assert.ok(check.success, `schema: ${JSON.stringify(check.error)}`)
})
