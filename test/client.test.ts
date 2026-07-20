import { describe, expect, it } from 'vitest';
import { PhylaxRpcSwitch } from '../src/client';
import { WALLET_RDNS } from '../src/constants';
import { errorStringRevert, MockProvider } from './helpers';

describe('PhylaxRpcSwitch', () => {
  const client = new PhylaxRpcSwitch({
    rpcUrl: 'https://rpc.phylax.example',
    blockExplorerUrls: ['https://etherscan.io'],
  });

  it('applies defaults', () => {
    expect(client.config.chainId).toBe(1);
    expect(client.config.chainName).toBe('Ethereum (Phylax)');
    expect(client.config.nativeCurrency.symbol).toBe('ETH');
  });

  it('throws without an rpcUrl', () => {
    // @ts-expect-error intentionally invalid
    expect(() => new PhylaxRpcSwitch({})).toThrow(/rpcUrl/);
  });

  it('builds add-chain params', () => {
    expect(client.addChainParams()).toMatchObject({
      chainId: '0x1',
      rpcUrls: ['https://rpc.phylax.example'],
      blockExplorerUrls: ['https://etherscan.io'],
    });
  });

  it('builds manual instructions', () => {
    expect(client.manualInstructions()).toEqual({
      networkName: 'Ethereum (Phylax)',
      rpcUrl: 'https://rpc.phylax.example',
      chainId: 1,
      chainIdHex: '0x1',
      currencySymbol: 'ETH',
      blockExplorerUrl: 'https://etherscan.io',
    });
  });

  it('builds a web3-onboard chain wiring protectedRpcUrl', () => {
    const chain = client.toWeb3OnboardChain({ publicRpcUrl: 'https://cloudflare-eth.com' });
    expect(chain.protectedRpcUrl).toBe('https://rpc.phylax.example');
    expect(chain.rpcUrl).toBe('https://cloudflare-eth.com');
    expect(chain.id).toBe('0x1');
  });

  it('delegates detect to the configured matcher', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed');
    });
    const result = await client.detect({
      provider,
      transaction: { from: '0x' + '11'.repeat(20) },
    });
    expect(result.offPhylax).toBe(true);
  });

  it('exposes the silent Phylax routing check', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', () => '0x' + '0'.repeat(63) + '1');

    expect(await client.isConnectedToPhylax(provider)).toBe(true);
  });

  it('delegates classify', () => {
    expect(client.classify({ rdns: WALLET_RDNS.zerion, userAgent: 'Macintosh Chrome' }).id).toBe('zerion');
  });
});
