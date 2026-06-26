# Integrating the Credible Layer into Safes — Recommendation (ENG-3612)

Status: research deliverable · 2026-06-25 · answers ENG-3612 Q1–Q5. External claims drawn from Safe and Zodiac source; direction follows internal Credible Layer / Phylax-for-Safes docs.

**Scope.** A *credible block* is one built by a participating builder running the Credible Layer (Titan on Ethereum L1). This spike covers only the on-chain plumbing that lets a Safe detect whether the current block is credible and gate its own transactions on that, on mainnet. What a credible block *does* once you're in it, and how those checks are authored, are out of scope.

---

## TL;DR

The mechanism is an on-chain `CredibleRegistry`: a credible builder calls `markCredible()` as the first tx of the block, and later txs in the same block read the registry to gate on it — that registry is the whole integration surface (specced internally, not yet in public Phylax repos, so nothing ships until it does). The integration is a single thin credible-block gate guard on `execTransaction`, fail-open after a staleness window T (auto-rearms when credible blocks resume); the timeout *is* the liveness mechanism, self-healing a credible-builder outage of any duration with no human action. The guard exempts owner-management / guard-removal from gating, so `setGuard(address(0))` is always reachable via a normal `execTransaction` and the guard can't brick the Safe — no extra module required. This separates safety from liveness: *exclusion* ("only credible blocks") is enforceable on-chain but fail-open, while *inclusion* ("actually landing in a credible block") can never be guaranteed in-contract and depends on private orderflow reaching a credible builder — solved off-chain by the same `phylax-rpc` routing this repo uses for EOAs. In Safe{Wallet} the executing owner's wallet — not the dApp — broadcasts `execTransaction`, so credible routing is a wallet-RPC problem (the `rpc-switch` detect/assist/manual flow), not a Safe-UI one; a relayer we control is the only way to guarantee it. Write the gate guard bespoke and minimal (no Zodiac primitive does credible-block gating); a Zodiac Delay module is optional hardening for the highest-value Safes only, covering the narrow case of a guard so buggy even its own exemption reverts. Target Safe 1.5.0 (its Module Guard extends gating to the module path), floor 1.4.1, where we control deployment.

---

## 1. The mechanism

The Safe's guard can read, on-chain and in the same block, whether the current block is being built by a credible builder.

Per the internal Credible Layer spec:

- **Marker** — participating builders call `CredibleRegistry.markCredible()` at the top of the block (first tx), updating state later txs in the same block can read.
- **Gating** — the protocol adds a guard to critical entrypoints that reverts unless the current block is credible (optionally, recently marked). This forces meaningful interactions onto credible blocks.
- **Escape hatch** — if no credible block has appeared in the last T seconds / N blocks, the guard fails open, trading safety for liveness during outages.
- **Private orderflow** — route txs through a private RPC to participating builders so users don't hit non-credible blocks. This is exactly what `phylax-rpc` already does for EOAs.

A non-credible builder never writes the marker, so the read returns "not credible" and the gate reverts. The marker turns "which builder is producing this block" into a value a contract can branch on in the same block.

A Safe is just another on-chain account, so this gating modifier goes on the Safe's transaction path as a **transaction guard**. The hard parts are Safe-specific: self-bricking, the module bypass, and the break-glass contract.

**The gate is fail-open with a grace period.** Credible block → allow. Non-credible block → revert, unless no credible block has appeared for window T, in which case allow all. In steady state a non-credible block rejects the tx (which then routes into a credible block via private orderflow); during a sustained outage the gate opens, trading the guarantee for liveness.

---

## 2. What "integrate the Credible Layer into a Safe" means

Concretely: a **transaction guard** on the Safe's `execTransaction` that reads `CredibleRegistry` and reverts when the current block isn't credible. That guard is the integration — everything below (self-bricking, the module bypass, break-glass, versions, UI) is a consequence of putting it on the transaction path.

**Keep the gate thin.** A guard is deny-only, runs after signatures, sees only the Safe's own calldata, is a single point of trust, and can brick the Safe. So the gate does exactly one thing — read the registry and gate — with no policy logic of its own. A thin guard with a single external dependency is auditable and far less likely to brick. Effect-level policy belongs to the Credible Layer, not the guard.

