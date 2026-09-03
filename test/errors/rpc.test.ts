import { describe, expect, it } from 'vitest';
import {
  classifyRpcError,
  isCredibleGateRevert,
  parseAssertionRejection,
} from '../../src/errors/rpc';
import { isTransient } from '../../src/errors/retry';
import { encodeErrorString, errorStringRevert, userRejection } from '../helpers';

const EVM = '0x' + 'ab'.repeat(32);
const OTHER = '0x' + 'cd'.repeat(32);

describe('isCredibleGateRevert', () => {
  it('recognises every refusal the gate writes', () => {
    expect(isCredibleGateRevert('credible layer: transaction rejected by an assertion')).toBe(true);
    expect(
      isCredibleGateRevert('credible layer: assertions are unavailable, try again shortly'),
    ).toBe(true);
  });

  it('ignores surrounding whitespace and case', () => {
    expect(isCredibleGateRevert('  Credible Layer: transaction rejected by an assertion ')).toBe(
      true,
    );
  });

  it('does not claim an ordinary contract revert', () => {
    expect(isCredibleGateRevert('ERC20: transfer amount exceeds balance')).toBe(false);
    // The off-Phylax signal is the protected contract's own require, not the gate's message.
    expect(isCredibleGateRevert('assertion failed')).toBe(false);
    expect(isCredibleGateRevert('CL: not in credible block')).toBe(false);
  });
});

describe('parseAssertionRejection', () => {
  it('reads a rejection that names no assertion', () => {
    expect(parseAssertionRejection('credible layer: transaction rejected by an assertion')).toEqual(
      { assertions: [], omitted: 0 },
    );
  });

  it('reads the singular', () => {
    expect(
      parseAssertionRejection(`credible layer: transaction rejected by assertion ${EVM}`),
    ).toEqual({ assertions: [EVM], omitted: 0 });
  });

  it('reads a list', () => {
    expect(
      parseAssertionRejection(
        `credible layer: transaction rejected by assertions ${EVM}, ${OTHER}, native:always_reject`,
      ),
    ).toEqual({ assertions: [EVM, OTHER, 'native:always_reject'], omitted: 0 });
  });

  it('reads how many assertions the gate left out', () => {
    expect(
      parseAssertionRejection(
        `credible layer: transaction rejected by assertions ${EVM}, ${OTHER}, and 1 more`,
      ),
    ).toEqual({ assertions: [EVM, OTHER], omitted: 1 });
    expect(
      parseAssertionRejection(
        `credible layer: transaction rejected by assertions ${EVM}, and 30 more`,
      ),
    ).toEqual({ assertions: [EVM], omitted: 30 });
  });

  it('reads a native-only rejection', () => {
    expect(
      parseAssertionRejection(
        'credible layer: transaction rejected by assertion native:always_reject',
      ),
    ).toEqual({ assertions: ['native:always_reject'], omitted: 0 });
  });

  // Absent metadata is recoverable; invented metadata is not. Each of these is still a gate
  // revert.
  it.each([
    ['a reason the gate did not write', 'ERC20: transfer amount exceeds balance'],
    ['another gate message', 'credible layer: assertions are unavailable, try again shortly'],
    ['unknown wording', 'credible layer: transaction refused by assertion ' + EVM],
    ['an id of the wrong width', 'credible layer: transaction rejected by assertion 0xabcd'],
    [
      'a count too large to be exact',
      `credible layer: transaction rejected by assertions ${EVM}, and 99999999999999999999 more`,
    ],
    [
      'the singular carrying a list',
      `credible layer: transaction rejected by assertion ${EVM}, ${OTHER}`,
    ],
  ])('returns nothing for %s', (_label, reason) => {
    expect(parseAssertionRejection(reason)).toBeUndefined();
  });

  it('leaves an unparsed gate revert recognisable', () => {
    const reason = 'credible layer: transaction refused by assertion ' + EVM;

    expect(parseAssertionRejection(reason)).toBeUndefined();
    expect(isCredibleGateRevert(reason)).toBe(true);
  });
});

const PANIC = '0x4e487b71' + '0'.repeat(63) + '1';

/** A provider error carrying only a message, the shape a node error arrives in. */
function nodeError(message: string, code = -32000): unknown {
  return Object.assign(new Error(message), { code });
}

