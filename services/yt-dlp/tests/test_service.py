"""Pruebas del microservicio. Usan un yt-dlp falso (script) para no tocar la red.

Ejecutar:  python3 -m pytest services/yt-dlp/tests -v   (desde la raíz)
"""
from __future__ import annotations

import json
import os
import stat
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.extractor import Extractor, parse_stream_expiry  # noqa: E402
from app.main import create_app  # noqa: E402

TOKEN = "t" * 32
VID = "dQw4w9WgXcQ"


def fake_bin(body: str) -> str:
    fd, path = tempfile.mkstemp(suffix=".py")
    with os.fdopen(fd, "w") as fh:
        fh.write("#!/usr/bin/env python3\nimport sys, json, time\n" + body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path


def make_client(bin_path: str, extract_timeout: int = 5) -> TestClient:
    settings = Settings(
        auth_token=TOKEN, port=8080, search_timeout_s=5, extract_timeout_s=extract_timeout,
        max_concurrency=2, search_max_results=5, expiry_margin_s=300,
        default_stream_ttl_s=3600, ytdlp_bin=bin_path,
    )
    extractor = Extractor(bin_path, 5, extract_timeout, 300, 3600)
    return TestClient(create_app(settings, extractor))


H = {"Authorization": f"Bearer {TOKEN}"}

EXPIRE = int(time.time()) + 6 * 3600

FAKE_OK = f'''
args = sys.argv[1:]
if any(a.startswith("ytsearch") for a in args):
    print(json.dumps({{"entries": [
        {{"id": "{VID}", "title": "Tu No Vive Así", "channel": "Artista - Topic",
         "duration": 245, "thumbnails": [{{"url": "https://i.ytimg.com/a.jpg", "width": 100, "height": 100}}]}},
        {{"id": "bad id", "title": "x"}},
    ]}}))
else:
    print(json.dumps({{"title": "Tu No Vive Así", "artist": "Artista", "duration": 245.4,
        "thumbnail": "https://i.ytimg.com/hq.jpg", "acodec": "mp4a.40.2", "vcodec": "none",
        "url": "https://rr1.googlevideo.com/videoplayback?expire={EXPIRE}&id=abc"}}))
'''


class ServiceTests(unittest.TestCase):
    def test_auth_required(self):
        c = make_client(fake_bin(FAKE_OK))
        r = c.post("/search", json={"query": "x"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()["code"], "UNAUTHORIZED")
        r = c.post("/extract", json={"videoId": VID}, headers={"Authorization": "Bearer nope"})
        self.assertEqual(r.status_code, 401)

    def test_search_ok_and_filters_invalid_ids(self):
        c = make_client(fake_bin(FAKE_OK))
        r = c.post("/search", json={"query": "Tu No Vive Así"}, headers=H)
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["success"])
        self.assertEqual(len(body["items"]), 1)
        item = body["items"][0]
        self.assertEqual(item["videoId"], VID)
        self.assertEqual(item["artist"], "Artista")  # quita " - Topic"
        self.assertEqual(item["duration"], 245)

    def test_extract_ok(self):
        c = make_client(fake_bin(FAKE_OK))
        r = c.post("/extract", json={"videoId": VID}, headers=H)
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertTrue(b["success"])
        self.assertTrue(b["streamUrl"].startswith("https://"))
        self.assertEqual(b["producers"], [])
        self.assertEqual(b["duration"], 245)
        # expiración = expire - 300s, en ISO UTC
        t = time.mktime(time.strptime(b["streamExpiresAt"], "%Y-%m-%dT%H:%M:%SZ")) - time.timezone
        self.assertAlmostEqual(t, EXPIRE - 300, delta=2)

    def test_invalid_video_id(self):
        c = make_client(fake_bin(FAKE_OK))
        for bad in ["", "short", "https://youtube.com/watch?v=abc", "a" * 12, "--version---"]:
            r = c.post("/extract", json={"videoId": bad}, headers=H)
            self.assertEqual(r.status_code, 400, bad)
            self.assertEqual(r.json()["code"], "INVALID_REQUEST")

    def test_invalid_query(self):
        c = make_client(fake_bin(FAKE_OK))
        for bad in [{}, {"query": ""}, {"query": "   "}, {"query": "a" * 201}]:
            r = c.post("/search", json=bad, headers=H)
            self.assertEqual(r.status_code, 400, bad)

    def test_timeout(self):
        c = make_client(fake_bin("time.sleep(10)\n"), extract_timeout=1)
        r = c.post("/extract", json={"videoId": VID}, headers=H)
        self.assertEqual(r.status_code, 504)
        self.assertEqual(r.json()["code"], "UPSTREAM_TIMEOUT")

    def test_ytdlp_failure_not_leaking_stderr(self):
        c = make_client(fake_bin('sys.stderr.write("SECRET /internal/path"); sys.exit(1)\n'))
        r = c.post("/extract", json={"videoId": VID}, headers=H)
        self.assertEqual(r.status_code, 502)
        self.assertNotIn("SECRET", r.text)
        r = c.post("/search", json={"query": "x"}, headers=H)
        self.assertEqual(r.json()["code"], "SEARCH_FAILED")

    def test_unavailable_maps_to_not_found(self):
        c = make_client(fake_bin('sys.stderr.write("ERROR: Video unavailable"); sys.exit(1)\n'))
        r = c.post("/extract", json={"videoId": VID}, headers=H)
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["code"], "TRACK_NOT_FOUND")

    def test_no_audio_url(self):
        c = make_client(fake_bin('print(json.dumps({"title": "x"}))\n'))
        r = c.post("/extract", json={"videoId": VID}, headers=H)
        self.assertEqual(r.json()["code"], "STREAM_RESOLUTION_FAILED")

    def test_video_only_format_rejected(self):
        c = make_client(fake_bin(
            'print(json.dumps({"title":"x","vcodec":"avc1","acodec":"none","url":"https://a/b"}))\n'))
        r = c.post("/extract", json={"videoId": VID}, headers=H)
        self.assertEqual(r.json()["code"], "STREAM_RESOLUTION_FAILED")

    def test_dedup_concurrent_extracts(self):
        """3 peticiones simultáneas al mismo videoId => UNA sola ejecución de yt-dlp."""
        import asyncio
        import httpx

        counter = os.path.join(tempfile.mkdtemp(), "count")
        body = f'''
open({counter!r}, "a").write("x")
time.sleep(1)
print(json.dumps({{"title": "t", "artist": "a", "url": "https://h/p?expire={EXPIRE}", "acodec": "mp4a"}}))
'''
        bin_path = fake_bin(body)
        settings = Settings(
            auth_token=TOKEN, port=8080, search_timeout_s=5, extract_timeout_s=10,
            max_concurrency=2, search_max_results=5, expiry_margin_s=300,
            default_stream_ttl_s=3600, ytdlp_bin=bin_path,
        )
        app = create_app(settings, Extractor(bin_path, 5, 10, 300, 3600))

        async def run():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://t") as ac:
                rs = await asyncio.gather(*[
                    ac.post("/extract", json={"videoId": VID}, headers=H) for _ in range(3)
                ])
                return [r.status_code for r in rs]

        self.assertEqual(asyncio.run(run()), [200, 200, 200])
        self.assertEqual(len(open(counter).read()), 1)

    def test_expiry_parsing(self):
        now = 1_000_000.0
        self.assertEqual(parse_stream_expiry("https://x/y?expire=1010000", now, 300, 3600), 1_009_700.0)
        self.assertEqual(parse_stream_expiry("https://x/y", now, 300, 3600), now + 3600)
        self.assertEqual(parse_stream_expiry("https://x/y?expire=abc", now, 300, 3600), now + 3600)
        # expirada: cae al TTL por defecto
        self.assertEqual(parse_stream_expiry("https://x/y?expire=5", now, 300, 3600), now + 3600)

    def test_healthz_open(self):
        c = make_client(fake_bin(FAKE_OK))
        self.assertEqual(c.get("/healthz").json(), {"status": "ok"})

    def test_settings_require_token(self):
        os.environ.pop("SERVICE_AUTH_TOKEN", None)
        with self.assertRaises(RuntimeError):
            Settings.load()


