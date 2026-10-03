import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.music_filter import filter_and_rank, is_music_candidate, music_score  # noqa: E402


def mk(title, channel="Artista", duration=200):
    return {"title": title, "channel": channel, "duration": duration}


GET = lambda e: (e["title"], e["channel"], e["duration"])  # noqa: E731


class MusicFilterTests(unittest.TestCase):
    def test_drops_non_music(self):
        bad = [
            mk("Anuel AA: ENTREVISTA exclusiva"),
            mk("Feid reacciona a su propio video"),
            mk("Eladio Carrión interview | Podcast", duration=2400),
            mk("Making of del video"),
            mk("Karol G - Tour (Shorts) #shorts", duration=30),
            mk("Mejores canciones de Feid 2024", duration=3600),
            mk("Full album Real Hasta la Muerte", duration=3000),
            mk("Concierto en vivo", duration=None),
            mk("Entrevista con Anuel", duration=180),
        ]
        for b in bad:
            self.assertFalse(is_music_candidate(*GET(b)), b["title"])

    def test_keeps_music(self):
        good = [mk("Ahora Me Llama"), mk("BICHOTA", "KAROL G"), mk("Ferxxo 100", duration=190),
                mk("Tu No Vive Así", "Romeo Santos - Topic", 245)]
        for g in good:
            self.assertTrue(is_music_candidate(*GET(g)), g["title"])

    def test_duration_bounds(self):
        self.assertFalse(is_music_candidate("x", "c", 59))
        self.assertTrue(is_music_candidate("x", "c", 60))
        self.assertTrue(is_music_candidate("x", "c", 600))
        self.assertFalse(is_music_candidate("x", "c", 601))

    def test_ranking_topic_and_official_first_stable(self):
        items = [
            mk("Ahora Me Llama (Live)", "Fan Channel"),
            mk("Ahora Me Llama", "Random Uploader"),
            mk("Ahora Me Llama", "Anuel AA - Topic"),
            mk("Ahora Me Llama (Official Video)", "AnuelVEVO"),
        ]
        out = filter_and_rank(items, GET)
        self.assertEqual(out[0]["channel"], "Anuel AA - Topic")
        self.assertEqual(out[1]["channel"], "AnuelVEVO")
        self.assertEqual(out[-1]["title"], "Ahora Me Llama (Live)")

    def test_dedup_same_song_same_artist(self):
        items = [mk("Bby Wow", "Karol G - Topic"), mk("Bby Wow (Official Audio)", "Karol G")]
        # misma canción y mismo artista (aunque cambie "- Topic"): se queda la mejor versión
        out = filter_and_rank(items, GET)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["channel"], "Karol G - Topic")
        dup = [mk("Bby Wow", "Karol G"), mk("Bby Wow [HD]", "Karol G")]
        self.assertEqual(len(filter_and_rank(dup, GET)), 1)

    def test_accents_normalized(self):
        self.assertFalse(is_music_candidate("ENTREVISTA", "c", 200))
        self.assertFalse(is_music_candidate("Reacción al disco", "c", 200))
        self.assertFalse(is_music_candidate("Capítulo 3", "c", 200))
        self.assertGreater(music_score("x", "A - Topic"), music_score("x", "A"))


if __name__ == "__main__":
    unittest.main()