---

## 3. Inclusion guarantee and Safe versions

### 3.1 You can't guarantee inclusion — and don't need to

The contract can't force any builder to include a tx. It *can* refuse to execute unless the block is credible.

| Property | Who guarantees it | Mechanism |
|---|---|---|
| **Exclusion** — refuse to execute in a non-credible block (safety) | The Safe contract, on-chain | gate reads `CredibleRegistry`, reverts if not credible — except it fails open after staleness T |
| **Inclusion** — actually land in a credible block (liveness) | Nobody in-contract; best-effort off-chain | private orderflow (Phylax RPC) → credible builder; fail-open preserves liveness when that fails |

So "we cannot guarantee inclusion" is correct and fine: the gate enforces exclusion in steady state, and inclusion is treated as a liveness/UX problem. On mainnet only a subset of builders are credible (App-Specific Sequencing), so inclusion depends on private orderflow reaching a credible builder. Titan is the intended L1 credible builder, but it's named only in internal sources — public docs don't mention it and `rpc.phylax.systems` doesn't currently resolve, so treat it as **planned**, not shipped.

### 3.2 Safe versions

From `safe-smart-account` source/CHANGELOG and `safe-deployments`:

- **1.3.0** — Transaction Guard introduced. No ERC-165 check on `setGuard` (easier to brick), no module guard. Widest-deployed baseline.
- **1.4.1** — Same single-guard model; adds ERC-165 `supportsInterface(Guard)` validation on `setGuard` (error `GS300`, present since 1.4.0). Current default for new Safes. No module guard.
- **1.5.0** — Renames `Guard` → `ITransactionGuard`; adds the **Module Guard** (`setModuleGuard` / `IModuleGuard`, error `GS301`), closing the module-path bypass. Released mid-2025, audited by Ackee. Canonical singleton `0xFf51A5898e281Db6DfC7855790607438dF2ca44b` deployed on mainnet.

**Recommendation: floor 1.4.1** (ERC-165 brick protection, widely deployed), **target 1.5.0** wherever we control the version, since only 1.5.0 extends credible-gating to the module path. For pre-1.5.0 Safes, document that any enabled module bypasses the transaction guard.

---

## 4. The guard: design, self-bricking, 1.5.0

*(Before liveness because the break-glass design depends on these mechanics.)*

### 4.1 The gate guard

`execTransaction` calls `guard.checkTransaction(...)` after `checkSignatures` and before `execute`, then `guard.checkAfterExecution(txHash, success)` at the end; a revert in either aborts the tx. The gate does only credible-block gating, no policy logic:

```
checkTransaction(...):
  if isOwnerManagementOrGuardRemoval(to, data):   # always allow the escape
      return
  if CredibleRegistry.isCredible(block.number):    # marker written by top-of-block tx
      return
  if block.timestamp - CredibleRegistry.lastCredibleAt() > STALENESS_WINDOW:
      return                                        # FAIL-OPEN: no credible block for T → allow all
  revert NotCredibleBlock();                        # else reject → tx routes into a credible block
```

Small, auditable, one external dependency (`CredibleRegistry`). A dead or buggy registry is a brick source; the staleness fail-open is the mitigation.

### 4.2 Self-bricking and the un-brick path

Owner-management (`addOwner` / `removeOwner` / `changeThreshold` / `setGuard` / `enableModule`) is `SelfAuthorized` — it can only run as a self-directed `execTransaction`, so it's gated by the current guard. That's the root of the self-bricking risk: `setGuard(address(0))` routes through `execTransaction` too, so a guard that wrongly reverts also reverts its own removal → permanent brick. The Safe{Wallet} UI warns that an incompatible guard bricks the Safe and freezes all funds.

The baseline mitigation is **in-guard, no extra module:** the gate never gates owner-management or guard-removal (the early-return above). Gating funds-moving calls is the point; gating `setGuard` / `removeOwner` buys nothing and risks everything. With that exemption, owners can always remove the guard via a normal `execTransaction` (still behind the full signature threshold), so a credible-gate logic bug on the funds path can't brick the Safe — and neither can an outage (fail-open). This is what keeps the integration a drop-in.

