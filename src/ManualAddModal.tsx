import { useEffect } from 'react';

export interface ManualAddModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user dismisses the modal (close button, overlay click, Escape). */
  onClose: () => void;
  /**
   * Name of the connected wallet (e.g. "MetaMask", "Rabby"), used in the heading.
   * Optional — falls back to a generic label.
   */
  walletName?: string;
  /** The Phylax RPC URL the user needs to add. Shown for reference. */
  rpcUrl?: string;
}

/**
 * Fallback modal for the **manual** RPC-add path.
 *
 * Shown when the user asks to add Phylax but their wallet is not on the assisted
 * allowlist (no one-click `wallet_addEthereumChain(0x1)` support) — i.e. when
 * {@link attemptSwitch} returns `manualFallback: true`. It is meant to guide the
 * user through adding the RPC by hand for their specific wallet.
 *
 * This is a **dummy** placeholder: it renders the chrome (overlay, dialog, close)
 * but no per-wallet step content yet. Step-by-step instructions land in a later pass.
 *
 * Self-contained inline styles — no CSS import required. The dApp owns final styling
 * and can replace this component entirely; it is provided as a convenience.
 */
export function ManualAddModal({ open, onClose, walletName, rpcUrl }: ManualAddModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const wallet = walletName ?? 'your wallet';

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 2147483647,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phylax-manual-add-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: '#fff',
          color: '#111',
          borderRadius: 12,
          maxWidth: 420,
          width: '100%',
          padding: 24,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.24)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="phylax-manual-add-title" style={{ margin: 0, fontSize: 18, lineHeight: 1.3 }}>
            Add the Phylax RPC to {wallet}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#666',
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 14, lineHeight: 1.5, color: '#444' }}>
          {wallet} can&rsquo;t add the Phylax network with one click, so you&rsquo;ll need to add it
          manually. Step-by-step instructions for your wallet will appear here.
        </p>

        {rpcUrl ? (
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: '#666' }}>
            RPC URL: <code style={{ wordBreak: 'break-all' }}>{rpcUrl}</code>
          </p>
        ) : null}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              borderRadius: 8,
              background: '#111',
              color: '#fff',
              fontSize: 14,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
