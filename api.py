"""Stable, possibility-only interface to the CDT engine."""

from engine import (
    IntentContract, Invariant, NullMeshEngine,
    killer_demo_contracts, killer_invariants, resource_of_claim, reserve_once,
    repair_cost_search as _repair_cost_search,
)


def run_cdt(
    contracts: list[IntentContract],
    invariants: list[Invariant],
    t0: int,
    t_end: int,
) -> dict:
    """Return engine results as JSON-compatible data with inclusive ticks.

    Invariant IDs are lists; cause_world is an agent-to-action dictionary or
    None. An open horizon retains the engine's None values.
    """
    result = NullMeshEngine(contracts, invariants).run(t0, t_end)
    return {
        "t0": result.t0,
        "t_star": result.t_star,
        "horizon": result.horizon,
        "first_violated": list(result.first_violated),
        "cause_world": (
            None if result.cause_world is None else result.cause_world.as_dict()
        ),
        "ticks": [
            {
                "t": report.t,
                "world_count": len(report.world_set),
                "guaranteed": report.guaranteed,
                "violated": list(report.violated_invariants),
            }
            for report in result.reports
        ],
    }


def explain_break(result: dict) -> str:
    """Explain a run_cdt result in one paragraph without recomputing CDT."""
    if result["t_star"] is None:
        return "Coherence Horizon remains open through t_end."
    invariants = ", ".join(result["first_violated"])
    assignment = ", ".join(
        f"{agent}: {action}"
        for agent, action in sorted(result["cause_world"].items())
    )
    return (
        f"The coordination guarantee first failed at t={result['t_star']} "
        f"(H={result['horizon']} from t0={result['t0']}); "
        f"invariants violated at that tick: {invariants}. "
        f"The first violating assignment was {{{assignment}}}."
    )


def repair_report(
    contracts: list[IntentContract],
    invariants: list[Invariant],
    t0: int,
    t_end: int,
    h_target: int,
    fallback_time: int = 12,
) -> dict:
    """Serialize the existing deletion-only search; raise ValueError if none exists.

    broken_invariant wraps the engine's first broken invariant in a list.
    """
    repair = _repair_cost_search(
        contracts, invariants, t0, t_end, h_target, fallback_time
    )
    if repair is None:
        raise ValueError("No deletion-only repair found for the requested horizon")
    return {
        "description": repair.description,
        "cost": repair.cost,
        "restored_horizon": repair.restored_horizon,
        "broken_invariant": (
            [] if repair.broken_invariant is None else [repair.broken_invariant]
        ),
        "dropped_actions": [dict(row) for row in repair.dropped_actions],
        "why": repair.why,
    }
