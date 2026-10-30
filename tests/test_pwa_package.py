"""Static PWA release checks; Python standard library only."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import unittest
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent

class PackageChecks(unittest.TestCase):
    def test_install_identity_scope_and_shortcuts(self):
        manifest = json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf-8'))
        self.assertEqual(manifest['id'], './')
        self.assertEqual(manifest['scope'], './')
        self.assertEqual(manifest['start_url'], './index.html')
        self.assertEqual(manifest['display'], 'fullscreen')
        self.assertEqual(manifest['display_override'], ['fullscreen', 'standalone'])
        self.assertEqual(len(manifest['shortcuts']), 3)
        for shortcut in manifest['shortcuts']:
            target = urlsplit(shortcut['url'])
            self.assertFalse(target.scheme or target.netloc)
            self.assertTrue((ROOT / target.path).is_file())

    def test_install_icons_match_declared_dimensions(self):
        manifest = json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf-8'))
        self.assertIn('maskable', {icon['purpose'] for icon in manifest['icons']})
        for icon in manifest['icons']:
            data = (ROOT / icon['src']).read_bytes()
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            width, height = struct.unpack('>II', data[16:24])
            self.assertEqual(f'{width}x{height}', icon['sizes'])
        data = (ROOT / 'assets/icons/apple-touch-icon.png').read_bytes()
        self.assertEqual(struct.unpack('>II', data[16:24]), (180, 180))

    def test_worker_precaches_every_required_local_file(self):
        worker = (ROOT / 'sw.js').read_text(encoding='utf-8')
        shell = re.search(r'const SHELL = \[(.*?)\];', worker, re.S).group(1)
        files = re.findall(r"'([^']+)'", shell)
        self.assertTrue({'./pwa.js', './media.js', './offline.html', './manifest.webmanifest'}.issubset(files))
        for file in files:
            self.assertTrue((ROOT / file).exists(), file)

    def test_app_has_unique_ids_external_scripts_and_allows_zoom(self):
        class Inspect(HTMLParser):
            def __init__(self):
                super().__init__(); self.ids = []; self.scripts = []; self.viewport = ''
            def handle_starttag(self, tag, attributes):
                attrs = dict(attributes)
                if 'id' in attrs: self.ids.append(attrs['id'])
                if tag == 'script': self.scripts.append(attrs.get('src'))
                if tag == 'meta' and attrs.get('name') == 'viewport': self.viewport = attrs['content']
        parser = Inspect(); parser.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
        self.assertEqual(len(parser.ids), len(set(parser.ids)))
        self.assertIn('mode-button', parser.ids)
        self.assertTrue(all(parser.scripts))
        for source in parser.scripts: self.assertTrue((ROOT / unquote(urlsplit(source).path)).is_file())
        self.assertNotIn('user-scalable=no', parser.viewport)
        self.assertNotIn('maximum-scale=', parser.viewport)

if __name__ == '__main__':
    unittest.main()
