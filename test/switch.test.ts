import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config';
import { attemptSwitch } from '../src/switch';
import { classifyWallet } from '../src/wallets';
import { WALLET_RDNS } from '../src/constants';
import type { TransactionRequest, WalletClassification } from '../src/types';
import {
  assertOutcome,
  errorStringRevert,
  firstArg,
  MockProvider,
  userRejection,
} from './helpers';

const config = resolveConfig({ rpcUrl: 'https://rpc.phylax.example' });
const tx: TransactionRequest = { from: '0x' + '11'.repeat(20), to: '0x' + '22'.repeat(20) };
const TRUE_WORD = '0x' + '0'.repeat(63) + '1';
const FALSE_WORD = '0x' + '0'.repeat(64);

const zerionExt: WalletClassification = classifyWallet({
  rdns: WALLET_RDNS.zerion,
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
});
const mmExt: WalletClassification = classifyWallet({
  rdns: WALLET_RDNS.metamask,
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
});

/** Provider on mainnet whose routing signal reads the given words across successive calls. */
function routingProvider(...callWords: string[]): MockProvider {
  return new MockProvider()
    .setHandlers('eth_chainId', () => '0x1')
    .setHandlers('eth_call', ...callWords.map((word) => () => word))
    .setHandlers('wallet_addEthereumChain', () => null)
    .setHandlers('wallet_switchEthereumChain', () => null);
}