describe('classifyRpcError', () => {
  // One case per condition the Credible RPC documents, so a condition the SDK stops handling
  // fails here rather than drifting out of the docs unnoticed.
  it.each([
    ['a user dismissal', userRejection(), 'user-rejected', false],
    [
      'an assertion rejection',
      errorStringRevert(`credible layer: transaction rejected by assertion ${EVM}`),
      'assertion-rejected',
      false,
    ],
    [
      'an ordinary contract revert',
      errorStringRevert('ERC20: transfer amount exceeds balance'),
      'reverted',
      false,
    ],
    [
      'assertions unavailable',
      nodeError('credible layer: assertions are unavailable, try again shortly', -32603),
      'assertions-unavailable',
      true,
    ],
    [
      'an unsupported gated request',
      nodeError(
        'credible layer: movePrecompileToAddress is unsupported by assertion-gated eth_simulateV1',
        -32602,
      ),
      'unsupported',
      false,
    ],
    [
      'an underfunded sender',
      nodeError('insufficient funds for gas * price + value'),
      'invalid-transaction',
      false,
    ],
    [
      // viem keys the same error on both wordings, and geth reports this one on send.
      'an underfunded sender in the alternate wording',
      nodeError('exceeds transaction sender account balance'),
      'invalid-transaction',
      false,
    ],
    ['a stale nonce', nodeError('nonce too low'), 'invalid-transaction', false],
    [
      'an underpriced transaction',
      nodeError('max fee per gas less than block base fee'),
      'invalid-transaction',
      false,
    ],
    ['a dropped connection', new Error('fetch failed: ECONNRESET'), 'transport', true],
    [
      'a disconnected provider',
      nodeError('The Provider is disconnected from all chains.', 4900),
      'transport',
      true,
    ],
    [
      'a provider disconnected from the requested chain',
      nodeError('The Provider is not connected to the requested chain.', 4901),
      'transport',
      true,
    ],
    ['a closed socket', new Error('The socket has been closed.'), 'transport', true],
    ['nothing recognisable', new Error('something went sideways'), 'unknown', false],
  ])('reads %s as %s', (_label, error, kind, retryable) => {
    const failure = classifyRpcError(error);

    expect(failure.kind).toBe(kind);
    expect(isTransient(failure)).toBe(retryable);
  });

  it('carries the assertions a rejection named', () => {
    const failure = classifyRpcError(
      errorStringRevert(`credible layer: transaction rejected by assertions ${EVM}, and 3 more`),
    );

    expect(failure).toMatchObject({
      kind: 'assertion-rejected',
      rejection: { assertions: [EVM], omitted: 3 },
    });
  });

  it('still reads an unparsable gate reason as a rejection', () => {
    const failure = classifyRpcError(
      errorStringRevert('credible layer: transaction refused by assertion 0xabcd'),
    );

    expect(failure.kind).toBe('assertion-rejected');
    expect(failure).not.toHaveProperty('rejection');
  });

  it('reads a Panic as a revert with no decodable reason', () => {
    const failure = classifyRpcError(
      Object.assign(new Error('execution reverted'), { data: PANIC }),
    );

    expect(failure.kind).toBe('reverted');
    expect(failure).not.toHaveProperty('reason');
  });

  it('finds the node wording a wallet wrapped', () => {
    const wrapped = Object.assign(new Error('Internal JSON-RPC error.'), {
      cause: { error: { message: 'insufficient funds for gas * price + value' } },
    });

    expect(classifyRpcError(wrapped).kind).toBe('invalid-transaction');
  });
});

// Precedence is the contract: a broad matcher above a specific one is how a gate verdict gets
// read as something else.
describe('classifyRpcError precedence', () => {
  it('ranks revert data above node wording', () => {
    const both = Object.assign(new Error('insufficient funds for gas * price + value'), {
      data: encodeErrorString(`credible layer: transaction rejected by assertion ${EVM}`),
    });

    expect(classifyRpcError(both).kind).toBe('assertion-rejected');
  });

  it('ranks a user dismissal above everything', () => {
    const dismissed = Object.assign(new Error('User rejected the request.'), {
      code: 4001,
      data: encodeErrorString('ERC20: transfer amount exceeds balance'),
    });

    expect(classifyRpcError(dismissed).kind).toBe('user-rejected');
  });

  it("ranks the gate's own messages above node wording", () => {
    const both = nodeError(
      'credible layer: assertions are unavailable, try again shortly (nonce too low)',
      -32603,
    );

    expect(classifyRpcError(both).kind).toBe('assertions-unavailable');
  });
});
