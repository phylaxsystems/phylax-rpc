# @phylax-systems/phylax-rpc

Headless library to detect when a wallet is off the Phylax RPC and help users switch (EIP-6963 detection + credible-require preflight + assisted EIP add/switch/verify).

**Supported networks:** Ethereum mainnet (chain `1`) only. The versioned routing signal lives on mainnet, so silent routing verification is unavailable on other chains — a client configured for a different `chainId` reports `inconclusive`/`false` from `isConnectedToPhylax`.

**Release status:** Distributed on npm under [semantic versioning](https://semver.org), versioned with [changesets](https://github.com/changesets/changesets). The version you install is the current release — see the [npm page](https://www.npmjs.com/package/@phylax-systems/phylax-rpc) for release history. (Initial release: `0.1.0`.)

## Install

```bash
npm install @phylax-systems/phylax-rpc
```

The React, wagmi, viem, and ethers entrypoints rely on optional peer dependencies. Install whichever your app uses:

```bash
npm install react wagmi viem ethers
```

## Usage

The headless client bundles EIP-6963 detection, the credible-require preflight, and the
assisted add/switch/verify path behind one config:

```ts
import { PhylaxRpcSwitch } from '@phylax-systems/phylax-rpc';

const phylax = new PhylaxRpcSwitch({ rpcUrl: 'https://rpc.phylax.systems' });

// Is the connected wallet already routed through Phylax? (silent — no popups)
const routed = await phylax.isConnectedToPhylax(provider);

// Probe a specific transaction for the off-Phylax signal.
const detection = await phylax.detect({ provider, transaction });
if (detection.offPhylax) {
  const result = await phylax.switch({ provider, wallet, verifyTransaction: transaction });
  if (result.manualFallback) {
    // Wallet can't add the RPC in one click — render <ManualAddModal /> (see below).
  }
}
```

### React

```tsx
import { usePhylaxRpcSwitch, ManualAddModal } from '@phylax-systems/phylax-rpc/react';
import { useAccount } from 'wagmi';

function Guard() {
  const account = useAccount();
  const { detect, attemptSwitch, connected, isConnectedToPhylax } = usePhylaxRpcSwitch(
    { rpcUrl: 'https://rpc.phylax.systems' },
    account, // resolves the connected provider; works for WalletConnect/Coinbase too
  );
  // Call detect({ transaction }) / attemptSwitch({ verifyTransaction }) on submit.

  return (
    <ManualAddModal
      open={false}
      onClose={() => {}}
      imageOptions={{ width: 600, quality: 85, format: 'auto' }}
    />
  );
}
```

The walkthrough screenshots are served by Cloudflare Images. Pass `imageOptions` to
`ManualAddModal` to request a different size, fit, DPR, quality, or image format. Apps with
a Content Security Policy must allow `https://imagedelivery.net` in `img-src`. Pass the
page's nonce through `styleNonce` to authorize the injected `<style>` element under a
strict `style-src`. Note that `styleNonce` covers the stylesheet only: the modal also emits
a few inline `style` attributes for per-render values (theme variables, step-progress width,
back-arrow rotation), and a CSP nonce does not authorize inline `style` attributes — so a
strict `style-src` must also include `'unsafe-inline'` (or `'unsafe-hashes'` plus the
relevant hashes). The same URL builder is
available for headless use (including Cloudflare's JSON metadata format):

```ts
import { buildCloudflareImageUrl } from '@phylax-systems/phylax-rpc';

const imageUrl = buildCloudflareImageUrl(deliveryUrl, {
  width: 600,
  format: 'auto',
});
```

### Framework adapters

Wrap a non-injected provider as an EIP-1193 provider for `detect`/`switch`:

```ts
import { providerFromWalletClient } from '@phylax-systems/phylax-rpc/viem';
import { providerFromEthers } from '@phylax-systems/phylax-rpc/ethers';
import { connectedWallet } from '@phylax-systems/phylax-rpc/wagmi';
```

Low-level building blocks (ABI decode, revert-data extraction, hex coercion, config
helpers) live under `@phylax-systems/phylax-rpc/advanced`.

See `examples/wagmi-swap-guard.tsx` for an end-to-end wagmi integration.
