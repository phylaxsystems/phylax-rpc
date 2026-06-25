import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { buildPreflightParams, detectOffPhylax } from '../src/detect';
import type { TransactionRequest } from '../src/types';
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
});
