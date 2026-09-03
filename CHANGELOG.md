# @phylax-systems/phylax-rpc

## 0.3.0

### Minor Changes

- [#14](https://github.com/phylaxsystems/phylax-rpc/pull/14) [`e8c3441`](https://github.com/phylaxsystems/phylax-rpc/commit/e8c3441829a21d87b3c8798e830a9dff7dc565e5) Thanks [@lean-apple](https://github.com/lean-apple)! - Recognise assertion rejections as verdicts rather than a routing signal. The default revert
  matcher also matched the Credible RPC's own rejection wording, so a transaction an assertion
  refused was classified `off-phylax` and the SDK offered a switch to the network the caller had
  already reached. Rejections now classify as `reverted`, and `assertionRejection` carries the
  assertion ids the RPC named plus a count of any beyond the ten it names.

  Error recognition moved into `src/errors` behind one classifier with an explicit precedence:
  the EIP-1193 rejection code, then ABI revert data, then a wallet's dismissal wording, then the
  messages the RPC documents, then node wording. An `inconclusive` result now carries `reason`
  and `retryable`, so a transient gate condition is distinguishable from an underfunded sender,
  and the transient ones are retried automatically — three retries with jittered backoff, shared
  across detection's provider reads and overridable per call up to `MAX_RETRY_ATTEMPTS`. Assertion
  ids are a branded type.

  Standard provider transport wrappers, empty-data execution reverts, and viem's complete set of
  invalid-transaction aliases are classified explicitly. Transient sender lookup failures share the
  same bounded retry budget as the preflight instead of being reported as a missing account.

## 0.2.0

### Minor Changes

- [#12](https://github.com/phylaxsystems/phylax-rpc/pull/12) [`00815a8`](https://github.com/phylaxsystems/phylax-rpc/commit/00815a8d5e1a3434c76b6479c352e872f1a67a16) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Add a Zerion walkthrough to `ManualAddModal`. Zerion is detected but has no assisted `wallet_addEthereumChain` path, so it fell through to the generic manual card; it now gets a four-step guide (home → Settings/Networks → Ethereum → RPC URL) selected automatically when `walletName` is Zerion.

  Guides that cannot detect their active RPC now carry a `skipVerification` flag instead of a hard-coded wallet check, and Zerion uses it alongside Rainbow, so the last step no longer shows a connection status the SDK cannot confirm.

## 0.1.1

### Patch Changes

- [#10](https://github.com/phylaxsystems/phylax-rpc/pull/10) [`c413047`](https://github.com/phylaxsystems/phylax-rpc/commit/c4130478f22c588303208cabfda8213bcbdd5c9a) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Correct the npm scope to `@phylax-systems` across the package name, import paths, and documentation. The npm org uses a hyphen (`@phylax-systems`) even though the GitHub org does not (`phylaxsystems`).

## 0.1.0

### Minor Changes

- [#5](https://github.com/phylaxsystems/phylax-rpc/pull/5) [`73e4280`](https://github.com/phylaxsystems/phylax-rpc/commit/73e4280c3e7db3f15ba650c739515f72e0fa4f5b) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Serve wallet guide screenshots through Cloudflare Images and add typed image transformation options for the React modal and headless URL builder. Harden provider announcement and revert-data validation, prevent stale React hook operations from updating state after account or config changes, and support compatibility switching when a transaction probe proves the wallet is off Phylax.

- [#5](https://github.com/phylaxsystems/phylax-rpc/pull/5) [`90092c5`](https://github.com/phylaxsystems/phylax-rpc/commit/90092c51c5536d5dbb20b9ccc96f3bf635b3248d) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Initial public release. Headless Phylax RPC switch library: EIP-6963 wallet detection, credible-require preflight, and assisted EIP add/switch/verify, with `react`, `wagmi`, `viem`, and `ethers` adapters plus a manual-add modal. Low-level utilities are exposed under the `/advanced` subpath so the root API stays narrow. Public types use branded domain primitives and discriminated-union results. Published as ESM-only, Node 22+.