The one case this doesn't cover is a guard so buggy that the exemption path itself reverts (e.g. an unconditional revert before the early-return, or a broken `checkAfterExecution`). For that narrow residual, see the optional break-glass module below. The ERC-165 `GS300` check (1.4.0+) is orthogonal — it prevents only the trivial brick (slot pointed at an EOA / non-conforming contract), not an overstrict but conforming guard.

### 4.3 The module path and Safe 1.5.0

`execTransactionFromModule` requires only that `msg.sender` is an enabled module (`GS104`) — no threshold, and (pre-1.5.0) no guard — so a module can act when `execTransaction` is gated. That bypass is what the optional break-glass module relies on, and what Safe 1.5.0 can close.

The ERC-165 check on `setGuard` (`GS300`) is not new in 1.5.0 — it landed in 1.4.0. What 1.5.0 changed: renamed `Guard` → `ITransactionGuard`, and added the **Module Guard** (`setModuleGuard`, `IModuleGuard`, `checkModuleTransaction` / `checkAfterModuleExecution`, `GS301`) that gates the module path. The catch for break-glass: if we add a module guard (e.g. to gate the module path on Safes that run modules), it must exempt any break-glass module in use or we reintroduce the brick. Pin the version and make this explicit in the runbook.

---

## 5. Liveness (and optional break-glass)

The choice — fail-open guard vs emergency module + timelock — is decided: **the gate is fail-open** (read the registry; if no credible block for staleness T, allow all). That alone is the liveness mechanism and the baseline integration. A break-glass module is not required and is offered only as optional hardening.

### 5.1 The decided design

The gate's logic: credible → allow; non-credible → allow only once no credible block has appeared for window T; auto-rearm when credible blocks resume. This timeout is the liveness mechanism — it self-heals a credible-builder outage of any duration, no human action, no separate module. In normal operation a non-credible block rejects the tx, which then routes into a credible block via the `rpc-switch` path.

**Accepted tradeoff:** once past T the gate opens and the credible guarantee lapses for that window — a bypass window is an attack window. Note that when credible builders are genuinely down, no block is credible anyway; fail-open only decides whether the Safe stays *usable*. The sharp residual risk is an attacker who can grief/DoS the credible builders for longer than T, forcing the gate open, then attacking in the unprotected window. Mitigations: tune T (long enough that brief hiccups don't open the gate, short enough that real outages don't freeze ops), monitor credible-block liveness, and for the highest-value Safes consider the fail-closed alternative.

### 5.2 Optional hardening: a break-glass module

A correct fail-open gate can't brick the Safe (it opens after T), and the owner-management exemption covers a logic bug on the funds path. The only brick a thin guard can't self-heal is one where the exemption path itself reverts. A break-glass module buys that case back.

- **What:** a dedicated Zodiac Delay Modifier, enabled as a module on the Safe, owned by the Safe. `execTransactionFromModule` bypasses the transaction guard, so it works even when the gate is stuck.
- **Role:** queue `setGuard(address(0))` / owner-recovery and execute after a cooldown. Not for outages (fail-open handles those) — purely the un-brick path for a severe guard bug, plus optionally a scoped emergency-action path.
- **Timelock:** 24–72h `txCooldown`; optional `txExpiration`. After cooldown `executeNextTx` is permissionless; the Safe can veto via `setTxNonce` (`skipExpired` clears expired entries) for the whole window — so a compromised emergency signer's queued action is public and cancellable.
- **1.5.0:** any Module Guard must exempt this module.

**Cost:** this is not drop-in — it adds a module to a Safe that may already run its own, needs governance to enable, and widens the module-path bypass surface. So it's opt-in: recommend it for the highest-value Safes, skip it elsewhere. The guard alone (with its exemption) is the default integration.

### 5.3 The fail-closed alternative

For a maximally-paranoid, ultra-high-value Safe, invert the default: **fail-closed with no automatic open**, where the only way to act under a non-credible regime is a timelocked, human-initiated bypass through the Delay module. This never lapses the guarantee automatically and removes the grief-to-open attack — at the cost of freezing routine ops during any outage until someone runs the timelock. **Default: fail-open** (matches the registry design); offer fail-closed as a per-Safe opt-in for the most sensitive accounts.

---

## 6. Prior art: Zodiac

