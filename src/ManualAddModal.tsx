import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import phylaxLogo from './assets/phylax-logo.svg';
import rabbyLogo from './assets/rabby/logo.svg';
import rabbyOpenNetwork from './assets/rabby/Screenshot 2026-07-15 at 16.19.04.png';
import rabbySettings from './assets/rabby/Screenshot 2026-07-15 at 16.19.12.png';
import rabbyModifyRpc from './assets/rabby/Screenshot 2026-07-15 at 16.19.20.png';
import rabbyEnterRpc from './assets/rabby/Screenshot 2026-07-15 at 16.20.07.png';
import rabbyEnabled from './assets/rabby/Screenshot 2026-07-15 at 16.20.13.png';

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
  /**
   * Silent wallet-backed verification invoked on the final step, every three seconds
   * while it remains visible, and when the window regains focus. Return `true` only
   * when the connected wallet is confirmed to be routing through Phylax. When supplied,
   * Done stays disabled until verification succeeds.
   */
  verifyConnection?: () => boolean | Promise<boolean>;
}

type ConnectionVerificationState = 'idle' | 'checking' | 'connected' | 'disconnected';

const CONNECTION_VERIFICATION_INTERVAL_MS = 3_000;

const RABBY_STEPS = [
  {
    image: rabbyOpenNetwork,
    title: 'Open More in Rabby',
    text: 'Open Rabby, make sure Ethereum is selected, then choose More from the home screen.',
  },
  {
    image: rabbySettings,
    title: 'Open the RPC settings',
    text: 'In Settings, select Modify RPC URL. This keeps you on Ethereum while changing its node.',
  },
  {
    image: rabbyModifyRpc,
    title: 'Start a custom RPC',
    text: 'Select Modify RPC URL, then choose Ethereum from the list of supported chains.',
  },
  {
    image: rabbyEnterRpc,
    title: 'Paste the Phylax URL',
    text: 'Replace Rabby’s default node with the Phylax RPC URL, then select Save.',
  },
  {
    image: rabbyEnabled,
    title: 'Make sure it is enabled',
    text: 'Check that the Ethereum custom RPC is switched on and the Phylax URL appears below it.',
  },
] as const;

interface WalletGuide {
  id: string;
  aliases: readonly string[];
  name: string;
  navDetail: string;
  logo: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  heading: string;
  description: string;
  steps: readonly {
    image: string;
    title: string;
    text: string;
  }[];
  rpcStep: number;
}

// Wallet-specific visuals and copy live in this registry; the surrounding modal,
// navigation, progress UI, and controls stay shared as more guides are added.
const WALLET_GUIDES: readonly WalletGuide[] = [
  {
    id: 'rabby',
    aliases: ['rabby', 'rabby wallet'],
    name: 'Rabby Wallet',
    navDetail: '5 guided steps',
    logo: rabbyLogo,
    accent: '#7488f6',
    accentStrong: '#657af0',
    accentSoft: 'rgba(116, 136, 246, 0.16)',
    heading: 'Route Ethereum through Phylax',
    description: 'Follow this quick walkthrough to use the Phylax RPC as Rabby’s custom Ethereum node.',
    steps: RABBY_STEPS,
    rpcStep: 3,
  },
];

type WalletGuideId = 'other' | (typeof WALLET_GUIDES)[number]['id'];

const guideIdForWallet = (walletName?: string): WalletGuideId => {
  const normalizedName = walletName?.trim().toLowerCase();
  if (!normalizedName) return 'other';
  return WALLET_GUIDES.find((guide) =>
    guide.aliases.some((alias) => normalizedName === alias || normalizedName.includes(alias)),
  )?.id ?? 'other';
};

