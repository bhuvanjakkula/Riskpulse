"""Deletion-only repair output for the killer demo."""

import unittest

from engine import killer_demo_contracts, killer_invariants, repair_cost_search


class RepairTests(unittest.TestCase):
    def test_killer_demo_dropped_actions(self):
        contracts = killer_demo_contracts()
        original_schedules = {c.agent: dict(c.schedule) for c in contracts}
        repair = repair_cost_search(contracts, killer_invariants(), 0, 20, h_target=20)
        self.assertIsNotNone(repair)
        self.assertEqual(repair.broken_invariant, "INV-003")
        self.assertCountEqual(repair.dropped_actions, [
            {"agent": "A", "action": "claim:bravo", "t": 12},
            {"agent": "B", "action": "claim:alpha", "t": 12},
        ])
        self.assertEqual(repair.why,
                         "product of admissible fallbacks contained a violating tuple")
        self.assertEqual(repair.cost, 2)
        self.assertEqual(repair.restored_horizon, 21)
        self.assertEqual(set(repair.patched_contracts), set(original_schedules))
        for contract in contracts:
            self.assertEqual(contract.schedule, original_schedules[contract.agent])
            patched = repair.patched_contracts[contract.agent]
            self.assertEqual(set(patched.schedule), set(contract.schedule))
            for t, actions in contract.schedule.items():
                self.assertTrue(patched.schedule[t])
                self.assertLessEqual(patched.schedule[t], actions)
                if t != 12:
                    self.assertEqual(patched.schedule[t], actions)


if __name__ == "__main__":
    unittest.main()
