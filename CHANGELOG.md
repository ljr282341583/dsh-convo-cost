# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-08-23

### Fixed

- The `convoCost` projection is now client-visible: the host registration previously passed `schema`/`view` at
  the top level, but the DSH session-projection contract requires `stateSchema` plus a
  `wire: { viewSchema, view }` block — only units with `wire` are served to the browser (snapshot and change
  feed). The dock line therefore never received any value and stayed at the "本对话费用 —" placeholder. The
  definition now follows the contract, so the running token usage and cost estimate render in real time.
- Tests updated to the contract shape and extended with a regression check that the unit is client-visible
  (`stateSchema` + `wire` present, both schemas validate).

## [1.0.0] - 2026-08-16

### Added

- Real-time cost tracking for the current DSH conversation: a composer-dock status line showing the running
  token usage and DeepSeek official price estimate (base and peak/valley pricing).
- Token accounting from exact per-call usage on `assistant/message` events (no double counting), with
  call count / input (cache-hit included) / output (reasoning included) / cost / pricing regime / model
  breakdowns on hover.
- Automatic pricing regime switch: base prices before `2026-08-17 00:00` (Beijing time), peak/valley prices
  after; Beijing peak hours 09:00-12:00 and 14:00-18:00 billed at the peak rate.
- Unknown models billed as ¥0; USD reference figure included alongside the CNY figure.
- Host-side `convoCost` projection (`lib/index.js`) + browser-side composer-dock renderer
  (`lib/client.js`), plus a simulated-event-stream test suite (`test/test.mjs`).

[1.0.1]: https://github.com/ljr282341583/dsh-convo-cost/releases/tag/v1.0.1
[1.0.0]: https://github.com/ljr282341583/dsh-convo-cost/releases/tag/v1.0.0
