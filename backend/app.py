# backend/app.py
from flask import Flask, request
from flask_jsonrpc import JSONRPC
from flask_cors import CORS
import threading, time, json
from pathlib import Path

# ---------- Flask plumbing ----------
app = Flask(__name__)
CORS(app, resources={r"/signals": {"origins": "http://localhost:5173"}})
jsonrpc = JSONRPC(app, "/rpc")

# ---------- session log ----------
LOG_DIR = Path("logs"); LOG_DIR.mkdir(exist_ok=True)
log_file = (LOG_DIR / f"session_{time.strftime('%Y%m%d_%H%M%S')}.jsonl").open("w")

def log(pkt: dict) -> None:
    log_file.write(json.dumps(pkt) + "\n")
    log_file.flush()

# ---------- packet store ----------
class Store:
    def __init__(self):
        self.latest: dict = {}
    def update(self, pkt: dict):
        self.latest = pkt
        log(pkt)                      # write immediately
store = Store()

# ---------- routes ----------
@app.route("/signals", methods=["POST"])
def signals():
    store.update(request.json or {})
    return "", 204

@jsonrpc.method("confusion.get_state")
def get_state() -> dict:
    return store.latest

# ---------- start ----------
if __name__ == "__main__":
    app.run(port=5050, debug=True)

