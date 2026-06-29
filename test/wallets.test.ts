import { describe, expect, it } from 'vitest';
import {
  classifyWallet,
  discoverProviders,
  supportsAssistedSwitch,
  type DiscoveryTarget,
} from '../src/wallets';
import { WALLET_RDNS } from '../src/constants';
import { MockProvider } from './helpers';

const MM_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MetaMaskMobile';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120';
const ZERION_MOBILE_UA = 'Mozilla/5.0 (iPhone) Zerion/1.0';

describe('classifyWallet — assisted allowlist', () => {
  it('enables assisted switch for MetaMask Mobile in-app only', () => {
    const mobile = classifyWallet({ rdns: WALLET_RDNS.metamask, userAgent: MM_MOBILE_UA });
    expect(mobile.platform).toBe('mobile-in-app');
    expect(mobile.assistedSwitch).toBe(true);

    const ext = classifyWallet({ rdns: WALLET_RDNS.metamask, userAgent: DESKTOP_UA });
    expect(ext.platform).toBe('extension');
    expect(ext.assistedSwitch).toBe(false);
  });

  it('enables assisted switch for the Zerion extension only', () => {
    const ext = classifyWallet({ rdns: WALLET_RDNS.zerion, userAgent: DESKTOP_UA });
    expect(ext.platform).toBe('extension');
    expect(ext.assistedSwitch).toBe(true);

    const mobile = classifyWallet({ rdns: WALLET_RDNS.zerion, userAgent: ZERION_MOBILE_UA });
    expect(mobile.platform).toBe('mobile-in-app');
    expect(mobile.assistedSwitch).toBe(false);
  });

  it('never enables assisted switch for Rabby / Rainbow / Coinbase', () => {
    for (const rdns of [WALLET_RDNS.rabby, WALLET_RDNS.rainbow, WALLET_RDNS.coinbase]) {
      expect(classifyWallet({ rdns, userAgent: DESKTOP_UA }).assistedSwitch).toBe(false);
    }
  });

  it("classifies on the first entry when rdns is wagmi's readonly string[]", () => {
    const c = classifyWallet({ rdns: [WALLET_RDNS.zerion, 'io.other'], userAgent: DESKTOP_UA });
    expect(c.id).toBe('zerion');
    expect(c.rdns).toBe(WALLET_RDNS.zerion);
    expect(c.assistedSwitch).toBe(true);
  });

  it('classifies unknown rdns as unknown / no assisted switch', () => {
    const c = classifyWallet({ rdns: 'com.example.wallet', userAgent: DESKTOP_UA });
    expect(c.id).toBe('unknown');
    expect(c.assistedSwitch).toBe(false);
  });

  it('falls back to provider identity flags when rdns is absent', () => {
    const provider = new MockProvider({ isRabby: true, isMetaMask: true });
    // Rabby also sets isMetaMask; specific flag must win.
    expect(classifyWallet({ provider, userAgent: DESKTOP_UA }).id).toBe('rabby');
  });

  it('respects an explicit platform override', () => {
    const c = classifyWallet({
      rdns: WALLET_RDNS.metamask,
      userAgent: DESKTOP_UA,
      platform: 'mobile-in-app',
    });
    expect(c.assistedSwitch).toBe(true);
  });
});

describe('supportsAssistedSwitch', () => {
  it('matches the spike matrix', () => {
    expect(supportsAssistedSwitch('zerion', 'extension')).toBe(true);
    expect(supportsAssistedSwitch('metamask', 'mobile-in-app')).toBe(true);
    expect(supportsAssistedSwitch('metamask', 'extension')).toBe(false);
    expect(supportsAssistedSwitch('zerion', 'mobile-in-app')).toBe(false);
    expect(supportsAssistedSwitch('coinbase', 'mobile-in-app')).toBe(false);
  });
});

describe('discoverProviders', () => {
  it('returns [] without a window/target', async () => {
    expect(await discoverProviders({ target: undefined, timeout: 5 })).toEqual([]);
  });

  it('collects announced providers and de-dupes by uuid', async () => {
    const target = new EventTarget() as unknown as DiscoveryTarget;
    const announce = (uuid: string, rdns: string) =>
      (target as unknown as EventTarget).dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: { uuid, name: rdns, icon: 'data:,', rdns },
            provider: new MockProvider(),
          },
        }),
      );

    // Respond to the library's request event.
    (target as unknown as EventTarget).addEventListener('eip6963:requestProvider', () => {
      announce('uuid-mm', WALLET_RDNS.metamask);
      announce('uuid-mm', WALLET_RDNS.metamask); // duplicate uuid
      announce('uuid-rabby', WALLET_RDNS.rabby);
    });

    const found = await discoverProviders({ target, timeout: 20 });
    expect(found).toHaveLength(2);
    expect(found.map((d) => d.info.rdns).sort()).toEqual(
      [WALLET_RDNS.metamask, WALLET_RDNS.rabby].sort(),
    );
  });
});
