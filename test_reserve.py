"""Reserve-once semantics and independence from exclusive ownership."""

import unittest

from engine import JointWorld, reserve_once
from scenarios import reserve_collision_test


class ReserveTests(unittest.TestCase):
    def test_reserve_collision_scenario(self):
        reserve_collision_test()

    def test_reserve_tokens_are_checked_per_world(self):
        invariant = reserve_once()
        self.assertEqual(invariant.id, "INV-007")
        for actions, expected in [
            (("reserve:fuel", "reserve:fuel", "idle"), False),
            (("reserve:fuel", "idle", "reserve:fuel"), False),
            (("reserve:fuel", "reserve:water", "idle"), True),
            (("reserve:fuel", "idle", "idle"), True),
            (("claim:alpha", "claim:alpha", "idle"), True),
            (("idle", "idle", "idle"), True),
        ]:
            with self.subTest(actions=actions):
                world = JointWorld.from_dict(dict(zip(("A", "B", "C"), actions)))
                self.assertEqual(invariant.holds(world), expected)
                self.assertEqual(invariant.holds(world), expected)


if __name__ == "__main__":
    unittest.main()
