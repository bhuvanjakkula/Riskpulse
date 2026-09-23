"""API contract and engine parity tests using the killer demo."""

import json
import unittest

from api import explain_break, run_cdt, repair_report, reserve_once
from engine import NullMeshEngine, killer_demo_contracts, killer_invariants
from scenarios import late_scenario, reserve_collision


class ApiTests(unittest.TestCase):
    def test_killer_demo_numbers(self):
        result = run_cdt(killer_demo_contracts(), killer_invariants(), 0, 30)
        self.assertEqual((result["t_star"], result["horizon"]), (12, 12))
        self.assertEqual(result["first_violated"], ["INV-003"])
        self.assertIs(result["ticks"][11]["guaranteed"], True)
        self.assertIs(result["ticks"][12]["guaranteed"], False)
        self.assertEqual(result["ticks"][11]["world_count"], 1)
        self.assertEqual(result["ticks"][12]["world_count"], 4)

    def test_repair_report(self):
        report = repair_report(killer_demo_contracts(), killer_invariants(), 0, 20, 20)
        self.assertEqual(set(report), {
            "description", "cost", "restored_horizon", "broken_invariant",
            "dropped_actions", "why",
        })
        self.assertEqual(report["broken_invariant"], ["INV-003"])
        self.assertEqual(report["cost"], 2)
        self.assertEqual(report["restored_horizon"], 21)
        self.assertCountEqual(report["dropped_actions"], [
            {"agent": "A", "action": "claim:bravo", "t": 12},
            {"agent": "B", "action": "claim:alpha", "t": 12},
        ])
        self.assertEqual(report["why"],
                         "product of admissible fallbacks contained a violating tuple")
        self.assertEqual(json.loads(json.dumps(report)), report)

    def test_no_repair(self):
        with self.assertRaises(ValueError):
            repair_report(killer_demo_contracts(), killer_invariants(), 0, 30, 30,
                          fallback_time=99)

    def test_h20(self):
        result = run_cdt(late_scenario().contracts, killer_invariants(), 0, 30)
        self.assertEqual((result["t_star"], result["horizon"]), (20, 20))

    def test_reserve_collision(self):
        contracts = reserve_collision().contracts
        result = run_cdt(contracts, killer_invariants() + [reserve_once()], 0, 30)
        self.assertEqual((result["t_star"], result["horizon"]), (8, 8))
        self.assertIn("INV-007", result["first_violated"])
        self.assertNotIn("INV-003", result["first_violated"])
        self.assertTrue(all("INV-003" not in tick["violated"] for tick in result["ticks"]))
        ownership = run_cdt(contracts, killer_invariants(), 0, 30)
        self.assertIsNone(ownership["t_star"])

    def test_killer_demo_matches_engine(self):
        for t0, t_end in [(0, 30), (0, 11), (5, 30), (12, 30)]:
            with self.subTest(t0=t0, t_end=t_end):
                contracts = killer_demo_contracts()
                invariants = killer_invariants()
                expected = NullMeshEngine(contracts, invariants).run(t0, t_end)
                actual = run_cdt(contracts, invariants, t0, t_end)
                self.assertEqual(set(actual), {
                    "t0", "t_star", "horizon", "first_violated", "cause_world", "ticks"
                })
                self.assertEqual(actual["t0"], expected.t0)
                self.assertEqual(actual["t_star"], expected.t_star)
                self.assertEqual(actual["horizon"], expected.horizon)
                self.assertEqual(actual["first_violated"], list(expected.first_violated))
                self.assertEqual(actual["cause_world"], (
                    None if expected.cause_world is None else expected.cause_world.as_dict()
                ))
                self.assertEqual(len(actual["ticks"]), len(expected.reports))
                for tick, report in zip(actual["ticks"], expected.reports):
                    self.assertEqual(tick, {
                        "t": report.t,
                        "world_count": len(report.world_set),
                        "guaranteed": report.guaranteed,
                        "violated": list(report.violated_invariants),
                    })
                self.assertEqual(json.loads(json.dumps(actual)), actual)

    def test_explain_killer_break(self):
        result = run_cdt(killer_demo_contracts(), killer_invariants(), 0, 30)
        explanation = explain_break(result)
        for detail in ["t=12", "H=12", "t0=0", "INV-003",
                       "{A: claim:alpha, B: claim:alpha, C: idle}"]:
            self.assertIn(detail, explanation)
        self.assertNotIn("\n", explanation)

    def test_explain_open_horizon(self):
        result = run_cdt(killer_demo_contracts(), killer_invariants(), 0, 11)
        explanation = explain_break(result)
        self.assertEqual(explanation, "Coherence Horizon remains open through t_end.")
        self.assertNotIn("\n", explanation)


if __name__ == "__main__":
    unittest.main()
