"""Tests for normalization, validation, and tool behaviour against the real imported DB.

Run: python -m unittest discover -s tests -v
DB tests skip automatically if data/torob.sqlite has not been built.
"""
import os
import unittest

from tehran_agent.normalize import normalize_text, parse_budget_toman, clean_null
from tehran_agent.tools import Filters, ShoppingTools, haversine_km, resolve_location

DB = os.path.join(os.path.dirname(__file__), "..", "data", "torob.sqlite")


class NormalizeTests(unittest.TestCase):
    def test_null_tokens(self):
        self.assertIsNone(clean_null("null"))
        self.assertIsNone(clean_null(" NULL "))
        self.assertIsNone(clean_null(""))
        self.assertEqual(clean_null("0"), "0")  # zero is a real value, not missing

    def test_persian_digits_and_chars(self):
        self.assertEqual(normalize_text("ماوس ۱۲۳"), "ماوس 123")
        self.assertEqual(normalize_text("كتاب"), "کتاب")

    def test_budget_parsing(self):
        self.assertEqual(parse_budget_toman("یک میلیون"), None)  # words not supported, documented
        self.assertEqual(parse_budget_toman("تا 1 میلیون"), 1_000_000)
        self.assertEqual(parse_budget_toman("۱.5 میلیون"), 1_500_000)
        self.assertEqual(parse_budget_toman("500 هزار"), 500_000)
        self.assertIsNone(parse_budget_toman("بی‌سیم"))


class ValidationTests(unittest.TestCase):
    def test_bad_sort(self):
        with self.assertRaises(ValueError):
            Filters(sort="random").validate()

    def test_min_gt_max(self):
        with self.assertRaises(ValueError):
            Filters(min_price=10, max_price=5).validate()

    def test_negative_price(self):
        with self.assertRaises(ValueError):
            Filters(max_price=-1).validate()

    def test_limit_clamped(self):
        f = Filters(limit=10_000)
        f.validate()
        self.assertEqual(f.limit, 100)

    def test_location_outside_tehran_rejected(self):
        with self.assertRaises(ValueError):
            Filters(near=(40.0, 50.0)).validate()

    def test_haversine_zero(self):
        self.assertAlmostEqual(haversine_km((35.7, 51.4), (35.7, 51.4)), 0.0)

    def test_resolve_location(self):
        self.assertIsNotNone(resolve_location("صادقیه"))
        self.assertIsNone(resolve_location("اصفهان"))


@unittest.skipUnless(os.path.exists(DB), "run the importer first to build data/torob.sqlite")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = ShoppingTools(DB)

    @classmethod
    def tearDownClass(cls):
        cls.t.close()

    def test_empty_query(self):
        self.assertEqual(self.t.search_products("   ")["status"], "empty_query")

    def test_no_match(self):
        self.assertEqual(self.t.search_products("zzzqqqxxx")["status"], "no_results")

    def test_search_returns_real_records_with_offers(self):
        r = self.t.search_products("ماوس بی سیم", Filters(limit=5))
        self.assertGreater(r["total"], 0)
        for item in r["items"]:
            self.assertGreaterEqual(item["offer_count"], 1)

    def test_price_filter_respected(self):
        r = self.t.search_products("ماوس", Filters(max_price=1_000_000, sort="price_asc", limit=50))
        for item in r["items"]:
            if item["min_price_toman"] is not None:
                self.assertLessEqual(item["min_price_toman"], 1_000_000)

    def test_price_sorted_ascending(self):
        r = self.t.search_products("ماوس", Filters(limit=50))
        prices = [i["min_price_toman"] for i in r["items"] if i["min_price_toman"] is not None]
        self.assertEqual(prices, sorted(prices))

    def test_invalid_product_id_rejected(self):
        with self.assertRaises(ValueError):
            self.t.get_product_details("bad id")

    def test_unknown_product_returns_not_found(self):
        self.assertIsNone(self.t.get_product_details("product_doesnotexist"))
        self.assertEqual(self.t.compare_offers("product_doesnotexist")["status"], "not_found")

    def test_compare_excludes_null_prices_from_summary(self):
        r = self.t.search_products("لنز سونی", Filters(limit=1))
        pid = r["items"][0]["product_id"]
        c = self.t.compare_offers(pid)
        valid = [o["price_toman"] for o in c["offers"] if o["price_status"] == "ok"]
        if valid:
            self.assertEqual(c["summary"]["min_price_toman"], min(valid))

    def test_compare_offers_carry_shop_and_timestamp_fields(self):
        r = self.t.search_products("لنز سونی", Filters(limit=1))
        c = self.t.compare_offers(r["items"][0]["product_id"])
        for o in c["offers"]:
            self.assertIn("price_changed_at", o)
            self.assertIn("name", o["shop"])

    def test_find_shops_near_sadeghiyeh_sorted_by_distance(self):
        s = self.t.find_shops(Filters(limit=20, sort="distance", radius_km=5),
                              location=resolve_location("صادقیه"))
        dists = [x["distance_km"] for x in s["shops"]]
        self.assertEqual(dists, sorted(dists))
        for d in dists:
            self.assertLessEqual(d, 5)

    def test_shops_flag_synthetic_names(self):
        s = self.t.find_shops(Filters(limit=3))
        for shop in s["shops"]:
            self.assertTrue(shop["name_is_synthetic_warning"])


if __name__ == "__main__":
    unittest.main()
