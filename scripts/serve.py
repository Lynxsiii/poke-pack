"""Local dev server that does not let the browser cache stale code.

`py -m http.server` sends no cache headers, so browsers apply heuristic
freshness and happily keep serving an old js/catalog.js after you edit it —
you end up debugging code that isn't running. Cloudflare Pages gets this right
in production via the _headers file; this gives the same behaviour locally.

    py scripts/serve.py            # http://127.0.0.1:5173
    py scripts/serve.py 5174       # another port
"""
from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

# Mirrors _headers: code and data revalidate, content-stable art caches hard.
NO_CACHE_PREFIXES = ("/js/", "/css/", "/data/")


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=3600")
        elif path.startswith(NO_CACHE_PREFIXES) or path.endswith((".html", "/")):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def send_head(self):
        parsed = urlparse(self.path)
        name = Path(parsed.path).name
        mapped = Path(self.translate_path(self.path))
        if not mapped.is_file() and name and "." not in name:
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, fmt, *args):  # quieter than the default
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


def main(argv: list[str]) -> int:
    port = int(argv[0]) if argv else 5173
    handler = partial(DevHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"poke-pack.rip running at http://127.0.0.1:{port}")
        print("code + data revalidate on every request; assets cache for an hour")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
