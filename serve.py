"""Optional local preview: Python 3, no extra packages. Ctrl+C stops the server."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import functools
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.webmanifest': 'application/manifest+json',
                      '.js': 'text/javascript', '.wav': 'audio/wav'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

if __name__ == '__main__':
    from prepare_examples import prepare
    print(f'Starter folder: {prepare()} audio files ready.')
    address = ('127.0.0.1', 8080)
    try:
        with ThreadingHTTPServer(address, functools.partial(Handler, directory=str(ROOT))) as server:
            print('StoryTouch: http://localhost:8080/ — Ctrl+C to stop.')
            print('This local preview serves only this folder, only to this computer.')
            threading.Timer(0.5, lambda: webbrowser.open('http://localhost:8080/')).start()
            server.serve_forever()
    except KeyboardInterrupt:
        print('\nStoryTouch preview stopped.')
    except OSError as error:
        print('Could not start the local preview:', error)
        print('Close any existing preview on port 8080, then try again.')
