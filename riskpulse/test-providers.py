import unittest
from unittest.mock import patch
import providers

class ProviderTests(unittest.TestCase):
    def test_validates_identifiers(self):
        self.assertEqual(providers.validate_instruments(['AAPL US Equity']), ['AAPL US Equity'])
        for value in [[], ['A']*51, ['A','A'], ['A\nB'], [None], 'AAPL']:
            with self.assertRaises(ValueError):
                providers.validate_instruments(value)

    def test_rejects_nonfinite_and_nonpositive_prices(self):
        for value in [None, 'N/A', float('nan'), float('inf'), 0, -1]:
            self.assertIsNone(providers.number(value))
        self.assertEqual(providers.number('123.4'), 123.4)

    def test_unsupported_provider_never_falls_back(self):
        with self.assertRaises(ValueError):
            providers.quotes('unknown', ['A'])

    def test_retrieval_timestamp_is_distinct_from_observation_date(self):
        row={'instrument':'A','price':100,'currency':'USD','asOf':'2026-01-01','timing':'close'}
        with patch.object(providers, 'lseg', return_value=[row]):
            result=providers.quotes('lseg',['A'])
        self.assertEqual(result['quotes'][0]['asOf'],'2026-01-01')
        self.assertIn('retrievedAt',result)

if __name__=='__main__':
    unittest.main()
