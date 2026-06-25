import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { attemptSwitch } from '../src/switch';
import { classifyWallet } from '../src/wallets';
import { WALLET_RDNS } from '../src/constants';
import type { TransactionRequest, WalletClassification } from '../src/types';
import { errorStringRevert, MockProvider, userRejection } from './helpers';

const config = resolveConfig({ rpcUrl: 'https://rpc.phylax.example' });
const tx: TransactionRequest = { from: '0x' + '11'.repeat(20), to: '0x' + '22'.repeat(20) };

const zerionExt: WalletClassification = classifyWallet({
  rdns: WALLET_RDNS.zerion,
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
});
const mmExt: WalletClassification = classifyWallet({
  rdns: WALLET_RDNS.metamask,
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
});

function assistedProvider(verifyBehaviour: () => unknown): MockProvider {
  return new MockProvider()
    .setHandlers('wallet_addEthereumChain', () => null)
    .setHandlers('wallet_switchEthereumChain', () => null)
    .setHandlers('eth_estimateGas', verifyBehaviour);
}

describe('attemptSwitch', () => {
  it('short-circuits to manual fallback for non-allowlisted wallets', async () => {
    const provider = new MockProvider();
    const result = await attemptSwitch({ provider, wallet: mmExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('unsupported');
    expect(result.manualFallback).toBe(true);
    expect(provider.calls).toHaveLength(0); // no requests issued
  });

  it('activates when the verify probe confirms the RPC is live', async () => {
    const provider = assistedProvider(() => '0x5208'); // preflight now passes
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('activated');
    expect(result.added).toBe(true);
    expect(result.switched).toBe(true);
    expect(result.manualFallback).toBe(false);
  });

  it('uses raw EIP-3085 add with chainId 0x1 and the Phylax rpcUrl', async () => {
    const provider = assistedProvider(() => '0x1');
    await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    const params = provider.callsTo('wallet_addEthereumChain')[0]!.params;
    const added = (params as [Record<string, unknown>])[0];
    expect(added.chainId).toBe('0x1');
    expect(added.rpcUrls).toEqual(['https://rpc.phylax.example']);
  });

  it('falls back to manual when the wallet accepts-then-ignores the URL', async () => {
    // Verify probe still reverts with the credible-require => not actually activated.
    const provider = assistedProvider(() => {
      throw errorStringRevert('assertion failed');
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('unverified');
    expect(result.manualFallback).toBe(true);
    expect(result.verification?.offPhylax).toBe(true);
  });

  it('returns rejected when the user declines the add', async () => {
    const provider = new MockProvider().setHandlers('wallet_addEthereumChain', () => {
      throw userRejection();
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('rejected');
  });

  it('returns failed when the switch errors for a non-rejection reason', async () => {
    const provider = new MockProvider()
      .setHandlers('wallet_addEthereumChain', () => null)
      .setHandlers('wallet_switchEthereumChain', () => {
        throw new Error('internal error');
      });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('failed');
    expect(result.manualFallback).toBe(true);
  });

  it('tolerates a non-rejection add failure (chain already added) and proceeds', async () => {
    const provider = new MockProvider()
      .setHandlers('wallet_addEthereumChain', () => {
        throw new Error('chain already added');
      })
      .setHandlers('wallet_switchEthereumChain', () => null)
      .setHandlers('eth_estimateGas', () => '0x1');
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('activated');
    expect(result.added).toBe(false);
    expect(result.switched).toBe(true);
  });

  it('cannot confirm activation without a verify transaction', async () => {
    const provider = new MockProvider()
      .setHandlers('wallet_addEthereumChain', () => null)
      .setHandlers('wallet_switchEthereumChain', () => null);
    const result = await attemptSwitch({ provider, wallet: zerionExt, config });
    expect(result.outcome).toBe('unverified');
    expect(result.manualFallback).toBe(true);
  });

  it('honours force for non-allowlisted wallets', async () => {
    const provider = assistedProvider(() => '0x1');
    const result = await attemptSwitch({ provider, wallet: mmExt, config, verifyTransaction: tx, force: true });
    expect(result.outcome).toBe('activated');
  });
});
