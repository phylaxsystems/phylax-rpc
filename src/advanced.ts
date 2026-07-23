/**
 * Advanced / low-level building blocks, deliberately kept off the root entry so the
 * primary API surface (`@phylaxsystems/phylax-rpc`) stays small and its SemVer contract
 * narrow. Import these only when wiring custom flows:
 *
 * ```ts
 * import { extractRevertData, decodeErrorString } from '@phylaxsystems/phylax-rpc/advanced';
 * ```
 */

export { ERROR_STRING_SELECTOR, PANIC_SELECTOR } from './constants';

export { decodeErrorString, isErrorStringRevert } from './abi';

export {
  getSelector,
  hexToUtf8,
  isNumeric,
  normalizeHex,
  toHexChainId,
  toHexQuantity,
} from './hex';

export {
  collectHexStrings,
  extractRevertData,
  isUserRejection,
  request,
} from './eip1193';

export { checkPhylaxRouting, type RoutingCheck } from './connection';

export { buildPreflightParams, normalizeTransaction } from './detect';

export { buildAddChainParams, manualInstructions, resolveConfig } from './config';

export {
  asAddress,
  asChainId,
  asHex,
  asHexQuantity,
  asMilliseconds,
  asRpcUrl,
  asWalletRdns,
  isAddress,
  isChainId,
  isHex,
  isHexQuantity,
  isUuid,
  isWalletRdns,
  toHex,
} from './brands';
