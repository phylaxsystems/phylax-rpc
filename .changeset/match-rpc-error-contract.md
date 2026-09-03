---
'@phylax-systems/phylax-rpc': minor
---

Recognise assertion rejections as verdicts rather than a routing signal. The default revert
matcher also matched the Credible RPC's own rejection wording, so a transaction an assertion
refused was classified `off-phylax` and the SDK offered a switch to the network the caller had
already reached. Rejections now classify as `reverted`, and `assertionRejection` carries the
assertion ids the RPC named plus a count of any beyond the ten it names.

Error recognition moved into `src/errors` behind one classifier with an explicit precedence:
EIP-1193 codes, then ABI revert data, then the messages the RPC documents, then node wording.
An `inconclusive` result now carries `reason` and `retryable`, so a transient gate condition is
distinguishable from an underfunded sender, and the transient ones are retried automatically —
three attempts with jittered backoff, overridable per call. Assertion ids are a branded type.
