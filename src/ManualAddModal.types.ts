import type { CloudflareImageOptions } from './cloudflare-images';

/** Props for {@link ManualAddModal}, co-located with the component. */
export interface ManualAddModalProps {
  /** Whether the modal is visible. */
  readonly open: boolean;
  /** Called when the user dismisses the modal (close button, overlay click, Escape). */
  readonly onClose: () => void;
  /**
   * Name of the connected wallet (e.g. "MetaMask", "Rabby"), used in the heading.
   * Optional — falls back to a generic label.
   */
  readonly walletName?: string;
  /** The Phylax RPC URL the user needs to add. Shown for reference. */
  readonly rpcUrl?: string;
  /**
   * Cloudflare Images flexible-variant options applied to the wallet walkthrough images.
   * Omit this to use the images' `public` variant.
   */
  readonly imageOptions?: CloudflareImageOptions;
  /**
   * Silent wallet-backed verification invoked when the modal opens, every three seconds
   * while visible, and when the window regains focus. Return `true` only when the
   * connected wallet is confirmed to be routing through Phylax.
   */
  readonly verifyConnection?: () => boolean | Promise<boolean>;
  /**
   * CSP nonce applied to the injected `<style>` element. Set this when the host page runs
   * a strict `style-src` policy so the modal's stylesheet is allowed.
   */
  readonly styleNonce?: string;
}

/** State of the silent connection-verification loop. */
export type ConnectionVerificationState = 'idle' | 'checking' | 'connected' | 'disconnected';
