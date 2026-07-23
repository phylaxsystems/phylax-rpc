import type {
  CloudflareImageFormat,
  CloudflareImageOptions,
} from './cloudflare-images';

type ModalImageOptions = Omit<CloudflareImageOptions, 'format'> & {
  readonly format?: Exclude<CloudflareImageFormat, 'json'>;
};

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
  readonly imageOptions?: ModalImageOptions;
  /**
   * Silent wallet-backed verification invoked when the modal opens, every three seconds
   * while visible, and when the window regains focus. Return `true` only when the
   * connected wallet is confirmed to be routing through Phylax.
   */
  readonly verifyConnection?: () => boolean | Promise<boolean>;
  /**
   * Base id for the dialog's ARIA relationships (`aria-labelledby`/`aria-describedby`).
   * Optional. When omitted, React 18's `useId` supplies a server/client-stable value; on
   * React 17 the fallback is a client-only counter, so pass an explicit `id` if you
   * server-render this modal on React 17 to avoid a hydration mismatch.
   */
  readonly id?: string;
  /**
   * CSP nonce applied to the injected `<style>` element. Set this when the host page runs
   * a strict `style-src` policy so the modal's stylesheet is allowed.
   *
   * Note: this nonces the stylesheet only. The modal also sets a few inline `style`
   * attributes for per-render values that cannot live in a static sheet — theme variables,
   * the step-progress width, and the back-arrow rotation. A CSP nonce does not authorize
   * inline `style` **attributes**, so a strict `style-src` must also include `'unsafe-inline'`
   * (or `'unsafe-hashes'` with the corresponding hashes) for the modal to render correctly.
   */
  readonly styleNonce?: string;
}

/** State of the silent connection-verification loop. */
export type ConnectionVerificationState = 'idle' | 'checking' | 'connected' | 'disconnected';
