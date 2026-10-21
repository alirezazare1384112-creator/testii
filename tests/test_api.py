import json
import os
import threading
import time
import unittest
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

from tehran_agent.api import make_handler

DB = os.path.join(os.path.dirname(__file__), "..", "data", "torob.sqlite")


@unittest.skipUnless(os.path.exists(DB), "run the importer first to build data/torob.sqlite")
class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(DB))
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def _get(self, path: str):
        url = f"http://127.0.0.1:{self.port}{path}"
        with urllib.request.urlopen(url, timeout=30) as r:
            body = r.read().decode("utf-8")
            return r.status, json.loads(body)

    def test_health(self):
        code, body = self._get("/health")
        self.assertEqual(code, 200)
        self.assertEqual(body["status"], "ok")

    def test_meta(self):
        code, body = self._get("/api/meta")
        self.assertEqual(code, 200)
        self.assertIn("meta", body)
        self.assertIn("count_products", body["meta"])

    def test_search(self):
        q = urllib.parse.quote("ماوس بی سیم")
        code, body = self._get(f"/api/search?q={q}&limit=5")
        self.assertEqual(code, 200)
        self.assertIn("items", body)

    def test_product_not_found(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/api/product/product_doesnotexist")
        self.assertEqual(ctx.exception.code, 404)

    def test_compare_and_trip(self):
        q = urllib.parse.quote("ماوس")
        _, search = self._get(f"/api/search?q={q}&limit=2")
        if not search["items"]:
            self.skipTest("no products for query")
        pid = search["items"][0]["product_id"]

        code, compare = self._get(f"/api/compare/{pid}?limit=5")
        self.assertEqual(code, 200)
        self.assertIn("offers", compare)

        code, trip = self._get(f"/api/trip?product_id={pid}")
        self.assertEqual(code, 200)
        self.assertIn("plan", trip)


if __name__ == "__main__":
    unittest.main()
