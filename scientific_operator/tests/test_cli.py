import unittest
from scientific_operator.cli import size, recover

class DecisionTests(unittest.TestCase):
    def test_size(self):
        self.assertEqual(size(100000,50,48)['shares'],500)
        self.assertEqual(size(100000,50,49.99)['shares'],2000)
    def test_recovery(self):
        self.assertEqual(recover(20)['required_gain_pct'],25)
    def test_invalid(self):
        for args in [(0,50,48),(100000,48,50),(100000,float('nan'),48)]:
            with self.assertRaises(ValueError):size(*args)
        with self.assertRaises(ValueError):recover(100)

if __name__=='__main__':unittest.main()