**Write the gate guard bespoke. If a break-glass module is adopted (optional), build it on Zodiac.**

### 6.1 Zodiac Delay Modifier for break-glass

`contract Delay is Modifier` — a queue-now/execute-after-delay timelock:

- `execTransactionFromModule` enqueues (stores `keccak256(to,value,data,operation)` + timestamp), increments `queueNonce` — it does not execute.
- `executeNextTx(...)` is permissionless, enforces `block.timestamp - createdAt >= txCooldown` (and `<= txCooldown + txExpiration` if set), strictly FIFO (`txNonce`).
- Config: `setTxCooldown`, `setTxExpiration` (`onlyOwner`); cancel via `setTxNonce`; clear expired via `skipExpired`.
- Audited by G0 Group (Sep 2021); Zodiac base re-audited (Feb 2023); actively maintained.
- Use a **dedicated Delay instance** for break-glass — FIFO head-of-line blocking means you don't want it sharing a queue. Modern Zodiac base uses transient storage (Cancun / `^0.8.24`); verify target-chain support.

### 6.2 Optionally front it with the Roles Modifier

Roles Modifier v2 (audited 2023; mirrors the Safe interface so it chains between a module and the Safe) scopes *what* an executor may call down to target → selector → parameter conditions (incl. allowances/rate-limits). Chain `emergency actor → Roles (scope) → Delay (timelock) → Safe` so only pre-approved payloads can enter the queue.

### 6.3 Why bespoke for the gate guard

No Zodiac primitive does credible-block gating (read registry + staleness + fail-open + owner-management exemption). It's a ~50-line guard; bespoke and minimal is lower-risk than bending a generic module to fit. Get it audited.

### 6.4 Other prior art (informative)

- **Ethena's shared Safe guard:** executor whitelist, `delegatecall` restricted to canonical MultiSend, blocks module enable/disable and fallback-handler changes, timelocks `setGuard`, allows emergency guard-disable only after a timelock with exact-match one-shot entries. Good reference for the **break-glass runbook** — but it's a fat policy guard, the opposite of the thin registry-only gate we want.
- **FailSafe GUARD** (co-signer pattern): a third-party security service acting as an additional on-chain signer that co-signs only after its policy passes. Confirms the co-signer mechanism, but it's a centralized risk engine — a different trust model from a builder-level credible-block guarantee, and not the recommended Phylax model.

---

## 7. Safe{Wallet} UI and the submission path

The Solidity change is invisible to signing and visible only at execution. Two facts drive everything here: the gate runs **only** at `execTransaction`, and **the connected wallet broadcasts that call — not the Safe dApp.**

### 7.1 Who broadcasts (and why the dApp RPC doesn't route)

In the default Safe{Wallet} flow an owner clicks Execute and *their wallet* (MetaMask etc.) confirms and broadcasts `execTransaction` through that wallet's own RPC. The dApp hands `eth_sendTransaction` to the injected wallet; it never broadcasts itself. So **changing the Safe dApp's RPC does not move execution into a credible block** — the dApp RPC governs reads (history, gas estimation, simulation), not the broadcast. The RPC that must be Phylax is the **executing owner's wallet RPC**, which is exactly what `phylax-rpc` targets. Same constraint as a plain EOA dApp: a dApp can't redirect where the signer broadcasts.

| Execution mode | Who broadcasts | Credible routing |
|---|---|---|
| Connected-wallet execute (default) | executing owner's wallet, via its RPC | only if that wallet is on Phylax → `rpc-switch` detect / assist / manual |
| Relayed execute (Gelato, gasless) | Safe's relayer | **bypassed** — the relayer owns orderflow unless it routes to Titan |

Only one owner — the executor — ever broadcasts. Co-signers' confirmations are off-chain EIP-712 signatures held in the Transaction Service, and the guard never runs at signing time. So routing is a single-actor problem, not an M-of-N one.

### 7.2 Externalities on the Safe app

