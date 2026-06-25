import {
  type AddEthereumChainParameter,
  buildAddChainParams,
  manualInstructions,
  resolveConfig,
} from './config';
import { detectOffPhylax, type PreflightMethod } from './detect';
import { attemptSwitch } from './switch';
import { toWeb3OnboardChain, type Web3OnboardChain } from './web3onboard';
import {
  classifyDetail,
  classifyWallet,
  discoverProviders,
  type ClassifyInput,
  type DiscoverOptions,
} from './wallets';
import type {
  DetectionResult,
  Eip1193Provider,
  Eip6963ProviderDetail,
  ManualInstructions,
  PhylaxRpcConfig,
  ResolvedPhylaxRpcConfig,
  SwitchResult,
  TransactionRequest,
  WalletClassification,
} from './types';

export interface DetectArgs {
  provider: Eip1193Provider;
  transaction: TransactionRequest;
  method?: PreflightMethod;
}

export interface SwitchArgs {
  provider: Eip1193Provider;
  wallet: WalletClassification;
  verifyTransaction?: TransactionRequest;
  force?: boolean;
}

/**
 * Headless orchestrator for the Phylax RPC-switch flow.
 *
 * Bundles the three pieces from the spike — EIP-6963 wallet detection, credible-require
 * off-Phylax detection, and the assisted add/switch/verify path — behind one config.
 * Carries no UI; dApps render their own prompts and manual-add modal.
 */
export class PhylaxRpcSwitch {
  readonly config: ResolvedPhylaxRpcConfig;

  constructor(config: PhylaxRpcConfig) {
    this.config = resolveConfig(config);
  }

  /** Discover injected providers via EIP-6963. */
  discoverProviders(options?: DiscoverOptions): Promise<Eip6963ProviderDetail[]> {
    return discoverProviders(options);
  }

  /** Classify a wallet from `rdns`/provider flags. */
  classify(input: ClassifyInput): WalletClassification {
    return classifyWallet(input);
  }

  /** Classify an EIP-6963 announced provider detail. */
  classifyDetail(detail: Eip6963ProviderDetail, userAgent?: string): WalletClassification {
    return classifyDetail(detail, userAgent);
  }

  /** Run the preflight-as-detection probe to determine whether the user is off Phylax. */
  detect(args: DetectArgs): Promise<DetectionResult> {
    return detectOffPhylax({
      provider: args.provider,
      transaction: args.transaction,
      method: args.method,
      config: this.config,
    });
  }

  /** Attempt the assisted RPC switch (add → switch → mandatory verify probe). */
  switch(args: SwitchArgs): Promise<SwitchResult> {
    return attemptSwitch({
      provider: args.provider,
      wallet: args.wallet,
      verifyTransaction: args.verifyTransaction,
      force: args.force,
      config: this.config,
    });
  }

  /** EIP-3085 `wallet_addEthereumChain` params — for custom wiring or web3-onboard. */
  addChainParams(): AddEthereumChainParameter {
    return buildAddChainParams(this.config);
  }

  /** Copy-paste fields for a manual-add modal. */
  manualInstructions(): ManualInstructions {
    return manualInstructions(this.config);
  }

  /** A web3-onboard chain config wiring Phylax into `protectedRpcUrl`. */
  toWeb3OnboardChain(options?: { publicRpcUrl?: string; extra?: Record<string, unknown> }): Web3OnboardChain {
    return toWeb3OnboardChain(this.config, options);
  }
}
