"""ローカルで遊ぶための配信（public/ を http://127.0.0.1:8766/ で出す）。

python -m http.server と同じだが、ブラウザにキャッシュさせない（Cache-Control: no-store）。
ビルドし直した JS や差し替えた絵が、再読み込みだけで必ず反映されるようにするため（2026-11-18）。
使い方：python tools/serve.py [ポート]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'public'


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory=str(ROOT)))
    print(f'http://127.0.0.1:{port}/  ({ROOT})')
    server.serve_forever()


if __name__ == '__main__':
    main()
