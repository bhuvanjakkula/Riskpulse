#!/usr/bin/env python3
"""NULLMESH v0 — Consequential Divergence Time engine.

Measures how long multiple non-identical beliefs can coexist before
their resulting decisions become mutually incompatible.

v0 uses possibility, not probability.
CDT uses *guaranteed* coordination: every independently admissible
joint action tuple must preserve every invariant.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from itertools import product
from typing import Callable, FrozenSet, Iterable, Optional

Action = str
AgentId = str
InvariantId = str


@dataclass(frozen=True)
class IntentContract:
    agent: AgentId
    schedule: dict[int, FrozenSet[Action]]

    def admissible_at(self, t: int) -> FrozenSet[Action]:
        keys = [k for k in self.schedule if k <= t]
        if not keys:
            raise ValueError(f"{self.agent}: no contract coverage at t={t}")
        return self.schedule[max(keys)]

    def with_schedule(self, schedule: dict[int, FrozenSet[Action]]) -> "IntentContract":
        return replace(self, schedule=dict(schedule))


@dataclass(frozen=True)
class JointWorld:
    assignment: tuple[tuple[AgentId, Action], ...]

    @staticmethod
    def from_dict(d: dict[AgentId, Action]) -> "JointWorld":
        return JointWorld(tuple(sorted(d.items())))

    def as_dict(self) -> dict[AgentId, Action]:
        return dict(self.assignment)


@dataclass
class Invariant:
    id: InvariantId
    description: str
    holds: Callable[[JointWorld], bool]


@dataclass
class TickReport:
    t: int
    world_set: FrozenSet[JointWorld]
    guaranteed: bool
    violated_invariants: tuple[InvariantId, ...]
    first_violating_world: Optional[JointWorld]
    horizon_open: bool


@dataclass
class CDTResult:
    t_star: Optional[int]
    horizon: Optional[int]
    t0: int
    first_violated: tuple[InvariantId, ...]
    cause_world: Optional[JointWorld]
    reports: list[TickReport]


@dataclass
class Repair:
    description: str
    cost: int
    patched_contracts: dict[AgentId, IntentContract]
    restored_horizon: Optional[int]
    # First invariant reported at the original break, or None if no break occurred.
    broken_invariant: Optional[InvariantId] = None
    dropped_actions: list[dict[str, str | int]] = field(default_factory=list)
    why: str = "product of admissible fallbacks contained a violating tuple"


def reachable_worlds(contracts: Iterable[IntentContract], t: int) -> FrozenSet[JointWorld]:
    contracts = list(contracts)
    agents = [c.agent for c in contracts]
    choice_sets = [sorted(c.admissible_at(t)) for c in contracts]
    worlds = set()
    for combo in product(*choice_sets):
        worlds.add(JointWorld.from_dict(dict(zip(agents, combo))))
    return frozenset(worlds)


def evaluate_invariants(
    worlds: Iterable[JointWorld], invariants: Iterable[Invariant]
) -> tuple[bool, tuple[InvariantId, ...], Optional[JointWorld]]:
    violated: list[InvariantId] = []
    first: Optional[JointWorld] = None
    invs = list(invariants)
    for w in sorted(worlds, key=lambda x: x.assignment):
        for inv in invs:
            if not inv.holds(w):
                if inv.id not in violated:
                    violated.append(inv.id)
                if first is None:
                    first = w
    return (len(violated) == 0, tuple(violated), first)


class NullMeshEngine:
    def __init__(self, contracts: list[IntentContract], invariants: list[Invariant]):
        self.contracts = {c.agent: c for c in contracts}
        self.invariants = list(invariants)

    def snapshot(self, t: int) -> TickReport:
        W = reachable_worlds(self.contracts.values(), t)
        ok, violated, first = evaluate_invariants(W, self.invariants)
        return TickReport(t, W, ok, violated, first, ok)

    def run(self, t0: int, t_end: int) -> CDTResult:
        reports: list[TickReport] = []
        t_star = None
        first_violated: tuple[InvariantId, ...] = ()
        cause = None
        for t in range(t0, t_end + 1):
            r = self.snapshot(t)
            reports.append(r)
            if t_star is None and not r.guaranteed:
                t_star = t
                first_violated = r.violated_invariants
                cause = r.first_violating_world
        horizon = None if t_star is None else t_star - t0
        return CDTResult(t_star, horizon, t0, first_violated, cause, reports)


def exclusive_resource_ownership(resource_of: Callable[[Action], Optional[str]]) -> Invariant:
    def holds(w: JointWorld) -> bool:
        claimed: dict[str, AgentId] = {}
        for agent, action in w.assignment:
            res = resource_of(action)
            if res is None:
                continue
            if res in claimed:
                return False
            claimed[res] = agent
        return True

    return Invariant("INV-003", "exclusive resource ownership", holds)


def resource_of_claim(action: Action) -> Optional[str]:
    if action.startswith("claim:"):
        return action.split(":", 1)[1]
    return None


def reserve_once() -> Invariant:
    """Each reserve:R token may be spent by at most one agent per world."""
    def holds(w: JointWorld) -> bool:
        spent: set[str] = set()
        for _, action in w.assignment:
            if not action.startswith("reserve:"):
                continue
            token = action.split(":", 1)[1]
            if token in spent:
                return False
            spent.add(token)
        return True

    return Invariant("INV-007", "reserve-once", holds)


def killer_demo_contracts() -> list[IntentContract]:
    return [
        IntentContract("A", {0: frozenset({"claim:alpha"}), 12: frozenset({"claim:alpha", "claim:bravo"})}),
        IntentContract("B", {0: frozenset({"claim:bravo"}), 12: frozenset({"claim:bravo", "claim:alpha"})}),
        IntentContract("C", {0: frozenset({"idle"})}),
    ]


def killer_invariants() -> list[Invariant]:
    return [exclusive_resource_ownership(resource_of_claim)]


def _restrict_fallback(c: IntentContract, t_fb: int, keep: FrozenSet[Action]) -> IntentContract:
    sched = dict(c.schedule)
    sched[t_fb] = frozenset(a for a in c.admissible_at(t_fb) if a in keep)
    if not sched[t_fb]:
        raise ValueError("repair would empty admissible set")
    return c.with_schedule(sched)


def _subsets_nonempty(actions: list[Action]) -> list[FrozenSet[Action]]:
    return [
        frozenset(actions[i] for i in range(len(actions)) if mask & (1 << i))
        for mask in range(1, 1 << len(actions))
    ]


def repair_cost_search(
    contracts: list[IntentContract],
    invariants: list[Invariant],
    t0: int,
    t_end: int,
    h_target: int,
    fallback_time: int = 12,
) -> Optional[Repair]:
    by_agent = {c.agent: c for c in contracts}
    mutable = [c for c in contracts if fallback_time in c.schedule]
    if not mutable:
        return None
    option_lists = []
    for c in mutable:
        extras = c.schedule[fallback_time]
        option_lists.append(
            [(c.agent, keep, len(extras) - len(keep)) for keep in _subsets_nonempty(sorted(extras))]
        )
    candidates: list[Repair] = []
    for combo in product(*option_lists):
        cost = sum(d for _, _, d in combo)
        if cost == 0:
            continue
        patched = dict(by_agent)
        bits = []
        try:
            for agent, keep, _ in combo:
                patched[agent] = _restrict_fallback(by_agent[agent], fallback_time, keep)
                bits.append(f"{agent}->keep {sorted(keep)}")
        except ValueError:
            continue
        result = NullMeshEngine(list(patched.values()), invariants).run(t0, t_end)
        restored = (t_end - t0 + 1) if result.t_star is None else result.horizon
        if result.t_star is None or (result.horizon is not None and result.horizon >= h_target):
            candidates.append(Repair("amend " + "; ".join(bits), cost, patched, restored))
    if not candidates:
        return None
    candidates.sort(key=lambda r: (r.cost, r.description))
    repair = candidates[0]
    original = NullMeshEngine(contracts, invariants).run(t0, t_end)
    repair.broken_invariant = original.first_violated[0] if original.first_violated else None
    repair.dropped_actions = [
        {"agent": c.agent, "action": action, "t": fallback_time}
        for c in sorted(mutable, key=lambda c: c.agent)
        for action in sorted(
            c.schedule[fallback_time]
            - repair.patched_contracts[c.agent].schedule[fallback_time]
        )
    ]
    return repair


def format_result(result: CDTResult) -> str:
    cause = None if result.cause_world is None else result.cause_world.as_dict()
    return (
        f"t0={result.t0}\nCDT t*={result.t_star}\nCoherence Horizon H={result.horizon}\n"
        f"First violated={result.first_violated}\nCause world={cause}"
    )


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def acceptance_tests() -> None:
    inv = killer_invariants()

    stable = [
        IntentContract("A", {0: frozenset({"claim:alpha"})}),
        IntentContract("B", {0: frozenset({"claim:bravo"})}),
        IntentContract("C", {0: frozenset({"idle"})}),
    ]
    r1 = NullMeshEngine(stable, inv).run(0, 30)
    _assert(r1.t_star is None and r1.horizon is None, "test1: horizon must stay open")

    r2 = NullMeshEngine(killer_demo_contracts(), inv).run(0, 20)
    _assert(r2.t_star == 12 and r2.horizon == 12, "test2: CDT at 12")
    _assert(r2.first_violated == ("INV-003",), "test2: INV-003")
    pre, post = r2.reports[11], r2.reports[12]
    _assert(pre.guaranteed and not post.guaranteed, "test2: break at 12")
    _assert(len(pre.world_set) == 1 and len(post.world_set) == 4, "test2: 1→4 worlds")

    patched = repair_cost_search(killer_demo_contracts(), inv, 0, 20, h_target=20)
    _assert(patched is not None and patched.cost >= 1, "test3: repair exists")
    r3 = NullMeshEngine(list(patched.patched_contracts.values()), inv).run(0, 20)
    _assert(r3.t_star is None, "test3: repaired horizon open")

    _assert(post.first_violating_world is not None, "test4")
    for w in post.world_set:
        _assert(all(isinstance(a, str) for a in w.as_dict().values()), "test4: exact labels")

    print("ACCEPTANCE TESTS PASSED")
    print(format_result(r2))
    print(f"worlds t=11: {len(pre.world_set)} guaranteed={pre.guaranteed}")
    print(f"worlds t=12: {len(post.world_set)} guaranteed={post.guaranteed}")
    print("violating assignment:", post.first_violating_world.as_dict())
    print(patched.description, "cost=", patched.cost)
    print(format_result(r3))


if __name__ == "__main__":
    acceptance_tests()
