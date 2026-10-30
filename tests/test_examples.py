"""Catalog regression checks; mutations are confined to a temporary fixture folder."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import wave

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('examples', ROOT / 'prepare_examples.py')
examples = importlib.util.module_from_spec(spec)
spec.loader.exec_module(examples)

class CatalogChecks(unittest.TestCase):
    def test_supplied_stories_resolve_with_stable_ids(self):
        catalog = json.loads((ROOT / 'example-stories/stories.json').read_text(encoding='utf-8'))
        self.assertEqual({entry['title'] for entry in catalog['stories']},
                         {"Giraffe's New Friend", 'Music Box', 'Snowy Day', 'Teddy Bear'})
        self.assertEqual(set(catalog['retiredIds']), {'demo-hello', 'demo-chimes', 'demo-rain'})
        for entry in catalog['stories']:
            audio = ROOT / 'example-stories' / entry['file']
            self.assertTrue(audio.is_file())
            self.assertGreater(audio.stat().st_size, 0)
            self.assertEqual(entry['id'], 'starter-' + hashlib.sha256(entry['file'].encode()).hexdigest()[:20])

    def test_helper_keeps_transcripts_ids_and_cache_revision_consistent(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / 'example-stories'
            (folder / 'nested').mkdir(parents=True)
            (root / 'sw.js').write_text("const EXAMPLE_REV = 'old';", encoding='utf-8')
            for name in ['hello.mp3', 'chimes.wav', 'rain.wav']:
                (folder / name).write_bytes(b'retired fixture')
            audio = folder / 'nested' / 'A Bell.wav'
            with wave.open(str(audio), 'wb') as out:
                out.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
                out.writeframes(b'\0\0' * 480)
            audio.with_suffix('.txt').write_text('A gentle bell rings.', encoding='utf-8')
            original_root, original_folder = examples.ROOT, examples.FOLDER
            try:
                examples.ROOT, examples.FOLDER = root, folder
                self.assertEqual(examples.prepare(), 1)
                first = (folder / 'stories.json').read_text(encoding='utf-8')
                revision = (root / 'sw.js').read_text(encoding='utf-8')
                entry = json.loads(first)['stories'][0]
                self.assertEqual(entry['transcript'], 'A gentle bell rings.')
                self.assertAlmostEqual(entry['duration'], .01)
                self.assertEqual(examples.prepare(), 1)
                self.assertEqual((folder / 'stories.json').read_text(encoding='utf-8'), first)
                self.assertEqual((root / 'sw.js').read_text(encoding='utf-8'), revision)
                audio.with_suffix('.txt').write_text('A new transcript.', encoding='utf-8')
                examples.prepare()
                self.assertNotEqual((root / 'sw.js').read_text(encoding='utf-8'), revision)
                self.assertEqual(json.loads((folder / 'stories.json').read_text(encoding='utf-8'))['stories'][0]['id'], entry['id'])
            finally:
                examples.ROOT, examples.FOLDER = original_root, original_folder

if __name__ == '__main__':
    unittest.main()
