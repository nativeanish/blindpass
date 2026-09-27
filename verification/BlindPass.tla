---------------------------- MODULE BlindPass ----------------------------
EXTENDS Naturals, TLC

CONSTANT Tokens

ASSUME Tokens /= {}

VARIABLES paid, issued, tokenState, successes

vars == <<paid, issued, tokenState, successes>>

Init ==
  /\ paid = FALSE
  /\ issued = FALSE
  /\ tokenState = [t \in Tokens |-> "fresh"]
  /\ successes = [t \in Tokens |-> 0]

Pay ==
  /\ ~paid
  /\ paid' = TRUE
  /\ UNCHANGED <<issued, tokenState, successes>>

Issue ==
  /\ paid
  /\ ~issued
  /\ issued' = TRUE
  /\ UNCHANGED <<paid, tokenState, successes>>

Reserve(t) ==
  /\ issued
  /\ tokenState[t] = "fresh"
  /\ tokenState' = [tokenState EXCEPT ![t] = "reserved"]
  /\ UNCHANGED <<paid, issued, successes>>

Commit(t) ==
  /\ tokenState[t] = "reserved"
  /\ tokenState' = [tokenState EXCEPT ![t] = "spent"]
  /\ successes' = [successes EXCEPT ![t] = @ + 1]
  /\ UNCHANGED <<paid, issued>>

Rollback(t) ==
  /\ tokenState[t] = "reserved"
  /\ tokenState' = [tokenState EXCEPT ![t] = "fresh"]
  /\ UNCHANGED <<paid, issued, successes>>

Next ==
  \/ Pay
  \/ Issue
  \/ \E t \in Tokens : Reserve(t)
  \/ \E t \in Tokens : Commit(t)
  \/ \E t \in Tokens : Rollback(t)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ paid \in BOOLEAN
  /\ issued \in BOOLEAN
  /\ tokenState \in [Tokens -> {"fresh", "reserved", "spent"}]
  /\ successes \in [Tokens -> Nat]

AtMostOneSuccess == \A t \in Tokens : successes[t] <= 1

SuccessIsSpent ==
  \A t \in Tokens : successes[t] = 1 => tokenState[t] = "spent"

ReservationRequiresIssuance ==
  \A t \in Tokens : tokenState[t] /= "fresh" => issued

IssuanceRequiresPayment == issued => paid

=============================================================================
