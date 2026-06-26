# phylax-rpc

Headless library that detects when a wallet is **off the Phylax RPC** and helps the user switch to it. No UI — dApps own their own rendering.

## Why

A Credible-protected transaction sent through a default RPC **fails** the credible-builder require — it never gets credible-block markers or Titan routing. This is a *correctness* problem, not just missing MEV protection. A dApp cannot redirect where a plain EOA broadcasts, so the only viable plain-EOA path is:

1. **Detect** that the user is off Phylax, then
2. **Help them switch** their wallet's RPC — assisted where the wallet supports it, manual everywhere else.

This package is the headless logic for that flow.

## Install

```sh
npm install phylax-rpc
```

React is an optional peer dependency, only needed for the `/react` entry.

## Quick start

```ts
import { PhylaxRpcSwitch } from 'phylax-rpc';

const phylax = new PhylaxRpcSwitch({
  rpcUrl: 'https://rpc.phylax.systems',
  // Optionally pin the exact credible-require message your deployment reverts with:
  // credibleRevertMatch: /CL: not in a credible block/,
});

// 1. Discover wallets (EIP-6963) and classify the connected one.
const providers = await phylax.discoverProviders();
const wallet = phylax.classifyDetail(providers[0]);

// 2. Detect whether the user is off Phylax, using the *exact* tx they're about to send.
//    Do NOT pre-fill `gas` — wallets skip estimateGas if you do, and the signal never surfaces.
const detection = await phylax.detect({ provider: providers[0].provider, transaction });

if (detection.offPhylax) {
  // 3. Offer the switch. Assisted only on Zerion ext / MetaMask Mobile in-app;
  //    everywhere else `outcome` is 'unsupported' and you render your manual modal.
  const result = await phylax.switch({
    provider: providers[0].provider,
    wallet,
    verifyTransaction: transaction, // mandatory verify-activation probe
  });

  if (result.manualFallback) {
    showManualAddModal(phylax.manualInstructions());
  }
}
```

## How detection works

The SDK runs its **own** preflight (`eth_estimateGas`, or `eth_call`) through the wallet's provider and reads the thrown error:

- **Succeeds** → `on-phylax` (the Phylax RPC answers the require as-if in a credible block) — or the tx simply isn't credible-protected. Either way, no switch needed.
- **Reverts with `Error(string)` (selector `0x08c379a0`) matching the credible message** → `off-phylax`. Offer the switch.
- **Reverts for any other reason** → `reverted` (a genuine contract error, not a routing problem).
- **No decodable revert data** → `inconclusive`.

Design rules baked in (from the spike's wallet-source review):

- **Match on the `data` selector, never the numeric code.** `3` / `-32000` / `-32603` / `-32015` all appear depending on provider/gateway.
- **Never pre-fill `gas`.** Most wallets skip `eth_estimateGas` when a gas limit is supplied, so the revert never surfaces before signing.
- **Ignore the wallet's confirm-screen verdict.** It's generic, runs against the wallet's centralized simulator, and fires even for correctly-routed users on Rabby/Rainbow/Zerion/Coinbase.

## How the switch works

`wallet_addEthereumChain(0x1, phylax)` → `wallet_switchEthereumChain` → **mandatory verify-activation probe** (re-run the preflight; only `on-phylax` counts as activated).

Several wallets accept the add/switch and then silently ignore the submitted URL, so the probe is not optional. Per the spike, the assisted path is **only** enabled where wallet source confirms activation:

| Wallet | Assisted switch | Path |
|---|---|---|
| **Zerion extension** | ✅ | assisted add + switch + verify |
| **MetaMask Mobile in-app** | ✅ | assisted add + switch + verify |
| MetaMask extension | ❌ | manual modal |
| Rabby / Rainbow / Coinbase | ❌ | manual modal |
| WalletConnect / unknown | ❌ | manual modal |

`attemptSwitch` returns `outcome: 'unsupported'` (and `manualFallback: true`) for everything not on the allowlist — your cue to render the manual-add modal.

> viem's `addChain` with a different RPC silently creates a **duplicate** network — this library issues raw EIP-3085/3326 requests instead.

## React

```tsx
import { usePhylaxRpcSwitch } from 'phylax-rpc/react';

function ProtectedSwap({ transaction }) {
  const { refresh, providers, detect, attemptSwitch, detection, switchResult } =
    usePhylaxRpcSwitch({ rpcUrl: 'https://rpc.phylax.systems' });

  useEffect(() => { refresh(); }, [refresh]);
  // ...drive detect()/attemptSwitch() from your UI and read detection/switchResult.
}
```

## web3-onboard

Wrap Blocknative web3-onboard's `protectedRpcUrl`:

```ts
const chain = phylax.toWeb3OnboardChain({ publicRpcUrl: 'https://cloudflare-eth.com' });
// → { id: '0x1', token: 'ETH', label: 'Ethereum (Phylax)', rpcUrl, protectedRpcUrl }
```

## API

| Export | Purpose |
|---|---|
| `PhylaxRpcSwitch` | Orchestrator bundling everything below behind one config. |
| `discoverProviders` | EIP-6963 provider discovery. |
| `classifyWallet` / `classifyDetail` | Resolve `rdns`/flags → `{ id, platform, assistedSwitch }`. |
| `detectOffPhylax` | Preflight-as-detection probe. |
| `attemptSwitch` | Assisted add + switch + verify. |
| `decodeErrorString` / `isErrorStringRevert` / `extractRevertData` | Revert decoding primitives. |
| `buildAddChainParams` / `manualInstructions` / `toWeb3OnboardChain` | Wiring helpers. |

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
