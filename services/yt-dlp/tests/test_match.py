import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.match import pick_best, score_candidate  # noqa: E402

WANT = {"title": "Hawái", "artist": "Maluma", "duration": 200}


def c(vid, title, artist, dur):
    return {"videoId": vid, "title": title, "artist": artist, "duration": dur}


class MatchTests(unittest.TestCase):
    def test_prefers_topic_channel_with_matching_duration(self):
        cands = [
            c("AAAAAAAAAAA", "Maluma - Hawái (Official Video)", "Maluma", 201),
            c("BBBBBBBBBBB", "Hawái", "Maluma - Topic", 200),
            c("CCCCCCCCCCC", "Hawái (cover)", "Random", 200),
        ]
        self.assertEqual(pick_best(WANT, cands)["videoId"], "BBBBBBBBBBB")

    def test_rejects_wrong_duration_title_or_artist(self):
        self.assertEqual(score_candidate(WANT, c("A" * 11, "Hawái", "Maluma", 260)), -1.0)
        self.assertEqual(score_candidate(WANT, c("A" * 11, "Otra Canción Distinta", "Maluma", 200)), -1.0)
        self.assertEqual(score_candidate(WANT, c("A" * 11, "Hawái", "Un Desconocido Cualquiera", 200)), -1.0)

    def test_none_when_nothing_trustworthy(self):
        self.assertIsNone(pick_best(WANT, [c("A" * 11, "Hawai karaoke instrumental", "Karaoke Zone", 200)]))
        self.assertIsNone(pick_best(WANT, []))

    def test_accents_and_feat_in_title(self):
        want = {"title": "Madrid (feat. Myke Towers)", "artist": "Maluma", "duration": 180}
        self.assertIsNotNone(pick_best(want, [c("A" * 11, "Madrid", "Maluma - Topic", 181)]))


if __name__ == "__main__":
    unittest.main()
