"""Loopback-only child process. Random per-launch token is supplied by desktop.mjs."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import hmac
import json
import os
import re
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import providers
from workspace import Workspace
def user_workspace(handler):
    user_id = handler.headers.get('X-RiskPulse-User', '')
    if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', user_id):
        raise ValueError('Authenticated user required.')
    root = Path(os.environ.get('RISK_DATA_DIR', str(Path(__file__).resolve().parents[1] / 'data')))
    return Workspace(root / 'users' / user_id / 'workspace.sqlite3')

TOKEN = os.environ.get("RISK_BRIDGE_TOKEN")
if not TOKEN:
    raise SystemExit("Launch with node scripts/desktop.mjs")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Identifiers and credentials do not go into access logs.

    def respond(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, allow_nan=False).encode())

    def authorized(self):
        return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN)

    def do_GET(self):
        if not self.authorized():
            return self.respond({"error": "Unauthorized"}, 401)
        if self.path == "/workspace":
            try:
                return self.respond(user_workspace(self).snapshot())
            except Exception:
                return self.respond({"error": "Cannot read the saved workspace."}, 503)
        if self.path != "/status":
            return self.respond({"error": "Not found"}, 404)
        self.respond(providers.status())

    def do_POST(self):
        if not self.authorized():
            return self.respond({"error": "Unauthorized"}, 401)
        if self.path not in ("/quotes", "/workspace"):
            return self.respond({"error": "Not found"}, 404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= (2*1024*1024 if self.path == "/workspace" else 16384):
                return self.respond({"error": "Invalid request size"}, 400)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError("Request must be a JSON object")
            self.respond(user_workspace(self).apply(data) if self.path == "/workspace" else providers.quotes(data.get("provider"), data.get("instruments")))
        except ValueError as exc:
            self.respond({"error": str(exc)}, 400)
        except RuntimeError as exc:
            self.respond({"error": str(exc)}, 503)
        except Exception:
            self.respond({"error": "Local request failed. Check disk availability or provider session setup."}, 503)


HTTPServer(("127.0.0.1", int(os.environ.get('RISK_BRIDGE_PORT', '4174'))), Handler).serve_forever()
