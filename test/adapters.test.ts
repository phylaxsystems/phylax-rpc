import { describe, expect, it } from 'vitest';
import { connectedWallet, type ConnectorLike } from '../src/wagmi';
import { providerFromWalletClient } from '../src/viem';
import { providerFromEthers } from '../src/ethers';
import { MockProvider } from './helpers';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

describe('wagmi: connectedWallet', () => {
  it('returns null when the account has no connector', async () => {
    expect(await connectedWallet({ address: '0xabc' })).toBeNull();
  });

  it('resolves the connected provider and classifies via the connector rdns', async () => {
    const provider = new MockProvider();
    const connector: ConnectorLike = {
      id: 'io.rabby',
      name: 'Rabby Wallet',
      rdns: 'io.rabby',
      getProvider: async () => provider,
    };
    const account = '0x' + '11'.repeat(20);

    const result = await connectedWallet({ address: account, connector }, DESKTOP_UA);

    if (result === null) throw new Error('expected a connected wallet');
    expect(result.provider).toBe(provider);
    expect(result.account).toBe(account);
    expect(result.wallet.id).toBe('rabby');
    expect(result.wallet.rdns).toBe('io.rabby');
  });

  it('returns null when the connector yields no provider', async () => {
    const connector: ConnectorLike = { getProvider: async () => null };
    expect(await connectedWallet({ connector })).toBeNull();
  });

  it("accepts a connector whose rdns is an array (wagmi's shape)", async () => {
    const provider = new MockProvider();
    const connector: ConnectorLike = {
      id: 'io.rabby',
      name: 'Rabby Wallet',
      rdns: ['io.rabby'],
      getProvider: async () => provider,
    };

    const result = await connectedWallet({ address: '0xabc', connector }, DESKTOP_UA);

    if (result === null) throw new Error('expected a connected wallet');
    expect(result.wallet.id).toBe('rabby');
    expect(result.wallet.rdns).toBe('io.rabby');
  });
});

describe('viem: providerFromWalletClient', () => {
  it('forwards method and params to the wallet client request', async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const client = {
      request: async (args: { method: string; params?: unknown }) => {
        calls.push(args);
        return '0x5208';
      },
    };
    const provider = providerFromWalletClient(client);
    const out = await provider.request({ method: 'eth_estimateGas', params: [{ to: '0x0' }] });

    expect(out).toBe('0x5208');
    expect(calls).toEqual([{ method: 'eth_estimateGas', params: [{ to: '0x0' }] }]);
  });
});

describe('ethers: providerFromEthers', () => {
  it('wraps send(), passing array params through', async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const provider = providerFromEthers({
      send: async (method, params) => {
        calls.push({ method, params });
        return '0x1';
      },
    });
    await provider.request({ method: 'eth_call', params: [{ to: '0x0' }, 'latest'] });
    expect(calls[0]).toEqual({ method: 'eth_call', params: [{ to: '0x0' }, 'latest'] });
  });

  it('normalizes a single param to a one-element array and absent params to []', async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const provider = providerFromEthers({
      send: async (method, params) => {
        calls.push({ method, params });
        return null;
      },
    });
    await provider.request({ method: 'eth_chainId' });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: { chainId: '0x1' },
    });
    expect(calls[0]).toEqual({ method: 'eth_chainId', params: [] });
    expect(calls[1]).toEqual({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
    });
  });
});
