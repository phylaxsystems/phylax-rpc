---
"@phylax-systems/phylax-rpc": minor
---

Default transaction detection to `eth_call` at `latest`. Keep `eth_estimateGas`
selectable per call, add an optional `eth_simulateV1` probe with nested result
classification, and document the preflight's gas and submission limits.