if __name__ == "__main__":
    unittest.main()


class CacheTests(unittest.TestCase):
    def test_search_cache_avoids_second_ytdlp_call(self):
        import asyncio
        import httpx
        counter = os.path.join(tempfile.mkdtemp(), "count")
        body = f'''
open({counter!r}, "a").write("x")
print(json.dumps({{"entries": [{{"id": "{VID}", "title": "Tema", "channel": "A - Topic", "duration": 200}}]}}))
'''
        bin_path = fake_bin(body)
        settings = Settings(
            auth_token=TOKEN, port=8080, search_timeout_s=5, extract_timeout_s=5, max_concurrency=2,
            search_max_results=5, expiry_margin_s=300, default_stream_ttl_s=3600, ytdlp_bin=bin_path,
        )
        app = create_app(settings, Extractor(bin_path, 5, 5, 300, 3600))

        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as ac:
                a = await ac.post("/search", json={"query": "Eladio"}, headers=H)
                b = await ac.post("/search", json={"query": "eladio"}, headers=H)
                return a.json(), b.json()

        a, b = asyncio.run(run())
        self.assertEqual(len(open(counter).read()), 1)
        self.assertTrue(b.get("cached"))
        self.assertEqual(a["items"], b["items"])

    def test_extract_cache_reuses_valid_stream(self):
        import asyncio
        import httpx
        counter = os.path.join(tempfile.mkdtemp(), "count")
        body = f'''
open({counter!r}, "a").write("x")
print(json.dumps({{"title": "t", "artist": "a", "url": "https://h/p?expire={EXPIRE}", "acodec": "mp4a"}}))
'''
        bin_path = fake_bin(body)
        settings = Settings(
            auth_token=TOKEN, port=8080, search_timeout_s=5, extract_timeout_s=5, max_concurrency=2,
            search_max_results=5, expiry_margin_s=300, default_stream_ttl_s=3600, ytdlp_bin=bin_path,
        )
        app = create_app(settings, Extractor(bin_path, 5, 5, 300, 3600))

        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as ac:
                a = await ac.post("/extract", json={"videoId": VID}, headers=H)
                b = await ac.post("/extract", json={"videoId": VID}, headers=H)
                return a.json(), b.json()

        a, b = asyncio.run(run())
        self.assertEqual(len(open(counter).read()), 1)
        self.assertTrue(b.get("cached"))
        self.assertEqual(a["streamUrl"], b["streamUrl"])

    def test_common_flags_fail_fast_and_optional_cookies(self):
        e = Extractor("yt-dlp", 5, 5, 300, 3600, cookies_file="/c.txt", proxy="http://p:1", socket_timeout_s=7)
        flags = e._common()
        self.assertIn("--socket-timeout", flags)
        self.assertEqual(flags[flags.index("--socket-timeout") + 1], "7")
        self.assertEqual(flags[flags.index("--cookies") + 1], "/c.txt")
        self.assertEqual(flags[flags.index("--proxy") + 1], "http://p:1")
        self.assertNotIn("--cookies", Extractor("yt-dlp", 5, 5, 300, 3600)._common())


