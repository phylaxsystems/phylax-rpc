import { describe, expect, it } from 'vitest';
import {
  checkPhylaxRouting,
  isConnectedToPhylax,
  PHYLAX_ROUTING_SIGNAL_V2,
} from '../src/connection';
import { firstArg, MockProvider } from './helpers';
import { MAINNET_CHAIN_ID } from '../src/constants';
import { asChainId } from '../src/brands';

const SENTINEL_WORD = '0x' + '0'.repeat(48) + 'ffffffffffffffff';
const ZERO_WORD = '0x' + '0'.repeat(64);

describe('checkPhylaxRouting', () => {
  it('requires a stored sentinel marker using the current no-argument getter', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', (params) => {
        expect(params).toEqual([
          {
            to: PHYLAX_ROUTING_SIGNAL_V2.registry,
            data: '0x0cb140e6', // lastCredibleBlock()
          },
          'latest',
          null,
          { number: '0xffffffffffffffff' },
        ]);
        return SENTINEL_WORD;
      });

    expect(PHYLAX_ROUTING_SIGNAL_V2.version).toBe(2);
    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('connected');
    expect(provider.calls.map(({ method }) => method)).toEqual(['eth_chainId', 'eth_call']);
  });

  it.each([ZERO_WORD, '0x' + '0'.repeat(62) + '64'])(
    'reports an ordinary RPC with stored marker %s as disconnected', async (storedMarker) => {
      const provider = new MockProvider()
        .setHandlers('eth_chainId', () => '0x1')
        .setHandlers('eth_call', () => storedMarker);

      expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('disconnected');
    },
  );

  it('does not mistake a zero-price credibility bypass for a stored marker', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', (params) => {
        const call = firstArg({ params });
        // The real registry can report credibility without writing its marker in eth_call.
        if (call.data === '0xacd5300c') return '0x' + '0'.repeat(63) + '1';
        expect(call.data).toBe('0x0cb140e6');
        return ZERO_WORD;
      });

    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('disconnected');
  });

  it.each([undefined, null, true, 1, {}, '0x', '0x1',
    '0x' + '0'.repeat(62), '0x' + '0'.repeat(66), '0x' + 'g'.repeat(64)])(
    'returns inconclusive for malformed registry reply %s', async (reply) => {
      const provider = new MockProvider()
        .setHandlers('eth_chainId', () => '0x1')
        .setHandlers('eth_call', () => reply);

      expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('inconclusive');
    },
  );

  it.each([null, {}, 'not-a-chain', 1.5])(
    'returns inconclusive for malformed chain reply %s', async (reply) => {
      const provider = new MockProvider().setHandlers('eth_chainId', () => reply);

      expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('inconclusive');
      expect(provider.callsTo('eth_call')).toHaveLength(0);
    },
  );

  it('does not probe the mainnet registry on another chain', async () => {
    const provider = new MockProvider().setHandlers('eth_chainId', () => '0xa');

    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('disconnected');
    expect(await checkPhylaxRouting(provider, asChainId(10))).toBe('inconclusive');
    expect(provider.callsTo('eth_call')).toHaveLength(0);
  });

  it('returns inconclusive when the provider does not support block overrides', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', () => { throw { code: -32602, message: 'too many arguments' }; });

    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('inconclusive');
  });

  it('probes afresh after failures, reconnects, and changes to the marker', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call',
        () => SENTINEL_WORD,
        () => { throw new Error('provider disconnected'); },
        () => ZERO_WORD,
        () => SENTINEL_WORD,
      );

    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('connected');
    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('inconclusive');
    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('disconnected');
    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('connected');
    expect(provider.callsTo('eth_chainId')).toHaveLength(4);
    expect(provider.callsTo('eth_call')).toHaveLength(4);
  });

  it('does not reuse positive evidence after a chain change', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1', () => '0xa')
      .setHandlers('eth_call', () => SENTINEL_WORD);

    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('connected');
    expect(await checkPhylaxRouting(provider, MAINNET_CHAIN_ID)).toBe('disconnected');
    expect(provider.callsTo('eth_call')).toHaveLength(1);
  });
});

describe('isConnectedToPhylax', () => {
  it('returns true only for a confirmed current marker', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0x1')
      .setHandlers('eth_call', () => SENTINEL_WORD, () => ZERO_WORD, () => '0x');

    expect(await isConnectedToPhylax(provider)).toBe(true);
    expect(await isConnectedToPhylax(provider)).toBe(false);
    expect(await isConnectedToPhylax(provider)).toBe(false);
  });

  it('returns false when the wallet is unavailable', async () => {
    const provider = new MockProvider().setHandlers('eth_chainId', () => {
      throw new Error('wallet unavailable');
    });

    expect(await isConnectedToPhylax(provider)).toBe(false);
  });
});
