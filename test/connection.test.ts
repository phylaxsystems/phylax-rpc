import { describe, expect, it } from 'vitest';
import {
  isConnectedToPhylax,
  PHYLAX_ROUTING_SIGNAL_V1,
} from '../src/connection';
import { MockProvider } from './helpers';

const TRUE_WORD = '0x' + '0'.repeat(63) + '1';
const FALSE_WORD = '0x' + '0'.repeat(64);

describe('isConnectedToPhylax', () => {
  it('returns true when the versioned credible-marker probe is active', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', (params) => {
        expect(params).toEqual([
          {
            to: PHYLAX_ROUTING_SIGNAL_V1.registry,
            data: PHYLAX_ROUTING_SIGNAL_V1.callData,
          },
          'latest',
          null,
          { number: PHYLAX_ROUTING_SIGNAL_V1.blockNumber },
        ]);
        return TRUE_WORD;
      });

    expect(await isConnectedToPhylax(provider)).toBe(true);
  });

  it('returns false when a normal RPC reports no credible marker', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', () => FALSE_WORD);

    expect(await isConnectedToPhylax(provider)).toBe(false);
  });

  it('does not probe the mainnet registry on another chain', async () => {
    const provider = new MockProvider().setHandlers('eth_chainId', () => '0xa');

    expect(await isConnectedToPhylax(provider)).toBe(false);
    expect(provider.callsTo('eth_call')).toHaveLength(0);
  });

  it('returns false for malformed results and provider errors', async () => {
    const malformed = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', () => '0x');
    const failed = new MockProvider().setHandlers('eth_chainId', () => {
      throw new Error('wallet unavailable');
    });

    expect(await isConnectedToPhylax(malformed)).toBe(false);
    expect(await isConnectedToPhylax(failed)).toBe(false);
  });
});
