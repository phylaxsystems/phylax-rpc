/**
 * Advanced / low-level building blocks, deliberately kept off the root entry so the
 * primary API surface (`@phylax-systems/phylax-rpc`) stays small and its SemVer contract
 * narrow. Import these only when wiring custom flows:
 *
 * ```ts
 * import { extractRevertData, decodeErrorString } from '@phylax-systems/phylax-rpc/advanced';
 * ```
 */

export { ERROR_STRING_SELECTOR, PANIC_SELECTOR } from './constants';

export { decodeErrorString, isErrorStringRevert } from './errors/revert';

export {
  classifyRpcError,
  CREDIBLE_GATE_PREFIX,
  isCredibleGateRevert,
  parseAssertionRejection,
} from './errors/rpc';

export {
  isTransient,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAYS,
  type Transient,
  retryDelay,
  shouldRetry,
  type RetryPolicy,
} from './errors/retry';

export {
  getSelector,
  hexToUtf8,
  isNumeric,
  normalizeHex,
  toHexChainId,
  toHexQuantity,
} from './hex';

export { request } from './eip1193';

export {
  collectErrorText,
  collectHexStrings,
  extractRevertData,
  isUserRejection,
} from './errors/provider';

export { checkPhylaxRouting, type RoutingCheck } from './connection';

export { buildPreflightParams, normalizeTransaction } from './detect';

export { buildAddChainParams, manualInstructions, resolveConfig } from './config';

export {
  asAddress,
  asAssertionId,
  asChainId,
  asHex,
  asHexQuantity,
  asMilliseconds,
  asRpcUrl,
  asWalletRdns,
  isAddress,
  isAssertionId,
  isChainId,
  isHex,
  isHexQuantity,
  isMilliseconds,
  isRpcUrl,
  isUuid,
  isWalletRdns,
  toHex,
} from './brands';
