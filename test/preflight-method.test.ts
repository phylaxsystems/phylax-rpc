import { describe, expect, it } from 'vitest';
import { PhylaxRpcSwitch, PREFLIGHT_METHODS } from '../src';
import { resolveConfig } from '../src/config';
import { detectOffPhylax } from '../src/detect';
import { encodeErrorString, errorStringRevert, MockProvider } from './helpers';

const config = resolveConfig({ rpcUrl: 'https://rpc.phylax.example' });
const account = '0x' + '11'.repeat(20);
const transaction = { to: '0x' + '22'.repeat(20), data: '0xdeadbeef', value: 1n };

describe('preflight method selection', () => {
  it('defaults to eth_call at latest after resolving the sender silently', async () => {
    const provider = new MockProvider()
      .setHandlers('eth_accounts', () => [account])
      .setHandlers('eth_call', () => '0x');

    const result = await detectOffPhylax({ provider, transaction, config });

    expect(result.status).toBe('on-phylax');
    expect(provider.calls).toEqual([
      { method: 'eth_accounts', params: undefined },
      {
        method: 'eth_call',
        params: [{ ...transaction, from: account, value: '0x1' }, 'latest'],
      },
    ]);
  });

  it.each(Object.values(PREFLIGHT_METHODS))(
    'honours an explicit %s through the public client',
    async (method) => {
      const provider = new MockProvider().setHandlers(method, () =>
        method === 'eth_simulateV1' ? [{ calls: [{ status: '0x1', returnData: '0x' }] }] : '0x',
      );
      const client = new PhylaxRpcSwitch({ rpcUrl: config.rpcUrl });

      const result = await client.detect({ provider, transaction, account, method });

      expect(result.status).toBe('on-phylax');
      const normalized = { ...transaction, from: account, value: '0x1' };
      const params = method === 'eth_simulateV1'
        ? [{ blockStateCalls: [{ calls: [normalized] }], validation: false }, 'latest']
        : method === 'eth_call' ? [normalized, 'latest'] : [normalized];
      expect(provider.calls).toEqual([{ method, params }]);
    },
  );
});

describe('eth_simulateV1 results', () => {
  const method = 'eth_simulateV1';
  const reason = `credible layer: transaction rejected by assertion 0x${'ab'.repeat(32)}`;

  it.each([
    ['Credible rejection', reason, 'reverted'],
    ['ordinary revert', 'ERC20: insufficient balance', 'reverted'],
    ['off-Phylax signal', 'assertion failed', 'off-phylax'],
  ])('classifies a nested %s using returnData', async (_label, message, status) => {
    const provider = new MockProvider().setHandlers(method, () => [{ calls: [{
      status: '0x0',
      returnData: encodeErrorString(message),
      error: { code: -32000, message: 'execution reverted' },
    }] }]);

    const result = await detectOffPhylax({
      provider, transaction, account, config, method, retry: false,
    });

    expect(result.status).toBe(status);
    if (result.status !== 'reverted' && result.status !== 'off-phylax') {
      throw new Error('expected revert evidence');
    }
    expect(result.revertReason).toBe(message);
    if (message === reason && result.status === 'reverted') {
      expect(result.assertionRejection?.assertions).toEqual(['0x' + 'ab'.repeat(32)]);
    }
    expect(provider.calls).toHaveLength(1);
  });

  it('classifies a top-level assertion rejection without retrying or falling back', async () => {
    const error = errorStringRevert(reason);
    const provider = new MockProvider().setHandlers(method, () => { throw error; });

    const result = await detectOffPhylax({ provider, transaction, account, config, method });

    expect(result).toMatchObject({ status: 'reverted', error, revertReason: reason });
    expect(provider.calls).toHaveLength(1);
  });

  it.each([
    { code: 3, message: 'execution reverted' },
    { code: -32015, message: 'out of gas' },
    { code: -32015, message: 'invalid opcode: INVALID' },
    { code: -32000, message: 'insufficient funds for gas * price + value' },
    { code: -32603, message: 'credible layer: assertions are unavailable, try again shortly' },
    { code: -32000, message: 'unknown failure' },
    undefined,
  ])('treats a zero status as execution failure with empty returnData: %j', async (error) => {
    const provider = new MockProvider().setHandlers(method, () => [{
      calls: [{ status: '0x0', returnData: '0x', error }],
    }]);

    const result = await detectOffPhylax({
      provider, transaction, account, config, method,
    });

    expect(result).toMatchObject({ status: 'reverted', offPhylax: false, revertData: '0x' });
    expect(provider.calls).toHaveLength(1);
  });

  it.each([
    null, '0x', [], [{}], [{ calls: [] }],
    [{ calls: [{ status: '0x2', returnData: '0x' }] }],
    [{ calls: [{ status: '0x1' }] }],
    [{ calls: [{ status: '0x1', returnData: 'invalid' }] }],
    [{ calls: [{ status: '0x1', returnData: '0x', error: { message: 'failed' } }] }],
    [{ calls: [{ status: '0x1', returnData: '0x' }, { status: '0x1', returnData: '0x' }] }],
    [{ calls: [{ status: '0x1', returnData: '0x' }] }, { calls: [] }],
  ].map((response) => [response]))('keeps malformed responses inconclusive: %j', async (response) => {
    const provider = new MockProvider().setHandlers(method, () => response);

    const result = await detectOffPhylax({ provider, transaction, account, config, method });

    expect(result).toMatchObject({ status: 'inconclusive', reason: 'unknown', retryable: false });
    expect(provider.calls).toHaveLength(1);
  });

  it('does not fall back when the provider does not support simulation', async () => {
    const provider = new MockProvider().setHandlers(method, () => {
      throw { code: -32601, message: 'Method not found' };
    });

    const result = await detectOffPhylax({ provider, transaction, account, config, method });

    expect(result.status).toBe('inconclusive');
    expect(provider.calls.map((call) => call.method)).toEqual([method]);
  });
});
