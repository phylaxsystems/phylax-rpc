---
"@phylax-systems/phylax-rpc": minor
---

Add a Zerion walkthrough to `ManualAddModal`. Zerion is detected but has no assisted `wallet_addEthereumChain` path, so it fell through to the generic manual card; it now gets a four-step guide (home → Settings/Networks → Ethereum → RPC URL) selected automatically when `walletName` is Zerion.

Guides that cannot detect their active RPC now carry a `skipVerification` flag instead of a hard-coded wallet check, and Zerion uses it alongside Rainbow, so the last step no longer shows a connection status the SDK cannot confirm.