const MODAL_STYLES = `
  .phylax-wallet-guide,
  .phylax-wallet-guide * {
    box-sizing: border-box;
  }

  .phylax-wallet-guide button {
    font-family: inherit;
  }

  .phylax-wallet-guide {
    --phylax-bg: #181818;
    --phylax-fg: #f4f4f5;
    --phylax-card: #212121;
    --phylax-card-fg: #f4f4f5;
    --phylax-subtle: #0f0f0f;
    --phylax-muted: #d4d4d8;
    --phylax-muted-strong: #a1a1aa;
    --phylax-border: #27272a;
    --phylax-primary: #f4f4f5;
    --phylax-primary-fg: #181818;
    --phylax-sidebar: #181818;
    --phylax-sidebar-active: #212121;
    --phylax-success: #22c55e;
    --phylax-success-soft: rgba(34, 197, 94, 0.12);
    --phylax-logo-filter: invert(1) brightness(1.12);
    --phylax-overlay: rgba(0, 0, 0, 0.74);
    --phylax-shadow: 0 32px 80px rgba(0, 0, 0, 0.52), 0 8px 24px rgba(0, 0, 0, 0.28);
    color-scheme: dark;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: var(--phylax-fg);
    background: var(--phylax-overlay);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    font-family: "Inter Display", Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    animation: phylax-guide-fade-in 160ms ease-out;
  }

  .phylax-wallet-guide__dialog {
    --wallet-accent: #a1a1aa;
    --wallet-accent-strong: #f4f4f5;
    --wallet-accent-soft: rgba(161, 161, 170, 0.14);
    position: relative;
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    width: min(980px, 100%);
    height: min(700px, calc(100vh - 40px));
    overflow: hidden;
    color: var(--phylax-fg);
    background: var(--phylax-bg);
    border: 1px solid var(--phylax-border);
    border-radius: 20px;
    outline: none;
    box-shadow: var(--phylax-shadow);
    animation: phylax-guide-rise-in 220ms cubic-bezier(0.2, 0.75, 0.3, 1);
  }

  .phylax-wallet-guide__sidebar {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 26px 18px 20px;
    background: var(--phylax-sidebar);
    border-right: 1px solid var(--phylax-border);
  }

  .phylax-wallet-guide__brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 8px 27px;
  }

  .phylax-wallet-guide__brand-mark {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    place-items: center;
    color: var(--phylax-fg);
  }

  .phylax-wallet-guide__brand-mark img {
    display: block;
    width: 32px;
    height: 32px;
    filter: var(--phylax-logo-filter);
  }

  .phylax-wallet-guide__brand-copy strong,
  .phylax-wallet-guide__brand-copy span {
    display: block;
  }

  .phylax-wallet-guide__brand-copy strong {
    color: var(--phylax-fg);
    font-size: 14px;
    font-weight: 730;
    letter-spacing: -0.01em;
  }

  .phylax-wallet-guide__brand-copy span {
    margin-top: 2px;
    color: var(--phylax-muted-strong);
    font-size: 11px;
  }

  .phylax-wallet-guide__nav-label {
    margin: 0 8px 10px;
    color: var(--phylax-muted-strong);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .phylax-wallet-guide__wallet-nav {
    display: grid;
    gap: 7px;
  }

  .phylax-wallet-guide__wallet-button {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 10px;
    color: var(--phylax-muted);
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 14px;
    cursor: pointer;
    transition: 150ms ease;
    transition-property: color, background, border-color, box-shadow, transform;
  }

  .phylax-wallet-guide__wallet-button:hover {
    color: var(--phylax-fg);
    background: var(--phylax-sidebar-active);
    transform: translateY(-1px);
  }

  .phylax-wallet-guide__wallet-button--active {
    color: var(--phylax-fg);
    background: var(--phylax-sidebar-active);
    border-color: var(--phylax-border);
  }

  .phylax-wallet-guide__wallet-icon {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    overflow: hidden;
    background: var(--phylax-card);
    border-radius: 12px;
  }

  .phylax-wallet-guide__wallet-icon img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }

  .phylax-wallet-guide__wallet-icon svg {
    width: 20px;
    height: 20px;
    color: var(--phylax-muted-strong);
  }

  .phylax-wallet-guide__wallet-copy {
    min-width: 0;
  }

  .phylax-wallet-guide__wallet-copy strong,
  .phylax-wallet-guide__wallet-copy span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .phylax-wallet-guide__wallet-copy strong {
    font-size: 13px;
    font-weight: 700;
  }

  .phylax-wallet-guide__wallet-copy span {
    margin-top: 2px;
    color: var(--phylax-muted-strong);
    font-size: 10px;
  }

  .phylax-wallet-guide__selected-check {
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    color: var(--phylax-primary-fg);
    background: var(--phylax-primary);
    border-radius: 50%;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 150ms ease, transform 150ms ease;
  }

  .phylax-wallet-guide__wallet-button--active .phylax-wallet-guide__selected-check {
    opacity: 1;
    transform: scale(1);
  }

  .phylax-wallet-guide__selected-check svg {
    width: 11px;
    height: 11px;
  }

  .phylax-wallet-guide__sidebar-note {
    margin-top: auto;
    padding: 14px;
    color: var(--phylax-muted);
    background: var(--phylax-card);
    border: 1px solid var(--phylax-border);
    border-radius: 14px;
    font-size: 11px;
    line-height: 1.5;
  }

  .phylax-wallet-guide__sidebar-note strong {
    display: block;
    margin-bottom: 3px;
    color: var(--phylax-fg);
    font-size: 11px;
  }

  .phylax-wallet-guide__content {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    max-width: none;
    min-height: 0;
    flex-direction: column;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    text-align: left;
    background: var(--phylax-bg);
  }

  .phylax-wallet-guide__close {
    position: absolute;
    z-index: 2;
    top: 24px;
    right: 26px;
    display: grid;
    width: 36px;
    height: 36px;
    padding: 0;
    place-items: center;
    color: var(--phylax-muted);
    background: var(--phylax-card);
    border: 1px solid var(--phylax-border);
    border-radius: 999px;
    cursor: pointer;
    transition: 140ms ease;
    transition-property: color, background, transform;
  }

  .phylax-wallet-guide__close:hover {
    color: var(--phylax-fg);
    background: var(--phylax-sidebar-active);
  }

  .phylax-wallet-guide__close svg {
    width: 17px;
    height: 17px;
  }

  .phylax-wallet-guide__header {
    padding: 29px 80px 0 34px;
  }

  .phylax-wallet-guide__eyebrow {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 7px;
    color: var(--wallet-accent);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .phylax-wallet-guide__eyebrow img,
  .phylax-wallet-guide__eyebrow svg {
    width: 19px;
    height: 19px;
    flex: 0 0 19px;
  }

  .phylax-wallet-guide__header h2 {
    margin: 0;
    color: var(--phylax-fg);
    font-size: clamp(25px, 3vw, 31px);
    font-weight: 740;
    line-height: 1.15;
    letter-spacing: -0.035em;
  }

  .phylax-wallet-guide__header p:last-child {
    max-width: 590px;
    margin: 8px 0 0;
    color: var(--phylax-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  .phylax-wallet-guide__stepper {
    position: relative;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    margin: 20px 34px 18px;
  }

  .phylax-wallet-guide__stepper-track,
  .phylax-wallet-guide__stepper-progress {
    position: absolute;
    top: 8px;
    left: var(--step-edge, 10%);
    height: 2px;
    pointer-events: none;
  }

  .phylax-wallet-guide__stepper-track {
    right: var(--step-edge, 10%);
    background: var(--phylax-border);
  }

  .phylax-wallet-guide__stepper-progress {
    background: linear-gradient(90deg, var(--wallet-accent-strong), var(--wallet-accent));
    transition: width 220ms ease;
  }

  .phylax-wallet-guide__step-tab {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    padding: 0 4px;
    color: var(--phylax-muted-strong);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .phylax-wallet-guide__step-dot {
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    color: transparent;
    background: var(--phylax-bg);
    border: 2px solid var(--phylax-border);
    border-radius: 50%;
    box-shadow: 0 0 0 4px var(--phylax-bg);
    transition: 160ms ease;
    transition-property: border-color, background, color, transform;
  }

  .phylax-wallet-guide__step-tab--complete .phylax-wallet-guide__step-dot,
  .phylax-wallet-guide__step-tab--active .phylax-wallet-guide__step-dot {
    color: #ffffff;
    background: var(--wallet-accent);
    border-color: var(--wallet-accent);
  }

  .phylax-wallet-guide__step-tab--active .phylax-wallet-guide__step-dot {
    transform: scale(1.12);
    box-shadow: 0 0 0 4px var(--wallet-accent-soft);
  }

  .phylax-wallet-guide__step-dot svg {
    width: 10px;
    height: 10px;
  }

  .phylax-wallet-guide__step-name {
    width: 100%;
    margin-top: 7px;
    overflow: hidden;
    color: inherit;
    font-size: 9px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .phylax-wallet-guide__step-tab--active .phylax-wallet-guide__step-name {
    color: var(--wallet-accent-strong);
  }

  .phylax-wallet-guide__walkthrough {
    display: grid;
    grid-template-columns: minmax(280px, 1.12fr) minmax(245px, 0.88fr);
    flex: 1;
    gap: 24px;
    min-height: 0;
    padding: 0 34px 30px;
    animation: phylax-guide-step-in 180ms ease-out;
  }

  .phylax-wallet-guide__image-stage {
    position: relative;
    display: flex;
    min-height: 370px;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--phylax-subtle);
    border: 1px solid var(--phylax-border);
    border-radius: 12px;
  }

  .phylax-wallet-guide__image-stage::before,
  .phylax-wallet-guide__image-stage::after {
    position: absolute;
    width: 180px;
    height: 180px;
    content: "";
    background: var(--wallet-accent-soft);
    border-radius: 50%;
    filter: blur(2px);
  }

  .phylax-wallet-guide__image-stage::before {
    top: -90px;
    right: -60px;
  }

  .phylax-wallet-guide__image-stage::after {
    bottom: -115px;
    left: -45px;
  }

  .phylax-wallet-guide__image-stage img {
    position: relative;
    z-index: 1;
    display: block;
    width: auto;
    max-width: calc(100% - 36px);
    height: auto;
    max-height: 390px;
    object-fit: contain;
    background: #ffffff;
    border: 1px solid var(--phylax-border);
    border-radius: 10px;
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.22), 0 3px 8px rgba(0, 0, 0, 0.12);
  }

  .phylax-wallet-guide__step-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 25px 23px 20px;
    background: var(--phylax-card);
    border: 1px solid var(--phylax-border);
    border-radius: 12px;
  }

  .phylax-wallet-guide__step-count {
    align-self: flex-start;
    margin: 0;
    padding: 5px 9px;
    color: var(--wallet-accent-strong);
    background: var(--wallet-accent-soft);
    border: 1px solid var(--phylax-border);
    border-radius: 999px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .phylax-wallet-guide__step-card h3 {
    margin: 17px 0 8px;
    color: var(--phylax-card-fg);
    font-size: 24px;
    font-weight: 730;
    line-height: 1.18;
    letter-spacing: -0.028em;
  }

  .phylax-wallet-guide__step-card > p:not(.phylax-wallet-guide__step-count) {
    margin: 0;
    color: var(--phylax-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .phylax-wallet-guide__connection {
    margin-top: 18px;
    padding: 12px;
    background: var(--phylax-bg);
    border: 1px solid var(--phylax-border);
    border-radius: 10px;
  }

  .phylax-wallet-guide__connection--connected {
    border-color: var(--phylax-success);
  }

  .phylax-wallet-guide__connection-row {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 10px;
  }

  .phylax-wallet-guide__connection-icon {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    place-items: center;
    color: var(--phylax-muted-strong);
    background: var(--phylax-card);
    border: 1px solid var(--phylax-border);
    border-radius: 50%;
  }

  .phylax-wallet-guide__connection--connected .phylax-wallet-guide__connection-icon {
    color: var(--phylax-success);
    background: var(--phylax-success-soft);
    border-color: var(--phylax-success);
  }

  .phylax-wallet-guide__connection-icon svg {
    width: 15px;
    height: 15px;
  }

  .phylax-wallet-guide__connection-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--phylax-border);
    border-top-color: var(--wallet-accent);
    border-radius: 50%;
    animation: phylax-guide-spin 700ms linear infinite;
  }

  .phylax-wallet-guide__connection-copy {
    min-width: 0;
  }

  .phylax-wallet-guide__connection-copy strong,
  .phylax-wallet-guide__connection-copy span {
    display: block;
  }

  .phylax-wallet-guide__connection-copy strong {
    color: var(--phylax-fg);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.35;
  }

  .phylax-wallet-guide__connection--connected .phylax-wallet-guide__connection-copy strong {
    color: var(--phylax-success);
  }

  .phylax-wallet-guide__connection-copy span {
    margin-top: 2px;
    color: var(--phylax-muted-strong);
    font-size: 10px;
    line-height: 1.45;
  }

  .phylax-wallet-guide__connection-endpoint {
    min-width: 0;
    margin-top: 10px;
    padding: 8px 9px;
    overflow: hidden;
    color: var(--phylax-muted);
    background: var(--phylax-card);
    border-radius: 7px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .phylax-wallet-guide__connection-retry {
    width: 100%;
    min-height: 32px;
    margin-top: 10px;
    padding: 0 12px;
    color: var(--phylax-fg);
    background: transparent;
    border: 1px solid var(--phylax-border);
    border-radius: 999px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
  }

  .phylax-wallet-guide__connection-retry:hover:not(:disabled) {
    background: var(--phylax-card);
  }

  .phylax-wallet-guide__connection-retry:disabled {
    cursor: wait;
    opacity: 0.5;
  }

  .phylax-wallet-guide__rpc-box {
    margin-top: 16px;
    padding: 11px;
    background: var(--phylax-bg);
    border: 1px solid var(--phylax-border);
    border-radius: 8px;
  }

  .phylax-wallet-guide__rpc-label {
    display: block;
    margin-bottom: 5px;
    color: var(--phylax-muted-strong);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .phylax-wallet-guide__rpc-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .phylax-wallet-guide__rpc-row code {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    padding: 0;
    color: var(--phylax-fg);
    background: transparent;
    border-radius: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .phylax-wallet-guide__copy {
    display: grid;
    width: 31px;
    height: 31px;
    flex: 0 0 31px;
    padding: 0;
    place-items: center;
    color: var(--wallet-accent-strong);
    background: var(--wallet-accent-soft);
    border: 0;
    border-radius: 999px;
    cursor: pointer;
  }

  .phylax-wallet-guide__copy:hover {
    filter: brightness(0.97);
  }

  .phylax-wallet-guide__copy svg {
    width: 15px;
    height: 15px;
  }

  .phylax-wallet-guide__actions {
    display: flex;
    gap: 9px;
    margin-top: auto;
    padding-top: 22px;
  }

  .phylax-wallet-guide__action {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 15px;
    color: var(--phylax-fg);
    background: var(--phylax-bg);
    border: 1px solid var(--phylax-border);
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    transition: 140ms ease;
    transition-property: background, border-color, color, transform, box-shadow;
  }

  .phylax-wallet-guide__action:hover:not(:disabled) {
    background: var(--phylax-card);
    border-color: var(--phylax-muted-strong);
    transform: translateY(-1px);
  }

  .phylax-wallet-guide__action:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .phylax-wallet-guide__action--primary {
    flex: 1;
    color: var(--phylax-primary-fg);
    background: var(--phylax-primary);
    border-color: var(--phylax-primary);
  }

  .phylax-wallet-guide__action--primary:hover:not(:disabled) {
    color: var(--phylax-primary-fg);
    background: var(--phylax-primary);
    border-color: var(--phylax-primary);
    opacity: 0.9;
  }

  .phylax-wallet-guide__action svg {
    width: 14px;
    height: 14px;
  }

  .phylax-wallet-guide__generic {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }

  .phylax-wallet-guide__generic-card {
    width: min(480px, 100%);
    padding: 34px;
    text-align: center;
    background: var(--phylax-card);
    border: 1px solid var(--phylax-border);
    border-radius: 12px;
  }

  .phylax-wallet-guide__generic-icon {
    display: grid;
    width: 58px;
    height: 58px;
    margin: 0 auto 18px;
    place-items: center;
    color: var(--wallet-accent);
    background: var(--wallet-accent-soft);
    border-radius: 18px;
  }

  .phylax-wallet-guide__generic-icon svg {
    width: 27px;
    height: 27px;
  }

  .phylax-wallet-guide__generic-card h3 {
    margin: 0;
    color: var(--phylax-card-fg);
    font-size: 23px;
    letter-spacing: -0.025em;
  }

  .phylax-wallet-guide__generic-card > p {
    margin: 9px auto 0;
    color: var(--phylax-muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .phylax-wallet-guide__generic-card .phylax-wallet-guide__rpc-box {
    text-align: left;
  }

  .phylax-wallet-guide__generic-card .phylax-wallet-guide__action {
    width: 100%;
    margin-top: 20px;
  }

  .phylax-wallet-guide button:focus-visible {
    outline: 2px solid var(--phylax-muted);
    outline-offset: 2px;
  }

  @media (prefers-color-scheme: light) {
    .phylax-wallet-guide {
      --phylax-bg: #fbfcfc;
      --phylax-fg: #18181b;
      --phylax-card: #ffffff;
      --phylax-card-fg: #09090b;
      --phylax-subtle: #f4f4f5;
      --phylax-muted: #71717a;
      --phylax-muted-strong: #71717a;
      --phylax-border: #e4e4e7;
      --phylax-primary: #171717;
      --phylax-primary-fg: #fafafa;
      --phylax-sidebar: #fafafa;
      --phylax-sidebar-active: #ececee;
      --phylax-success: #16a34a;
      --phylax-success-soft: rgba(22, 163, 74, 0.1);
      --phylax-logo-filter: none;
      --phylax-overlay: rgba(9, 9, 11, 0.5);
      --phylax-shadow: 0 32px 80px rgba(9, 9, 11, 0.24), 0 8px 24px rgba(9, 9, 11, 0.12);
      color-scheme: light;
    }
  }

  :root[data-theme="light"] .phylax-wallet-guide,
  [data-theme="light"] .phylax-wallet-guide,
  .light .phylax-wallet-guide {
    --phylax-bg: #fbfcfc;
    --phylax-fg: #18181b;
    --phylax-card: #ffffff;
    --phylax-card-fg: #09090b;
    --phylax-subtle: #f4f4f5;
    --phylax-muted: #71717a;
    --phylax-muted-strong: #71717a;
    --phylax-border: #e4e4e7;
    --phylax-primary: #171717;
    --phylax-primary-fg: #fafafa;
    --phylax-sidebar: #fafafa;
    --phylax-sidebar-active: #ececee;
    --phylax-success: #16a34a;
    --phylax-success-soft: rgba(22, 163, 74, 0.1);
    --phylax-logo-filter: none;
    --phylax-overlay: rgba(9, 9, 11, 0.5);
    --phylax-shadow: 0 32px 80px rgba(9, 9, 11, 0.24), 0 8px 24px rgba(9, 9, 11, 0.12);
    color-scheme: light;
  }

  :root[data-theme="dark"] .phylax-wallet-guide,
  [data-theme="dark"] .phylax-wallet-guide,
  .dark .phylax-wallet-guide {
    --phylax-bg: #181818;
    --phylax-fg: #f4f4f5;
    --phylax-card: #212121;
    --phylax-card-fg: #f4f4f5;
    --phylax-subtle: #0f0f0f;
    --phylax-muted: #d4d4d8;
    --phylax-muted-strong: #a1a1aa;
    --phylax-border: #27272a;
    --phylax-primary: #f4f4f5;
    --phylax-primary-fg: #181818;
    --phylax-sidebar: #181818;
    --phylax-sidebar-active: #212121;
    --phylax-success: #22c55e;
    --phylax-success-soft: rgba(34, 197, 94, 0.12);
    --phylax-logo-filter: invert(1) brightness(1.12);
    --phylax-overlay: rgba(0, 0, 0, 0.74);
    --phylax-shadow: 0 32px 80px rgba(0, 0, 0, 0.52), 0 8px 24px rgba(0, 0, 0, 0.28);
    color-scheme: dark;
  }

  @keyframes phylax-guide-fade-in {
    from { opacity: 0; }
  }

  @keyframes phylax-guide-rise-in {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
  }

  @keyframes phylax-guide-step-in {
    from { opacity: 0; transform: translateY(4px); }
  }

  @keyframes phylax-guide-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 800px) {
    .phylax-wallet-guide__dialog {
      grid-template-columns: 190px minmax(0, 1fr);
    }

    .phylax-wallet-guide__sidebar {
      padding-inline: 13px;
    }

    .phylax-wallet-guide__header {
      padding-left: 25px;
    }

    .phylax-wallet-guide__stepper {
      margin-inline: 25px;
    }

    .phylax-wallet-guide__walkthrough {
      grid-template-columns: minmax(240px, 1fr) minmax(215px, 0.82fr);
      gap: 16px;
      padding-inline: 25px;
    }
  }

  @media (max-width: 680px) {
    .phylax-wallet-guide {
      padding: 12px;
    }

    .phylax-wallet-guide__dialog {
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-columns: 1fr;
      height: calc(100vh - 24px);
    }

    .phylax-wallet-guide__sidebar {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding: 11px 15px;
      border-right: 0;
      border-bottom: 1px solid var(--phylax-border);
    }

    .phylax-wallet-guide__brand {
      padding: 0;
    }

    .phylax-wallet-guide__brand-mark {
      width: 34px;
      height: 34px;
      flex-basis: 34px;
      border-radius: 10px;
    }

    .phylax-wallet-guide__brand-copy,
    .phylax-wallet-guide__nav-label,
    .phylax-wallet-guide__sidebar-note {
      display: none;
    }

    .phylax-wallet-guide__wallet-nav {
      display: flex;
      justify-content: flex-end;
      overflow-x: auto;
    }

    .phylax-wallet-guide__wallet-button {
      width: auto;
      grid-template-columns: 30px auto 16px;
      gap: 7px;
      padding: 5px 8px;
      border-radius: 11px;
    }

    .phylax-wallet-guide__wallet-icon {
      width: 30px;
      height: 30px;
      border-radius: 9px;
    }

    .phylax-wallet-guide__wallet-icon img {
      width: 25px;
      height: 25px;
    }

    .phylax-wallet-guide__wallet-copy span {
      display: none;
    }

    .phylax-wallet-guide__content {
      min-height: 0;
    }

    .phylax-wallet-guide__walkthrough {
      grid-template-columns: 1fr;
    }

    .phylax-wallet-guide__image-stage {
      min-height: 300px;
    }

    .phylax-wallet-guide__image-stage img {
      max-height: 310px;
    }

    .phylax-wallet-guide__step-card {
      min-height: 260px;
    }
  }

  @media (max-width: 480px) {
    .phylax-wallet-guide {
      align-items: flex-end;
      padding: 0;
    }

    .phylax-wallet-guide__dialog {
      height: min(94vh, 760px);
      border-radius: 24px 24px 0 0;
    }

    .phylax-wallet-guide__close {
      top: 19px;
      right: 18px;
    }

    .phylax-wallet-guide__header {
      padding: 21px 66px 0 18px;
    }

    .phylax-wallet-guide__header h2 {
      font-size: 25px;
    }

    .phylax-wallet-guide__header p:last-child {
      font-size: 12px;
    }

    .phylax-wallet-guide__stepper {
      margin: 18px 18px 15px;
    }

    .phylax-wallet-guide__step-name {
      display: none;
    }

    .phylax-wallet-guide__walkthrough {
      gap: 13px;
      padding: 0 18px 20px;
    }

    .phylax-wallet-guide__image-stage {
      min-height: 255px;
      border-radius: 17px;
    }

    .phylax-wallet-guide__image-stage img {
      max-width: calc(100% - 26px);
      max-height: 265px;
      border-radius: 12px;
    }

    .phylax-wallet-guide__step-card {
      min-height: 248px;
      padding: 21px 18px 17px;
      border-radius: 17px;
    }

    .phylax-wallet-guide__step-card h3 {
      margin-top: 14px;
      font-size: 22px;
    }

    .phylax-wallet-guide__action {
      min-height: 42px;
    }

    .phylax-wallet-guide__generic {
      padding: 20px 18px;
    }

    .phylax-wallet-guide__generic-card {
      padding: 28px 20px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .phylax-wallet-guide,
    .phylax-wallet-guide__dialog,
    .phylax-wallet-guide__walkthrough,
    .phylax-wallet-guide__connection-spinner {
      animation: none;
    }

    .phylax-wallet-guide * {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.25 8.2 3 3.05 6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="6.5" y="2.5" width="9" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11.5 15.5h-7a2 2 0 0 1-2-2v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={direction === 'left' ? { transform: 'rotate(180deg)' } : undefined}>
      <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5h14a2 2 0 0 1 2 2v8.25a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V6.25a2 2 0 0 1 2-2H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20 11.25h-4.25a2 2 0 1 0 0 4H20v-4Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ConnectionStatusIcon({ state }: { state: ConnectionVerificationState }) {
  if (state === 'checking') {
    return <span className="phylax-wallet-guide__connection-spinner" aria-hidden="true" />;
  }
  if (state === 'connected') return <CheckIcon />;
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.75v3.8M8 11.1h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Fallback modal for the **manual** RPC-add path (ENG-3595).
 *
 * Shown when the user asks to add Phylax but their wallet is not on the assisted
 * allowlist (no one-click `wallet_addEthereumChain(0x1)` support) — i.e. when
 * {@link attemptSwitch} returns `manualFallback: true`. It guides the user through
 * adding the RPC by hand for their specific wallet.
 *
 * The component is self-contained and can be replaced by the consuming dApp.
 */
export function ManualAddModal({
  open,
  onClose,
  walletName,
  rpcUrl,
  verifyConnection,
}: ManualAddModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const verifyConnectionRef = useRef(verifyConnection);
  const verificationRunRef = useRef(0);
  const verificationPendingRunRef = useRef<number | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletGuideId>(guideIdForWallet(walletName));
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [verificationState, setVerificationState] = useState<ConnectionVerificationState>('idle');
  const activeGuide = WALLET_GUIDES.find((guide) => guide.id === selectedWallet);
  const currentStep = activeGuide?.steps[step];
  const lastStep = activeGuide ? step === activeGuide.steps.length - 1 : false;
  const hasVerifier = typeof verifyConnection === 'function';

  verifyConnectionRef.current = verifyConnection;

  const runVerification = useCallback(async (showChecking = true) => {
    const verifier = verifyConnectionRef.current;
    if (!verifier) {
      setVerificationState('idle');
      return;
    }
    if (verificationPendingRunRef.current !== null) return;

    const run = ++verificationRunRef.current;
    verificationPendingRunRef.current = run;
    if (showChecking) setVerificationState('checking');
    try {
      const connected = await verifier();
      if (run === verificationRunRef.current) {
        setVerificationState(connected ? 'connected' : 'disconnected');
      }
    } catch {
      if (run === verificationRunRef.current) setVerificationState('disconnected');
    } finally {
      if (verificationPendingRunRef.current === run) {
        verificationPendingRunRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Re-select the detected wallet each time the modal is opened. Consumers can still
  // use the sidebar to view another wallet's guide.
  useEffect(() => {
    if (!open) return;
    setSelectedWallet(guideIdForWallet(walletName));
    setStep(0);
    setCopied(false);
    setVerificationState('idle');
  }, [open, walletName]);

  useEffect(() => setCopied(false), [step]);

  useEffect(() => {
    if (!open || !lastStep || !hasVerifier) {
      verificationRunRef.current += 1;
      verificationPendingRunRef.current = null;
      setVerificationState('idle');
      return;
    }

    void runVerification();
    const verifyOnFocus = () => void runVerification();
    const verificationInterval = window.setInterval(
      () => void runVerification(false),
      CONNECTION_VERIFICATION_INTERVAL_MS,
    );
    window.addEventListener('focus', verifyOnFocus);
    return () => {
      window.removeEventListener('focus', verifyOnFocus);
      window.clearInterval(verificationInterval);
      verificationRunRef.current += 1;
      verificationPendingRunRef.current = null;
    };
  }, [hasVerifier, lastStep, open, runVerification, selectedWallet]);

  if (!open) return null;

  const wallet = walletName?.trim() || 'your wallet';
  const doneDisabled = lastStep && hasVerifier && verificationState !== 'connected';
  const connectionCopy = !hasVerifier
    ? {
        title: 'Make sure the endpoint is enabled',
        detail: 'Save this RPC URL in your wallet before finishing.',
      }
    : verificationState === 'checking'
      ? {
          title: 'Checking your wallet…',
          detail: 'Confirming that Ethereum is routed through Phylax.',
        }
      : verificationState === 'connected'
        ? {
            title: 'Connected to Phylax',
            detail: 'Your wallet is using the protected Ethereum RPC.',
          }
        : verificationState === 'disconnected'
          ? {
              title: 'Not connected yet',
              detail: 'Enable the Phylax RPC in your wallet, then check again.',
            }
          : {
              title: 'Ready to verify',
              detail: 'Save the endpoint in your wallet, then return here.',
            };
  const guideTheme = activeGuide
    ? {
        '--wallet-accent': activeGuide.accent,
        '--wallet-accent-strong': activeGuide.accentStrong,
        '--wallet-accent-soft': activeGuide.accentSoft,
      } as CSSProperties
    : undefined;

  const copyRpcUrl = async () => {
    if (!rpcUrl || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(rpcUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const chooseWallet = (nextWallet: WalletGuideId) => {
    setSelectedWallet(nextWallet);
    setStep(0);
  };

  const renderRpcBox = () =>
    rpcUrl ? (
      <div className="phylax-wallet-guide__rpc-box">
        <span className="phylax-wallet-guide__rpc-label">Phylax RPC URL</span>
        <div className="phylax-wallet-guide__rpc-row">
          <code title={rpcUrl}>{rpcUrl}</code>
          <button
            type="button"
            className="phylax-wallet-guide__copy"
            aria-label={copied ? 'RPC URL copied' : 'Copy RPC URL'}
            title={copied ? 'Copied' : 'Copy RPC URL'}
            onClick={copyRpcUrl}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="phylax-wallet-guide" role="presentation" onMouseDown={onClose}>
      <style>{MODAL_STYLES}</style>
      <div
        ref={dialogRef}
        className="phylax-wallet-guide__dialog"
        style={guideTheme}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phylax-manual-add-title"
        aria-describedby="phylax-manual-add-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="phylax-wallet-guide__sidebar" aria-label="Wallet guides">
          <div className="phylax-wallet-guide__brand">
            <span className="phylax-wallet-guide__brand-mark">
              <img src={phylaxLogo} alt="" />
            </span>
            <span className="phylax-wallet-guide__brand-copy">
              <strong>Phylax</strong>
              <span>RPC setup</span>
            </span>
          </div>

          <p className="phylax-wallet-guide__nav-label">Choose wallet</p>
          <div className="phylax-wallet-guide__wallet-nav">
            {WALLET_GUIDES.map((guide) => {
              const selected = selectedWallet === guide.id;
              return (
                <button
                  key={guide.id}
                  type="button"
                  className={`phylax-wallet-guide__wallet-button${selected ? ' phylax-wallet-guide__wallet-button--active' : ''}`}
                  aria-pressed={selected}
                  onClick={() => chooseWallet(guide.id)}
                >
                  <span className="phylax-wallet-guide__wallet-icon">
                    <img src={guide.logo} alt="" />
                  </span>
                  <span className="phylax-wallet-guide__wallet-copy">
                    <strong>{guide.name}</strong>
                    <span>{guide.navDetail}</span>
                  </span>
                  <span className="phylax-wallet-guide__selected-check"><CheckIcon /></span>
                </button>
              );
            })}

            <button
              type="button"
              className={`phylax-wallet-guide__wallet-button${selectedWallet === 'other' ? ' phylax-wallet-guide__wallet-button--active' : ''}`}
              aria-pressed={selectedWallet === 'other'}
              onClick={() => chooseWallet('other')}
            >
              <span className="phylax-wallet-guide__wallet-icon"><WalletIcon /></span>
              <span className="phylax-wallet-guide__wallet-copy">
                <strong>Other wallet</strong>
                <span>Manual details</span>
              </span>
              <span className="phylax-wallet-guide__selected-check"><CheckIcon /></span>
            </button>
          </div>

          <div className="phylax-wallet-guide__sidebar-note">
            <strong>Ethereum stays selected</strong>
            You’re only replacing its RPC endpoint. The network and your assets remain unchanged.
          </div>
        </aside>

        <div className="phylax-wallet-guide__content">
          <button type="button" className="phylax-wallet-guide__close" aria-label="Close wallet guide" onClick={onClose}>
            <CloseIcon />
          </button>

          <header className="phylax-wallet-guide__header">
            <p className="phylax-wallet-guide__eyebrow">
              {activeGuide ? <img src={activeGuide.logo} alt="" /> : <WalletIcon />}
              {activeGuide?.name ?? 'Manual setup'}
            </p>
            <h2 id="phylax-manual-add-title">
              {activeGuide?.heading ?? `Add Phylax to ${wallet}`}
            </h2>
            <p id="phylax-manual-add-description">
              {activeGuide?.description
                ?? `${wallet} can’t add the Phylax RPC in one click. Copy the URL below and add it in your wallet’s network settings.`}
            </p>
          </header>

          {activeGuide && currentStep ? (
            <>
              <nav
                className="phylax-wallet-guide__stepper"
                aria-label={`${activeGuide.name} setup progress`}
                style={{
                  gridTemplateColumns: `repeat(${activeGuide.steps.length}, minmax(0, 1fr))`,
                  '--step-edge': `${50 / activeGuide.steps.length}%`,
                } as CSSProperties}
              >
                <span className="phylax-wallet-guide__stepper-track" />
                <span
                  className="phylax-wallet-guide__stepper-progress"
                  style={{
                    width: activeGuide.steps.length > 1
                      ? `${(step / (activeGuide.steps.length - 1)) * (100 - 100 / activeGuide.steps.length)}%`
                      : '0%',
                  }}
                />
                {activeGuide.steps.map((item, index) => {
                  const state = index === step ? 'active' : index < step ? 'complete' : 'pending';
                  return (
                    <button
                      key={item.title}
                      type="button"
                      className={`phylax-wallet-guide__step-tab phylax-wallet-guide__step-tab--${state}`}
                      aria-label={`Step ${index + 1}: ${item.title}`}
                      aria-current={index === step ? 'step' : undefined}
                      onClick={() => setStep(index)}
                    >
                      <span className="phylax-wallet-guide__step-dot">{index < step ? <CheckIcon /> : null}</span>
                      <span className="phylax-wallet-guide__step-name">{item.title}</span>
                    </button>
                  );
                })}
              </nav>

              <div key={step} className="phylax-wallet-guide__walkthrough">
                <div className="phylax-wallet-guide__image-stage">
                  <img src={currentStep.image} alt={`${activeGuide.name} step ${step + 1}: ${currentStep.title}`} />
                </div>

                <section className="phylax-wallet-guide__step-card" aria-live="polite">
                  <p className="phylax-wallet-guide__step-count">Step {step + 1} of {activeGuide.steps.length}</p>
                  <h3>{currentStep.title}</h3>
                  <p>{currentStep.text}</p>
                  {lastStep ? (
                    <div
                      className={`phylax-wallet-guide__connection${verificationState === 'connected' ? ' phylax-wallet-guide__connection--connected' : ''}`}
                    >
                      <div
                        className="phylax-wallet-guide__connection-row"
                        role="status"
                        aria-live="polite"
                      >
                        <span className="phylax-wallet-guide__connection-icon">
                          <ConnectionStatusIcon state={verificationState} />
                        </span>
                        <span className="phylax-wallet-guide__connection-copy">
                          <strong>{connectionCopy.title}</strong>
                          <span>{connectionCopy.detail}</span>
                        </span>
                      </div>
                      {rpcUrl ? (
                        <div className="phylax-wallet-guide__connection-endpoint" title={rpcUrl}>
                          {rpcUrl}
                        </div>
                      ) : null}
                      {hasVerifier && verificationState !== 'connected' ? (
                        <button
                          type="button"
                          className="phylax-wallet-guide__connection-retry"
                          disabled={verificationState === 'checking'}
                          onClick={() => void runVerification()}
                        >
                          {verificationState === 'checking' ? 'Checking…' : 'Check connection'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {step === activeGuide.rpcStep ? renderRpcBox() : null}

                  <div className="phylax-wallet-guide__actions">
                    <button
                      type="button"
                      className="phylax-wallet-guide__action"
                      disabled={step === 0}
                      onClick={() => setStep((value) => Math.max(0, value - 1))}
                    >
                      <ArrowIcon direction="left" />
                      Back
                    </button>
                    <button
                      type="button"
                      className="phylax-wallet-guide__action phylax-wallet-guide__action--primary"
                      disabled={doneDisabled}
                      onClick={() => lastStep ? onClose() : setStep((value) => Math.min(activeGuide.steps.length - 1, value + 1))}
                    >
                      {lastStep ? 'Done' : 'Next step'}
                      {lastStep ? <CheckIcon /> : <ArrowIcon direction="right" />}
                    </button>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="phylax-wallet-guide__generic">
              <section className="phylax-wallet-guide__generic-card">
                <span className="phylax-wallet-guide__generic-icon"><WalletIcon /></span>
                <h3>Use your wallet’s network settings</h3>
                <p>Find the Ethereum network, edit its RPC URL, and paste the Phylax endpoint below.</p>
                {renderRpcBox()}
                <button type="button" className="phylax-wallet-guide__action phylax-wallet-guide__action--primary" onClick={onClose}>
                  Got it
                  <CheckIcon />
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
