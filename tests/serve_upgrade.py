"""Loopback-only release migration fixture. Supply a saved old release and a phase file."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, legacy, phase, **kwargs):
        self.legacy, self.phase = legacy, phase
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        current = Path(super().translate_path(path))
        relative = current.relative_to(ROOT)
        if relative.parts and relative.parts[0] == 'tests':
            return str(current)
        return str((self.legacy if self.phase.read_text().strip() == 'legacy' else ROOT) / relative)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy-root', type=Path, required=True)
    parser.add_argument('--phase-file', type=Path, required=True)
    parser.add_argument('--port', type=int, default=18770)
    args = parser.parse_args()
    legacy = args.legacy_root.resolve(strict=True)
    phase = args.phase_file.resolve(strict=True)
    assert (legacy / 'index.html').is_file() and (legacy / 'sw.js').is_file()
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, legacy=legacy, phase=phase)) as server:
        print(f'Upgrade fixture: http://localhost:{args.port}/tests/upgrade.html', flush=True)
        server.serve_forever()