describe('attemptSwitch', () => {
  it('short-circuits to manual fallback for non-allowlisted wallets', async () => {
    const provider = new MockProvider();
    const result = await attemptSwitch({ provider, wallet: mmExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('unsupported');
    expect(result.manualFallback).toBe(true);
    expect(provider.callsTo('wallet_addEthereumChain')).toHaveLength(0);
    expect(provider.callsTo('wallet_switchEthereumChain')).toHaveLength(0);
  });

  it('skips onboarding when the wallet is already routed through Phylax', async () => {
    const provider = routingProvider(TRUE_WORD);
    const result = await attemptSwitch({ provider, wallet: mmExt, config });

    expect(result).toMatchObject({
      outcome: 'activated',
      added: false,
      switched: false,
      manualFallback: false,
    });
    expect(provider.callsTo('wallet_addEthereumChain')).toHaveLength(0);
  });

  it('does not mutate wallet state when the initial routing probe is inconclusive', async () => {
    // No eth_chainId handler → the probe throws → inconclusive; must not add/switch.
    const provider = new MockProvider()
      .setHandlers('wallet_addEthereumChain', () => null)
      .setHandlers('wallet_switchEthereumChain', () => null);
    const result = await attemptSwitch({ provider, wallet: zerionExt, config });

    assertOutcome(result, 'unverified');
    expect(result.added).toBe(false);
    expect(result.switched).toBe(false);
    expect(provider.callsTo('wallet_addEthereumChain')).toHaveLength(0);
    expect(provider.callsTo('wallet_switchEthereumChain')).toHaveLength(0);
  });

  it('uses the routing check to verify activation without a transaction', async () => {
    const provider = routingProvider(FALSE_WORD, TRUE_WORD);
    const result = await attemptSwitch({ provider, wallet: zerionExt, config });

    expect(result.outcome).toBe('activated');
    expect(result.manualFallback).toBe(false);
  });

  it('activates when the compatibility probe shows an off→on transition', async () => {
    const provider = routingProvider(FALSE_WORD).setHandlers(
      'eth_estimateGas',
      () => {
        throw errorStringRevert('assertion failed'); // baseline: off-Phylax (probe is protected)
      },
      () => '0x5208', // post-switch: preflight passes → on-Phylax
    );
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('activated');
    expect(result.added).toBe(true);
    expect(result.switched).toBe(true);
    expect(result.manualFallback).toBe(false);
  });

  it('uses the compatibility probe when the routing signal is unavailable', async () => {
    const nonMainnetConfig = resolveConfig({
      rpcUrl: 'https://rpc.phylax.example',
      chainId: 10,
    });
    const provider = new MockProvider()
      .setHandlers('eth_chainId', () => '0xa')
      .setHandlers(
        'eth_estimateGas',
        () => {
          throw errorStringRevert('assertion failed');
        },
        () => '0x5208',
      )
      .setHandlers('wallet_addEthereumChain', () => null)
      .setHandlers('wallet_switchEthereumChain', () => null);

    const result = await attemptSwitch({
      provider,
      wallet: zerionExt,
      config: nonMainnetConfig,
      verifyTransaction: tx,
    });

    expect(result.outcome).toBe('activated');
    expect(result.added).toBe(true);
    expect(result.switched).toBe(true);
  });

  it('does NOT confirm activation from a bare preflight success (probe not proven protected)', async () => {
    // Preflight passes both before and after — the probe never demonstrated protection, so
    // its success is ambiguous and must not be reported as activation.
    const provider = routingProvider(FALSE_WORD).setHandlers('eth_estimateGas', () => '0x5208');
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    assertOutcome(result, 'unverified');
    expect(result.manualFallback).toBe(true);
  });

  it('uses raw EIP-3085 add with chainId 0x1 and the Phylax rpcUrl', async () => {
    const provider = routingProvider(FALSE_WORD);
    await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    const added = firstArg(provider.callsTo('wallet_addEthereumChain')[0]);
    expect(added.chainId).toBe('0x1');
    expect(added.rpcUrls).toEqual(['https://rpc.phylax.example']);
  });

  it('falls back to manual when the wallet accepts-then-ignores the URL', async () => {
    // The probe keeps reverting off-Phylax before and after — never activated.
    const provider = routingProvider(FALSE_WORD).setHandlers('eth_estimateGas', () => {
      throw errorStringRevert('assertion failed');
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    assertOutcome(result, 'unverified');
    expect(result.manualFallback).toBe(true);
    expect(result.verification?.offPhylax).toBe(true);
  });

  it('returns rejected when the user declines the add', async () => {
    const provider = routingProvider(FALSE_WORD).setHandlers('wallet_addEthereumChain', () => {
      throw userRejection();
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('rejected');
  });

  it('recognises a user rejection wrapped under `cause`', async () => {
    const provider = routingProvider(FALSE_WORD).setHandlers('wallet_addEthereumChain', () => {
      throw { message: 'request failed', cause: { code: 4001 } };
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('rejected');
    expect(provider.callsTo('wallet_switchEthereumChain')).toHaveLength(0);
  });

  it('returns failed when the switch errors for a non-rejection reason', async () => {
    const provider = routingProvider(FALSE_WORD).setHandlers('wallet_switchEthereumChain', () => {
      throw new Error('internal error');
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config, verifyTransaction: tx });
    expect(result.outcome).toBe('failed');
    expect(result.manualFallback).toBe(true);
  });

  it('tolerates a recognised already-added chain and proceeds to switch', async () => {
    const provider = routingProvider(FALSE_WORD, TRUE_WORD).setHandlers(
      'wallet_addEthereumChain',
      () => {
        throw new Error('chain already added');
      },
    );
    const result = await attemptSwitch({ provider, wallet: zerionExt, config });
    expect(result.outcome).toBe('activated');
    expect(result.added).toBe(false);
    expect(result.switched).toBe(true);
  });

  it('preserves an unrecognised add error instead of swallowing it', async () => {
    const provider = routingProvider(FALSE_WORD).setHandlers('wallet_addEthereumChain', () => {
      throw new Error('invalid rpc endpoint');
    });
    const result = await attemptSwitch({ provider, wallet: zerionExt, config });
    assertOutcome(result, 'unverified');
    expect(result.added).toBe(false);
    expect(result.switched).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    if (result.error instanceof Error) expect(result.error.message).toMatch(/invalid rpc/);
  });

  it('cannot confirm activation when routing stays negative and no probe exists', async () => {
    const provider = routingProvider(FALSE_WORD, FALSE_WORD);
    const result = await attemptSwitch({ provider, wallet: zerionExt, config });
    expect(result.outcome).toBe('unverified');
    expect(result.manualFallback).toBe(true);
  });

  it('honours force for non-allowlisted wallets', async () => {
    const provider = routingProvider(FALSE_WORD, TRUE_WORD);
    const result = await attemptSwitch({ provider, wallet: mmExt, config, force: true });
    expect(result.outcome).toBe('activated');
  });
});