class MatchEndpointTests(unittest.TestCase):
    def _client(self, body):
        return make_client(fake_bin(body))

    def test_match_searches_scores_and_extracts_in_one_call(self):
        body = f'''
args = sys.argv[1:]
if any(a.startswith("ytsearch") for a in args):
    print(json.dumps({{"entries": [
        {{"id": "AAAAAAAAAAA", "title": "Hawái cover", "channel": "Fan", "duration": 200}},
        {{"id": "{VID}", "title": "Hawái", "channel": "Maluma - Topic", "duration": 200}},
    ]}}))
else:
    print(json.dumps({{"title": "Hawái", "artist": "Maluma", "duration": 200, "acodec": "mp4a",
        "url": "https://h/p?expire={EXPIRE}"}}))
'''
        c = self._client(body)
        r = c.post("/match", json={"artist": "Maluma", "title": "Hawái", "duration": 200}, headers=H)
        self.assertEqual(r.status_code, 200, r.text)
        b = r.json()
        self.assertEqual(b["videoId"], VID)
        self.assertTrue(b["streamUrl"].startswith("https://"))

    def test_match_not_found(self):
        body = 'print(json.dumps({"entries": [{"id": "AAAAAAAAAAA", "title": "Otra cosa", "channel": "X", "duration": 200}]}))\n'
        r = self._client(body).post("/match", json={"artist": "Maluma", "title": "Hawái", "duration": 200}, headers=H)
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["code"], "TRACK_NOT_FOUND")

    def test_match_requires_auth_and_validates(self):
        c = self._client(FAKE_OK)
        self.assertEqual(c.post("/match", json={"artist": "a", "title": "b"}).status_code, 401)
        self.assertEqual(c.post("/match", json={"artist": "", "title": "b"}, headers=H).status_code, 400)
        self.assertEqual(c.post("/match", json={"artist": "a", "title": "b", "duration": 0}, headers=H).status_code, 400)

    def test_diag_reports_checks_and_reason(self):
        c = self._client('sys.stderr.write("ERROR: Sign in to confirm you are not a bot"); sys.exit(1)\n')
        r = c.post("/diag", headers=H)
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertFalse(b["probe"]["ok"])
        self.assertEqual(b["probe"]["reason"], "bot_blocked")
        self.assertTrue(any("IP" in h for h in b["hints"]))
        self.assertEqual(c.post("/diag").status_code, 401)
