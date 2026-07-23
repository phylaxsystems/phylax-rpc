# @phylaxsystems/phylax-rpc

Headless library to detect when a wallet is off the Phylax RPC and help users switch (EIP-6963 detection + credible-require preflight + assisted EIP add/switch/verify).

## Install

```bash
npm install @phylaxsystems/phylax-rpc
```

The React, wagmi, viem, and ethers entrypoints rely on optional peer dependencies. Install whichever your app uses:

```bash
npm install react wagmi viem ethers
```

## Usage

The headless client bundles EIP-6963 detection, the credible-require preflight, and the
assisted add/switch/verify path behind one config:

```ts
import { PhylaxRpcSwitch } from '@phylaxsystems/phylax-rpc';

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
import { usePhylaxRpcSwitch, ManualAddModal } from '@phylaxsystems/phylax-rpc/react';
import { useAccount } from 'wagmi';

function Guard() {
  const account = useAccount();
  const { detect, attemptSwitch, connected, isConnectedToPhylax } = usePhylaxRpcSwitch(
    { rpcUrl: 'https://rpc.phylax.systems' },
    account, // resolves the connected provider — works for WalletConnect/Coinbase too
  );
  // …call detect({ transaction }) / attemptSwitch({ verifyTransaction }) on submit.
}
```

### Framework adapters

Wrap a non-injected provider as an EIP-1193 provider for `detect`/`switch`:

```ts
import { providerFromWalletClient } from '@phylaxsystems/phylax-rpc/viem';
import { providerFromEthers } from '@phylaxsystems/phylax-rpc/ethers';
import { connectedWallet } from '@phylaxsystems/phylax-rpc/wagmi';
```

Low-level building blocks (ABI decode, revert-data extraction, hex coercion, config
helpers) live under `@phylaxsystems/phylax-rpc/advanced`.

See `examples/wagmi-swap-guard.tsx` for an end-to-end wagmi integration.
