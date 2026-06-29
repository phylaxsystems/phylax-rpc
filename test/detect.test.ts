import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import {
  buildPreflightParams,
  detectOffPhylax,
  normalizeTransaction,
} from '../src/detect';
import type { LooseTransactionRequest, TransactionRequest } from '../src/types';
import { errorStringRevert, MockProvider } from './helpers';

const config = resolveConfig({ rpcUrl: 'https://rpc.phylax.example' });
const tx: TransactionRequest = {
  from: '0x' + '11'.repeat(20),
  to: '0x' + '22'.repeat(20),
  data: '0xdeadbeef',
  gas: '0x5208',
  gasLimit: '0x5208',
};

describe('buildPreflightParams', () => {
  it('strips gas and gasLimit', () => {
    const [obj] = buildPreflightParams(tx, 'eth_estimateGas') as [Record<string, unknown>];
    expect(obj.gas).toBeUndefined();
    expect(obj.gasLimit).toBeUndefined();
    expect(obj.data).toBe('0xdeadbeef');
  });

  it('appends "latest" for eth_call', () => {
    expect(buildPreflightParams(tx, 'eth_call')[1]).toBe('latest');
  });
});

describe('normalizeTransaction', () => {
  it('coerces a bigint value and strips gas fields', () => {
    const loose: LooseTransactionRequest = {
      from: '0x' + '11'.repeat(20),
      value: 1000000000000000000n,
      gas: 21000n,
      gasLimit: 21000n,
    };
    const out = normalizeTransaction(loose);
    expect(out.value).toBe('0xde0b6b3a7640000');
    expect(out.gas).toBeUndefined();
    expect(out.gasLimit).toBeUndefined();
  });

  it('coerces every numeric form across the fee fields', () => {
    const out = normalizeTransaction({
      value: '1000000000000000000',
      gasPrice: 255,
      maxFeePerGas: '0xFF',
      maxPriorityFeePerGas: { toHexString: () => '0x01' },
      nonce: 5n,
    });
    expect(out.value).toBe('0xde0b6b3a7640000');
    expect(out.gasPrice).toBe('0xff');
    expect(out.maxFeePerGas).toBe('0xff');
    expect(out.maxPriorityFeePerGas).toBe('0x1');
    expect(out.nonce).toBe('0x5');
  });

  it('leaves string address fields untouched and omits absent numerics', () => {
    const out = normalizeTransaction({ from: '0xABC', to: '0xDEF', data: '0xdeadbeef' });
    expect(out).toEqual({ from: '0xABC', to: '0xDEF', data: '0xdeadbeef' });
  });

  it('drops null fields (viem/ethers type to/from/value/data as `… | null`)', () => {
    const out = normalizeTransaction({
      from: null,
      to: '0x' + '22'.repeat(20),
      data: null,
      value: null,
      nonce: 7,
    });
    expect(out.from).toBeUndefined();
    expect(out.data).toBeUndefined();
    expect(out.value).toBeUndefined();
    expect(out.to).toBe('0x' + '22'.repeat(20));
    expect(out.nonce).toBe('0x7');
  });
});

describe('detectOffPhylax', () => {
  it('reports on-phylax when the preflight succeeds', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => '0x5208');
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.status).toBe('on-phylax');
    expect(result.offPhylax).toBe(false);
  });

  it('never sends a gas field in the preflight', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => '0x1');
    await detectOffPhylax({ provider, transaction: tx, config });
    const params = provider.callsTo('eth_estimateGas')[0]!.params;
    const sent = (params as [Record<string, unknown>])[0];
    expect(sent.gas).toBeUndefined();
    expect(sent.gasLimit).toBeUndefined();
  });

  it('reports off-phylax for the credible-require revert', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed');
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.status).toBe('off-phylax');
    expect(result.offPhylax).toBe(true);
    expect(result.revertReason).toBe('assertion failed');
  });

  it('does not branch on the numeric code (works with -32000 etc.)', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed', -32000);
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.offPhylax).toBe(true);
  });

  it('treats a non-credible Error(string) as a genuine revert, not a routing issue', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('ERC20: transfer amount exceeds balance');
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.status).toBe('reverted');
    expect(result.offPhylax).toBe(false);
    expect(result.revertReason).toContain('ERC20');
  });

  it('is inconclusive when no revert data can be decoded', async () => {
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw new Error('fetch failed: ECONNRESET');
    });
    const result = await detectOffPhylax({ provider, transaction: tx, config });
    expect(result.status).toBe('inconclusive');
  });

  it('honours a custom credibleRevertMatch', async () => {
    const strict = resolveConfig({
      rpcUrl: config.rpcUrl,
      credibleRevertMatch: /CL: not in credible block/,
    });
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('CL: not in credible block');
    });
    expect((await detectOffPhylax({ provider, transaction: tx, config: strict })).offPhylax).toBe(true);

    const provider2 = new MockProvider().setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed');
    });
    // The default phrase should not match the strict pattern.
    expect((await detectOffPhylax({ provider: provider2, transaction: tx, config: strict })).status).toBe('reverted');
  });

  it('auto-resolves `from` via silent eth_accounts when the tx omits it', async () => {
    const account = '0x' + '33'.repeat(20);
    const provider = new MockProvider()
      .setHandlers('eth_accounts', () => [account])
      .setHandlers('eth_estimateGas', () => '0x5208');
    const noFrom: LooseTransactionRequest = { to: '0x' + '22'.repeat(20), value: 1n };

    const result = await detectOffPhylax({ provider, transaction: noFrom, config });

    expect(result.status).toBe('on-phylax');
    // Never prompts: only the silent accounts read, never eth_requestAccounts.
    expect(provider.callsTo('eth_requestAccounts')).toHaveLength(0);
    const sent = (provider.callsTo('eth_estimateGas')[0]!.params as [Record<string, unknown>])[0];
    expect(sent.from).toBe(account);
    expect(sent.value).toBe('0x1');
  });

  it('treats a null `from` as absent and resolves via silent eth_accounts', async () => {
    const account = '0x' + '55'.repeat(20);
    const provider = new MockProvider()
      .setHandlers('eth_accounts', () => [account])
      .setHandlers('eth_estimateGas', () => '0x5208');
    const result = await detectOffPhylax({
      provider,
      transaction: { from: null, to: '0x' + '22'.repeat(20) },
      config,
    });
    expect(result.status).toBe('on-phylax');
    const sent = (provider.callsTo('eth_estimateGas')[0]!.params as [Record<string, unknown>])[0];
    expect(sent.from).toBe(account);
  });

  it('prefers the explicit `account` option over eth_accounts', async () => {
    const account = '0x' + '44'.repeat(20);
    const provider = new MockProvider().setHandlers('eth_estimateGas', () => '0x5208');
    await detectOffPhylax({ provider, transaction: { to: '0x0' }, account, config });
    const sent = (provider.callsTo('eth_estimateGas')[0]!.params as [Record<string, unknown>])[0];
    expect(sent.from).toBe(account);
    expect(provider.callsTo('eth_accounts')).toHaveLength(0);
  });

  it('is inconclusive (not thrown) when no sender can be resolved', async () => {
    const provider = new MockProvider().setHandlers('eth_accounts', () => []);
    const result = await detectOffPhylax({ provider, transaction: { to: '0x0' }, config });
    expect(result.status).toBe('inconclusive');
    expect((result.error as Error).message).toMatch(/no `from`/);
    expect(provider.callsTo('eth_estimateGas')).toHaveLength(0);
  });
});
