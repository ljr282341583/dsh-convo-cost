# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/ljr282341583/dsh-convo-cost/releases/tag/v1.0.0
