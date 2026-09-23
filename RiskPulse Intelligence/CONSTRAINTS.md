# NULLMESH v0 constraints

## What NULLMESH measures

NULLMESH measures how long multiple non-identical beliefs can coexist before
their admissible decisions cease to guarantee coordination. Beliefs are
represented by possibility sets of exact action labels. Every world is a fully
labeled assignment of one admissible action to each agent; labels remain exact
even after fallback introduces incompatible choices.

`engine.py` is the single source of truth for the math. At integer tick `t`, each
contract uses its latest schedule entry at or before `t`. The world set `W(t)` is
the Cartesian product of those independently admissible action sets.

## Guaranteed coordination and possible incompatibility

For the configured invariant set `I`, the frozen rule is:

```text
G(t) = every world w in W(t) satisfies every invariant i in I
t*   = first evaluated t for which G(t) is false
H    = t* - t0
```

Runs evaluate integer ticks from `t0` through `t_end`, inclusive. If no break is
found, `t_star` and `horizon` are `None`: the horizon is open within the evaluated
interval. This does not establish coordination beyond that interval.

The guarantee being measured is guaranteed coordination. One possible violating
tuple is sufficient to break it. A compatible world still existing does not
preserve the guarantee. Guaranteed incompatibility would require every world to
violate at least one invariant; CDT does not wait for that stronger condition.
Neither world counts nor exact labels imply a likelihood of incompatibility.

The reported cause is the first violating world in the engine's deterministic
assignment order. The invariants reported at the first break include all
invariants violated by any world at that tick; they need not all fail in the
same cause world.

## Invariants and repair

- `INV-003`, exclusive resource ownership: at most one agent may use a given
  `claim:R` resource in a world.
- `INV-007`, reserve-once: at most one agent may spend a given `reserve:R` token
  in a world. This is a per-world check, with no token history across ticks.
- Repair searches only deletions from existing action sets at the selected
  fallback schedule entry, retaining a nonempty set for each agent. It adds no
  actions and uses no other repair operators.
- Cost is the number of deleted actions. The existing search excludes zero-cost
  candidates, accepts a horizon meeting the target or open through the evaluated
  interval, and selects by cost followed by description. These rules are frozen.
- Repair output includes `broken_invariant` (the first reported invariant at the
  original break), `dropped_actions` entries containing exactly `agent`, `action`,
  and `t`, and `why` equal to
  `"product of admissible fallbacks contained a violating tuple"`.
- An open repair currently reports `restored_horizon = t_end - t0 + 1`; this is
  the evaluated tick count, not a proof of an unlimited horizon. The CDT result
  itself continues to use `None` for an open horizon.

## Forbidden scope

- Probabilities, likelihoods, or probabilistic weighting of worlds.
- Maps or geography.
- Radios or radio simulation.
- LLMs.
- More than 20 agents. This is a scope limit; the current engine does not enforce
  it with input validation. The v0 acceptance scenarios use only A, B, and C.
- Continuous space.
- UI work or additional repair operators within v0.

## Stable interface

Codex integrations and any later UI must call `api.py` for CDT results rather
than implement their own math. `run_cdt(contracts, invariants, t0, t_end)` returns
exactly `t0`, `t_star`, `horizon`, `first_violated`, `cause_world`, and `ticks`.
Each tick contains exactly `t`, `world_count`, `guaranteed`, and `violated`.
Invariant collections are lists; `cause_world` is an agent-to-action dictionary
or `None`. `explain_break(result)` returns one paragraph describing the break
time, violated invariants, and witness assignment, or the absence of a break
within the evaluated interval. No extra API fields are part of v0.

## Definition of done for v0

All of the following must hold without expanding scope or changing CDT math:

1. `python engine.py` prints `ACCEPTANCE TESTS PASSED`. The killer demo has
   `t*=12`, `H=12`, and `INV-003`; t=11 has one guaranteed world and t=12 has four
   worlds with the guarantee broken. Its witness is
   `{A: claim:alpha, B: claim:alpha, C: idle}`.
2. `python scenarios.py` verifies H20 and H12 over t=0 through t=30. Both use
   three agents, two exclusive resources, one action per agent before fallback,
   and exact labels. Both change from one to four worlds at fallback, with
   guaranteed coordination changing from true to false. Their horizons are
   respectively 20 and 12, and the requested comparison table is printed.
3. The reserve collision scenario breaks at t=8 with H=8 and `INV-007`, while
   `INV-003` holds in every evaluated world. Its witness is
   `{A: reserve:fuel, B: reserve:fuel, C: idle}`; labels remain exact.
4. The killer demo's cheapest repair costs 2 and deletes exactly
   `A/claim:bravo@12` and `B/claim:alpha@12`, independent of output order. It
   leaves the horizon open through t=20 and reports the required repair fields.
5. `python -m unittest -v` passes, including API parity with the engine, break
   explanations, reserve-once checks, and exact deletion-only repair output.
6. The engine remains the math authority; API fields and the forbidden scope
   above remain fixed. No scope expansion proceeds until these checks stay green.