- **Tenderly simulation false-fail (the main UX issue).** Safe{Wallet} previews every tx via Tenderly, which is not a credible block — so a credible-protected tx renders "this transaction will fail" even for a correctly-routed owner. The same false-negative `rpc-switch` already warns about for wallet confirm screens. Must be suppressed or annotated, or owners won't execute.
- **Gas estimation.** Estimated through the read RPC; if the gate reverts under a non-credible RPC, `estimateGas` fails and Execute errors before the wallet ever sees the tx.
- **Transaction Service is orthogonal.** It coordinates signatures and indexes events; it neither broadcasts nor affects routing. Self-hosting it matters only if we want to own the read + simulation surface — not for credible routing.

### 7.3 Which UI tier

No tier can force the executor's wallet onto Phylax — that's a wallet (or relayer) decision. The tier only decides where detection and the switch prompt live:

- **(a) Safe App (iframe)** — sandboxed; submission still goes through the parent's connected wallet. Can host the detect + manual-switch prompt; can't force routing or suppress the parent's simulation banner.
- **(b) Custom co-signer app against the Transaction Service** — same; the broadcast stays wallet-side.
- **(c) Fork Safe{Wallet}** — the only tier that can set Phylax as the default network, suppress the Tenderly false-fail, and embed `rpc-switch` detection — but still can't override the executor's wallet RPC.

**The one path that guarantees credible routing regardless of owner wallets is a relayer we control that submits to Titan** — it sidesteps the wallet-RPC problem entirely and is the Safe analogue of the inclusion guarantee above.

**Recommendation:** ship the `rpc-switch` detect → assist → manual flow inside a **Safe App (a)** first (lowest cost, no fork), treat the **Tenderly false-fail** as a required UX fix, and evaluate a **controlled relayer** as the only route to *guaranteed* inclusion for Safes whose owners won't manage their own wallet RPC.

---

## 8. Threat model

Models the integration's own threats — can the Safe be forced into or kept out of credible blocks, and can the gate brick it.

| Threat | Without integration | With recommended design |
|---|---|---|
| Tx routed around credible builders (core bypass) | Lands in a non-credible block; the Credible Layer never sees it | Gate reverts in non-credible blocks → the tx must route into a credible block |
| Module path bypasses the gate | Any enabled module bypasses the transaction guard | 1.5.0 Module Guard extends gating to the module path (exempting the emergency module) |
| Self-bricking (overstrict guard) | n/a | Owner-management exempt from gate → `setGuard(0)` always reachable via normal execTransaction |
| Credible-builder outage (benign) | n/a | Gate fails open after staleness T; auto-rearms — self-heals, no human action |
| **Griefing builders to force fail-open, then attack** | n/a | **Main accepted risk of fail-open** — mitigate with conservative T, liveness monitoring; fail-closed opt-in for the most sensitive Safes |
| Severe guard bug — even the exemption path reverts | n/a | Not covered by the baseline guard; optional Delay module bypasses the guard and removes it after cooldown |
| Compromised emergency signer | n/a | Delay cooldown is public + Safe can `setTxNonce`-veto for the whole window |

---

## 9. Recommended architecture

```
                    ┌──────────────────── Safe (target 1.5.0; floor 1.4.1) ───────────────────┐
  owner sigs ──────▶│ execTransaction → checkSignatures → [Credible-Gate Guard] → execute      │
                    │                                       reads CredibleRegistry.isCredible() │
                    │                                       fail-OPEN if stale > T; exempt owner-mgmt
                    │                                       (owner-mgmt exemption = the un-brick path)
                    │                                                                            │
  ─ ─ optional ─ ─ ▶│ Zodiac Delay (module) ─enqueue─▶ [cooldown 24–72h] ─executeNextTx─▶ execTxFromModule (BYPASSES gate)
   high-value only  │   (optionally fronted by Roles for scope; Safe can veto via setTxNonce)   │
                    └────────────────────────────────────────────────────────────────────────────┘
   Submission: phylax-rpc / private orderflow routes execTransaction to the credible builder (Titan)
```

- **Ships when `CredibleRegistry` exists:** gate guard + private-orderflow routing (baseline); optional Delay module and 1.5.0 module guard for high-value Safes.
- **Until then:** only best-effort private-orderflow routing (the `rpc-switch` model) — it raises the odds of landing in a credible block but enforces nothing on-chain.

---

## 10. Open questions / verify before build

**Fail-open window T.** Decide T per Safe class and quantify the griefing risk (how cheaply can credible builders be starved?).
