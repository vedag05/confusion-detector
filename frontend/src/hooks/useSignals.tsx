import { useEffect, useRef } from 'react';
import WebGazer from 'webgazer';
import PointerTracker from 'pointer-tracker';

type Packet = {
  confusion: number;
  gaze: { x: number; y: number } | null;
  cursor: { x: number; y: number };
};

export function useSignals() {
  const conf = useRef(0);
  const gaze = useRef<Packet['gaze']>(null);
  const cur  = useRef({ x: 0, y: 0 });

  /* ---------- Hume WebSocket ---------- */
  useEffect(() => {
    const ws = new WebSocket(
      `wss://api.hume.ai/v0/stream/models?models=facial,prosody&apiKey=${import.meta.env.VITE_HUME_API_KEY}`
    );
    ws.onmessage = (e) => {
      try {
        conf.current = JSON.parse(e.data).predictions.confusion.score ?? 0;
      } catch {}
    };
    return () => ws.close();
  }, []);

  /* ---------- Eye gaze (WebGazer) ----- */
  useEffect(() => {
    WebGazer.setGazeListener(d => {
      if (d) gaze.current = { x: d.x, y: d.y };
    }).begin();
  }, []);

  /* ---------- Cursor tracker ---------- */
  useEffect(() => {
    new PointerTracker(document.body, {
      move([p]) {
        cur.current = { x: p.clientX, y: p.clientY };
      }
    });
  }, []);

  /* ---------- Ship packet to Flask every 500 ms ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      fetch('http://localhost:5000/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confusion: conf.current,
          gaze: gaze.current,
          cursor: cur.current
        })
      });
    }, 500);
    return () => clearInterval(id);
  }, []);
}

