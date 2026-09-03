import { isAssertionId } from '../brands';
import type { AssertionRejection, Hex } from '../types';
import { collectErrorText, extractRevertData, isUserRejection } from './provider';
import { decodeErrorString, isErrorStringRevert } from './revert';

/**
 * What a failed provider request could be determined to be.
 *
 * Produced by `classifyRpcError`, which resolves the kinds in a fixed precedence: structural
 * evidence (ABI revert data, EIP-1193 codes) outranks the message constants the Credible RPC
 * documents, which outrank node wording, which outranks a transport guess.
 */
export type RpcFailure =
  /** EIP-1193 `4001`: the user dismissed the request. */
  | Readonly<{ kind: 'user-rejected' }>
  /** The Credible RPC's assertion gate refused the transaction. */
  | Readonly<{
      kind: 'assertion-rejected';
      reason: string;
      rejection?: AssertionRejection;
      data: Hex;
    }>
  /** An ordinary revert: a contract's own `Error(string)`, `Panic`, or custom error. */
  | Readonly<{ kind: 'reverted'; reason?: string; data: Hex }>
  /** The gate could not judge the request. Transient by construction. */
  | Readonly<{ kind: 'assertions-unavailable'; reason: string }>
  /** The request asks for something the assertion-gated path does not serve. */
  | Readonly<{ kind: 'unsupported'; reason: string }>
  /** The node will not execute the transaction as sent; the caller has to change it. */
  | Readonly<{ kind: 'invalid-transaction'; detail: string }>
  /** The request did not reach a node, or its answer did not come back. */
  | Readonly<{ kind: 'transport' }>
  /** Nothing recognisable. Never assumed retryable. */
  | Readonly<{ kind: 'unknown' }>;


/** Prefix the Credible RPC puts on every refusal its assertion gate produces. */
export const CREDIBLE_GATE_PREFIX = 'credible layer: ';

/** Opening the gate uses for a verdict, following {@link CREDIBLE_GATE_PREFIX}. */
const REJECTION_PREFIX = 'transaction rejected by ';
/** Subject used when the rejection attributes itself to no assertion. */
const UNNAMED = 'an assertion';
/** Subject introducing exactly one named assertion. */
const SINGULAR = 'assertion ';
/** Subject introducing a list of named assertions. */
const PLURAL = 'assertions ';
/** Closing `, and <n> more` the gate appends when it named fewer assertions than objected. */
const OMITTED_TAIL = /, and (\d+) more$/;

/**
 * Messages the Credible RPC owns and documents. Matching these reads a contract the node
 * publishes, which is why they rank above the node wording below.
 */
const GATE_UNAVAILABLE = /credible layer: assertions are unavailable/;
const GATE_UNSUPPORTED = /credible layer: \S+ is unsupported/;

/**
 * Node wording for a transaction the EVM will not run as sent. Mirrors the matchers viem keys
 * its node errors on, so a wallet surfacing reth's message is read the same way here.
 */
const INVALID_TRANSACTION = [
  /insufficient funds|exceeds transaction sender account balance/,
  /nonce too low/,
  /nonce too high/,
  /nonce has max value/,
  /intrinsic gas too low/,
  /intrinsic gas too high|gas limit reached/,
  /max fee per gas less than block base fee/,
  /max priority fee per gas higher than max fee per gas|tip higher than fee cap/,
  /transaction underpriced|fee cap less than block base fee/,
  /transaction type not valid/,
];

/** Wording for a request that never reached a node, or whose answer never came back. */
const TRANSPORT =
  /fetch failed|failed to fetch|network ?error|socket hang up|econnreset|econnrefused|etimedout|timed? ?out/;

/**
 * Whether a decoded revert reason came from the Credible RPC's assertion gate.
 *
 * Independent of the numeric JSON-RPC code, which gateways rewrite.
 */
export function isCredibleGateRevert(reason: string): boolean {
  return reason.trim().toLowerCase().startsWith(CREDIBLE_GATE_PREFIX);
}

/**
 * Read the assertions a gate rejection names, and how many it left out.
 *
 * Recognises the four shapes the RPC emits: an unnamed rejection, one named assertion, a list,
 * and a list closed by `, and <n> more`. Any other wording returns `undefined`;
 * {@link isCredibleGateRevert} still classifies the reason.
 */
export function parseAssertionRejection(reason: string): AssertionRejection | undefined {
  const trimmed = reason.trim();
  if (!isCredibleGateRevert(trimmed)) return undefined;

  const body = trimmed.slice(CREDIBLE_GATE_PREFIX.length);
  if (!body.startsWith(REJECTION_PREFIX)) return undefined;

  const subject = body.slice(REJECTION_PREFIX.length);
  if (subject === UNNAMED) return { assertions: [], omitted: 0 };

  const singular = subject.startsWith(SINGULAR);
  const plural = subject.startsWith(PLURAL);
  if (!singular && !plural) return undefined;
  const list = subject.slice(singular ? SINGULAR.length : PLURAL.length);

  const tail = OMITTED_TAIL.exec(list);
  const omitted = tail ? Number(tail[1]) : 0;
  if (!Number.isSafeInteger(omitted)) return undefined;

  const named = tail ? list.slice(0, tail.index) : list;
  const assertions: string[] = named.split(', ');
  if (!assertions.every(isAssertionId)) return undefined;
  // The RPC names one assertion in the singular and reserves the plural for the rest, so
  // either wording carrying the other's list is a grammar this parser does not know.
  if (singular && (assertions.length !== 1 || omitted > 0)) return undefined;

  return { assertions, omitted };
}

/**
 * Read a thrown provider error as one of the conditions the Credible RPC contract defines.
 *
 * Precedence is the point, and it runs highest-confidence first: an EIP-1193 code, then ABI
 * revert data, then the gate's own documented messages, then node wording, then a transport
 * guess. A broad matcher placed above a specific one is how a gate verdict gets read as
 * something else, so the order here is the contract and the tests pin it.
 */
export function classifyRpcError(error: unknown): RpcFailure {
  if (isUserRejection(error)) return { kind: 'user-rejected' };

  const data = extractRevertData(error);
  if (data) {
    const reason = isErrorStringRevert(data) ? decodeErrorString(data) : undefined;
    if (reason !== undefined && isCredibleGateRevert(reason)) {
      const rejection = parseAssertionRejection(reason);
      return {
        kind: 'assertion-rejected',
        reason,
        ...(rejection !== undefined ? { rejection } : {}),
        data,
      };
    }
    return { kind: 'reverted', ...(reason !== undefined ? { reason } : {}), data };
  }

  const text = collectErrorText(error);
  if (GATE_UNAVAILABLE.test(text)) return { kind: 'assertions-unavailable', reason: text };
  if (GATE_UNSUPPORTED.test(text)) return { kind: 'unsupported', reason: text };
  if (INVALID_TRANSACTION.some((wording) => wording.test(text))) {
    return { kind: 'invalid-transaction', detail: text };
  }
  if (TRANSPORT.test(text)) return { kind: 'transport' };

  return { kind: 'unknown' };
}
