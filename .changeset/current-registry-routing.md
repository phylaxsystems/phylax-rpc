---
'@phylax-systems/phylax-rpc': minor
---

Replace the V1 routing signal export with `PHYLAX_ROUTING_SIGNAL_V2` for the current Credible
Registry. Verify the stored sentinel marker through `lastCredibleBlock()` so zero-price
simulation bypasses cannot report an ordinary RPC as connected.
