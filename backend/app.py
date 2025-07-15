# confusion-detector/backend/app.py
from flask import Flask, request
from flask_jsonrpc import JSONRPC
from flask_cors import CORS, cross_origin

app = Flask(__name__)
CORS(app, resources={r"/signals": {"origins": "http://localhost:5173"}},
     supports_credentials=True)
jsonrpc = JSONRPC(app, "/rpc")

latest_packet: dict = {}

@app.route("/signals", methods=["POST", "OPTIONS"])
@cross_origin(origin="http://localhost:5173")           # CORS for dev
def signals():
    global latest_packet
    latest_packet = request.json or {}
    print("🎯", latest_packet)
    return "", 204

@jsonrpc.method("confusion.get_state")
def get_state() -> dict:
    return latest_packet

if __name__ == "__main__":
    app.run(port=5050, debug=True)                      # use 5050
