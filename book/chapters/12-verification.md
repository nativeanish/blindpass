# 12 End-to-End Stress Testing & Formal Verification

No single test demonstrates unlinkability. The assurance case is layered:
reference vectors check wire compatibility, adversarial unit tests check
cryptographic rejection, PostgreSQL tests check atomicity, a state model checks
all small interleavings, stress tests search for runtime faults, and Playwright
checks the composed product. None replaces an independent security audit.

## 12.1 Model the redemption state machine

A small TLA+ specification separates the state-machine claim from TypeScript
and PostgreSQL syntax. `Reserve(t)` is one atomic action, matching the unique
insert. `Commit(t)` increments a success counter. `Rollback(t)` makes an
uncommitted credit available again.

{{blindpass-include:verification/BlindPass.tla}}

{{blindpass-include:verification/BlindPass.cfg}}

TLC enumerates all reachable interleavings for three tokens and checks that no
token obtains more than one committed success, a success is spent, reservation
requires issuance, and issuance requires payment.

Download a stable `tla2tools.jar` from the official
[TLA+ releases](https://github.com/tlaplus/tlaplus/releases), then run:

```bash
export TLA2TOOLS_JAR=/absolute/path/to/tla2tools.jar
java -jar "$TLA2TOOLS_JAR" -config verification/BlindPass.cfg verification/BlindPass.tla
```

This is bounded model checking of an abstract state machine, not a formal proof
of PostgreSQL, the TypeScript driver, or VOPRF security. Its value is exhaustive
interleaving exploration within the model. If the implementation stops making
reservation atomic, the model no longer describes it.

## 12.2 Stress real cryptography and PostgreSQL

{{blindpass-include:tests/stress.ts}}

Workers create genuine blind requests, issuer proofs, finalized tokens, and
PostgreSQL reservations. Each worker gets an isolated schema so token hashes
cannot collide across fixtures. Ten thousand cycles are a reliability gate,
not a statistical proof of cryptographic security.

```bash
pnpm test:stress
STRESS_TOKENS=100 pnpm test:stress
```

Use the smaller value during development. The default gate is intentionally
expensive and should run on known hardware in release verification.

## 12.3 Compose the HTTP lifecycle

{{blindpass-include:tests/integration.test.ts}}

The first integration test crosses invoice, payment, authorization, issuance,
proof finalization, and retry behavior. It proves that an unpaid invoice cannot
issue, confirmation states advance, the identical transcript is idempotent,
and a second batch is refused. The remaining cases cover duplicate scanner
events, reorg revocation, expiry, and capability secrecy.

The browser suite then drives real UI and IndexedDB:

{{blindpass-include:tests/e2e/app.spec.ts}}

```bash
pnpm test
pnpm build
pnpm test:e2e
```

## 12.4 Audit Alice and Bob honestly

The demo creates separate in-memory stores for Alice and Bob, buys identical
offers, issues under the same epoch configuration, shuffles redemptions, and
asks an observer using only issuance and redemption transcripts to match each
token to a buyer. With two symmetric candidates, transcript-only assignment is
no better than chance under the VOPRF assumptions.

That demonstration does not “cryptographically prove zero linkability” in the
absolute. The proof is a reduction in RFC 9497's security model; the demo checks
that this composition does not add an obvious identifier. Network timing,
query choice, a compromised client, or a partitioned first-use configuration
can reveal the answer. Label the UI's 50% result as a two-candidate model, not a
measured real-world anonymity probability.

## 12.5 Build an attack matrix

| Attack                    | Expected observation       | Defense under test                |
| ------------------------- | -------------------------- | --------------------------------- |
| Flip token bit            | `INVALID_TOKEN`            | VOPRF authenticator               |
| Corrupt issuance proof    | finalization rejects batch | DLEQ verification                 |
| Replay one token 20 times | one success                | unique insert transaction         |
| Throw during paid work    | later retry succeeds       | transaction rollback              |
| Sign buyer-specific key   | policy violation           | pin + common manifest             |
| Append token bytes        | parser rejects             | exact length + canonical encoding |
| Modify webhook whitespace | HMAC rejects               | exact raw-body MAC                |
| Downgrade `socks5h`       | Tor unavailable            | remote-DNS policy                 |

Every row should name the layer that owns the invariant. A browser test cannot
diagnose point serialization, and a crypto unit test cannot expose a proxy log.

### Checkpoint

You now have executable evidence from algebraic vectors to a model-checked
state machine and full browser flow, with the limits of each form stated
explicitly.
