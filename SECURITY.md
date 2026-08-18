# Security Policy

## Reporting a Vulnerability

If you discover a security issue in dsh-convo-cost, please report it privately
(GitHub Security Advisory or direct contact via the repository's Issues page)
instead of opening a public issue with exploit details.

We will acknowledge the report as soon as possible, and once the issue is
confirmed we will prepare a fix and release it. Please allow time for the fix
to land before disclosing details publicly.

## Scope

This plugin is third-party code that runs inside DeepSeek Harness with the
harness's own permissions. It only computes token/cost estimates from the
session event stream and never transmits data anywhere. Any finding that
contradicts that scope (e.g. unexpected network access or file writes) is
treated as high priority.
