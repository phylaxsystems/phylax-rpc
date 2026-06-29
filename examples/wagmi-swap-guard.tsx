/**
 * wagmi swap-guard — gate a swap behind off-Phylax detection, end to end.
 *
 * The bridge this example demonstrates: wagmi's connected provider lives on the
 * *connector*, not on `window` — so EIP-6963 `discoverProviders()` is empty for
 * WalletConnect / Coinbase / embedded connectors. `phylax-rpc/wagmi`'s
 * `connectedWallet` (used here via the hook's `account` argument) resolves the
 * connected provider + classification directly from `useAccount()`.
 *
 * Two things to note:
 *  1. `transaction` is a LooseTransactionRequest — bigint `value`, no `from`. The
 *     library coerces the numeric fields and auto-resolves the sender via a silent
 *     `eth_accounts`. No hand-built hex object.
 *  2. Use the wallet-backed connector here, never a public-RPC client — detection must
 *     probe the wallet's RPC, not a read-only endpoint.
 *
 * Not wired to a bundler in this repo; it's a copy-paste reference for a wagmi app.
 */
import { useAccount } from 'wagmi';
import { usePhylaxRpcSwitch, ManualAddModal } from 'phylax-rpc/react';
import { useState } from 'react';

const PHYLAX = { rpcUrl: 'https://rpc.phylax.systems' };

export function SwapGuard({ to, data }: { to: `0x${string}`; data: `0x${string}` }) {
  const account = useAccount();
  // Pass `account` so detect/attemptSwitch resolve the *connected* provider — no
  // discoverProviders(), works for WalletConnect/Coinbase/embedded connectors too.
  const { detect, attemptSwitch, connected } = usePhylaxRpcSwitch(PHYLAX, account);

  const [manual, setManual] = useState(false);
  const [status, setStatus] = useState<string>('');

  async function guardedSwap() {
    setManual(false);

    // Loose tx: bigint value, no `from`. Detection normalizes and fills the sender.
    const transaction = { to, data, value: 1_000_000_000_000_000_000n };

    const detection = await detect({ transaction });
    if (!detection.offPhylax) {
      setStatus(detection.status); // on-phylax / reverted / inconclusive
      // ...on-phylax → proceed to send the swap through the wallet as usual.
      return;
    }

    // Off Phylax — try the assisted switch; the verify probe re-runs the preflight.
    const result = await attemptSwitch({ verifyTransaction: transaction });
    if (result.outcome === 'activated') {
      setStatus('activated — safe to swap');
    } else if (result.manualFallback) {
      setManual(true); // unsupported wallet → guide the user through manual add
    }
  }

  return (
    <>
      <button onClick={guardedSwap} disabled={!account.isConnected}>
        Swap
      </button>
      {status && <p>{status}</p>}
      <ManualAddModal
        open={manual}
        onClose={() => setManual(false)}
        walletName={connected?.wallet.name}
        rpcUrl={PHYLAX.rpcUrl}
      />
    </>
  );
}
