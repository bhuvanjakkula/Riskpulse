#!/usr/bin/env python3
"""Possibility-set scenarios for coherence horizons and independent invariants."""

from dataclasses import dataclass

from api import (
    run_cdt,
    IntentContract,
    killer_demo_contracts,
    killer_invariants,
    resource_of_claim,
    reserve_once,
)


@dataclass
class Scenario:
    name: str
    fallback_time: int
    contracts: list[IntentContract]


def late_scenario() -> Scenario:
    """Keep the demo choices, delaying cross-claims until t=20."""
    contracts = [
        c.with_schedule({20 if t == 12 else t: actions for t, actions in c.schedule.items()})
        for c in killer_demo_contracts()
    ]
    return Scenario("H20", 20, contracts)


def early_scenario() -> Scenario:
    return Scenario("H12", 12, killer_demo_contracts())


def reserve_collision() -> Scenario:
    return Scenario("reserve_collision", 8, [
        IntentContract("A", {0: frozenset({"idle"}),
                             8: frozenset({"idle", "reserve:fuel"})}),
        IntentContract("B", {0: frozenset({"idle"}),
                             8: frozenset({"idle", "reserve:fuel"})}),
        IntentContract("C", {0: frozenset({"idle"})}),
    ])


def reserve_collision_test() -> None:
    scenario = reserve_collision()
    ownership = killer_invariants()[0]
    reserve = reserve_once()
    result = run_cdt(scenario.contracts, [ownership, reserve], 0, 30)
    assert result["t_star"] == 8 and result["horizon"] == 8
    assert result["first_violated"] == ["INV-007"]
    assert result["ticks"][7]["guaranteed"]
    assert not result["ticks"][8]["guaranteed"]
    assert result["cause_world"] == {
        "A": "reserve:fuel", "B": "reserve:fuel", "C": "idle"
    }
    assert all("INV-003" not in tick["violated"] for tick in result["ticks"])
    ownership_result = run_cdt(scenario.contracts, [ownership], 0, 30)
    assert all(tick["guaranteed"] for tick in ownership_result["ticks"])
    for contract in scenario.contracts:
        for actions in contract.schedule.values():
            assert all(isinstance(action, str) for action in actions)
    print("reserve_collision | t*=8 | H=8 | INV-007 fails | INV-003 holds")


def category_test() -> None:
    # Same tracker quality and same world-cardinality pattern; only fallback time
    # changes; CDT / H change. That is the category witness.
    scenarios = [early_scenario(), late_scenario()]
    invariants = killer_invariants()
    results = []
    rows = []
    assert [inv.id for inv in invariants] == ["INV-003"]

    for scenario in scenarios:
        contracts = scenario.contracts
        assert len(contracts) == 3
        assert {c.agent for c in contracts} == {"A", "B", "C"}
        resources = {
            resource_of_claim(action)
            for c in contracts
            for actions in c.schedule.values()
            for action in actions
            if resource_of_claim(action) is not None
        }
        assert resources == {"alpha", "bravo"}
        for t in range(scenario.fallback_time):
            assert all(len(c.admissible_at(t)) == 1 for c in contracts)

        result = run_cdt(contracts, invariants, 0, 30)
        results.append(result)
        assert result["t_star"] == scenario.fallback_time
        assert result["horizon"] == scenario.fallback_time
        assert result["first_violated"] == ["INV-003"]
        before = result["ticks"][scenario.fallback_time - 1]
        after = result["ticks"][scenario.fallback_time]
        assert before["world_count"] == 1
        assert after["world_count"] == 4
        assert before["guaranteed"] and not after["guaranteed"]
        for tick in result["ticks"]:
            is_before = tick["t"] < scenario.fallback_time
            assert tick["world_count"] == (1 if is_before else 4)
            assert tick["guaranteed"] == is_before
            assert {c.agent: len(c.admissible_at(tick["t"])) for c in contracts} == (
                {"A": 1, "B": 1, "C": 1} if is_before
                else {"A": 2, "B": 2, "C": 1}
            )

        # All admissible actions retain exact labels, including after fallback.
        for contract in contracts:
            for actions in contract.schedule.values():
                assert all(isinstance(action, str) for action in actions)
        assert set(result["cause_world"]) == {"A", "B", "C"}

        rows.append((scenario.name, result["t_star"], result["horizon"],
                     before["world_count"], after["world_count"],
                     before["guaranteed"], after["guaranteed"]))

    assert results[0]["t_star"] != results[1]["t_star"]
    print("name | t_star | H | worlds_before | worlds_after | guaranteed_before | guaranteed_after")
    for row in rows:
        print(" | ".join(str(value) for value in row))


if __name__ == "__main__":
    category_test()
    reserve_collision_test()
