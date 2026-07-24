# @phylax-systems/phylax-rpc

## 0.1.1

### Patch Changes

- [#10](https://github.com/phylaxsystems/phylax-rpc/pull/10) [`c413047`](https://github.com/phylaxsystems/phylax-rpc/commit/c4130478f22c588303208cabfda8213bcbdd5c9a) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Correct the npm scope to `@phylax-systems` across the package name, import paths, and documentation. The npm org uses a hyphen (`@phylax-systems`) even though the GitHub org does not (`phylaxsystems`).

## 0.1.0

### Minor Changes

- [#5](https://github.com/phylaxsystems/phylax-rpc/pull/5) [`73e4280`](https://github.com/phylaxsystems/phylax-rpc/commit/73e4280c3e7db3f15ba650c739515f72e0fa4f5b) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Serve wallet guide screenshots through Cloudflare Images and add typed image transformation options for the React modal and headless URL builder. Harden provider announcement and revert-data validation, prevent stale React hook operations from updating state after account or config changes, and support compatibility switching when a transaction probe proves the wallet is off Phylax.

- [#5](https://github.com/phylaxsystems/phylax-rpc/pull/5) [`90092c5`](https://github.com/phylaxsystems/phylax-rpc/commit/90092c51c5536d5dbb20b9ccc96f3bf635b3248d) Thanks [@makemake-kbo](https://github.com/makemake-kbo)! - Initial public release. Headless Phylax RPC switch library: EIP-6963 wallet detection, credible-require preflight, and assisted EIP add/switch/verify, with `react`, `wagmi`, `viem`, and `ethers` adapters plus a manual-add modal. Low-level utilities are exposed under the `/advanced` subpath so the root API stays narrow. Public types use branded domain primitives and discriminated-union results. Published as ESM-only, Node 22+.
