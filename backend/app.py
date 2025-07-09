from flask import Flask, request
from flask_jsonrpc import JSONRPC
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
jsonrpc = JSONRPC(app, '/rpc')

latest_packet = {}          # will hold the newest confusion/gaze/cursor data

@app.route('/signals', methods=['POST'])
def signals():
    global latest_packet
    latest_packet = request.json
    return '', 204           # HTTP 204 No Content

@jsonrpc.method('confusion.get_state')
def get_state() -> dict:
    # Called by PAIL or Postman
    return latest_packet

if __name__ == '__main__':
    app.run(port=5000)

