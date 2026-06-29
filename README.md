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
//    `transaction` is loose: bigint/decimal `value`, and `from` may be omitted (it's
//    resolved via a silent `eth_accounts`). Do NOT pre-fill `gas` — wallets skip
//    estimateGas if you do, and the signal never surfaces.
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

### Loose transaction input

`detect` (and `switch`'s `verifyTransaction`) accept a **loose** transaction — pass the tx object straight out of viem/ethers/wagmi, no hand-conversion:

- Numeric fields (`value`, `gasPrice`, `maxFeePerGas`, …) accept a `bigint`, an integer `number`, a decimal or `0x` string, or an ethers `BigNumber`. They're coerced to hex quantities internally.
- `from` is optional. When absent, it's resolved with a **silent** `eth_accounts` (never `eth_requestAccounts` — no popup). If no sender can be resolved, detection returns `inconclusive` rather than throwing.

```ts
// bigint value, no `from` — this just works:
await phylax.detect({ provider, transaction: { to, data, value: 10n ** 18n } });
```

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

### Manual-add fallback modal

When `attemptSwitch` returns `manualFallback: true` (the wallet has no one-click `0x1` add), render the manual-add modal to guide the user. It's a self-contained, styleable convenience component — the dApp can replace it entirely.

```tsx
import { ManualAddModal } from 'phylax-rpc/react';

<ManualAddModal
  open={result.manualFallback}
  onClose={() => setOpen(false)}
  walletName="Rabby"
  rpcUrl="https://rpc.phylax.systems"
/>
```

> Currently a **dummy** placeholder — it renders the dialog chrome but not the per-wallet step content yet.

## web3-onboard

Wrap Blocknative web3-onboard's `protectedRpcUrl`:

```ts
const chain = phylax.toWeb3OnboardChain({ publicRpcUrl: 'https://cloudflare-eth.com' });
// → { id: '0x1', token: 'ETH', label: 'Ethereum (Phylax)', rpcUrl, protectedRpcUrl }
```

## wagmi / viem / ethers

`discoverProviders()` (EIP-6963) only sees injected wallets — it's **empty** for WalletConnect, Coinbase, and embedded connectors, whose provider exists only on the connector. Per-framework adapters bridge that gap. They're optional subpath entries with **zero runtime dependency** on the framework (structural typing), so importing one never forces wagmi/viem/ethers into your bundle.

**wagmi** — resolve the *connected* wallet from `useAccount()`:

```ts
import { useAccount } from 'wagmi';
import { connectedWallet } from 'phylax-rpc/wagmi';

const account = useAccount();
const connected = await connectedWallet(account); // { provider, wallet, account } | null
if (connected) {
  const detection = await phylax.detect({ provider: connected.provider, transaction });
}
```

Or pass the account straight to the React hook and skip discovery entirely:

```tsx
const account = useAccount();
const { detect, attemptSwitch } = usePhylaxRpcSwitch({ rpcUrl }, account);
// detect/attemptSwitch resolve the connected provider + classification automatically.
await detect({ transaction });
```

**viem / ethers** — wrap a wallet-backed client as an EIP-1193 provider:

```ts
import { providerFromWalletClient } from 'phylax-rpc/viem';
const provider = providerFromWalletClient(walletClient); // viem WalletClient

import { providerFromEthers } from 'phylax-rpc/ethers';
const provider = providerFromEthers(new BrowserProvider(window.ethereum)); // ethers v6
```

> **Use the wallet-backed client, not a public-RPC one.** A viem client on an `http` transport (or an ethers `JsonRpcProvider`) routes to a read-only RPC URL — detection would probe the wrong endpoint and always report `on-phylax`. Use `custom(window.ethereum)` / the connector-backed client / `BrowserProvider`.

A full integration is in [`examples/wagmi-swap-guard.tsx`](examples/wagmi-swap-guard.tsx).

## API

| Export | Purpose |
|---|---|
| `PhylaxRpcSwitch` | Orchestrator bundling everything below behind one config. |
| `discoverProviders` | EIP-6963 provider discovery. |
| `classifyWallet` / `classifyDetail` | Resolve `rdns`/flags → `{ id, platform, assistedSwitch }`. |
| `detectOffPhylax` | Preflight-as-detection probe (accepts a `LooseTransactionRequest`). |
| `attemptSwitch` | Assisted add + switch + verify. |
| `normalizeTransaction` / `toHexQuantity` | Loose-tx coercion primitives. |
| `decodeErrorString` / `isErrorStringRevert` / `extractRevertData` | Revert decoding primitives. |
| `buildAddChainParams` / `manualInstructions` / `toWeb3OnboardChain` | Wiring helpers. |
| `connectedWallet` *(`/wagmi`)* | Resolve the connected wallet's provider + classification from `useAccount()`. |
| `providerFromWalletClient` *(`/viem`)* / `providerFromEthers` *(`/ethers`)* | Wrap a wallet client as an EIP-1193 provider. |

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
