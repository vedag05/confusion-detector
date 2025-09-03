import { useEffect, useRef } from "react";

/* ---------- Tunables ---------- */
const INTERVAL_MS = 250;     // 0.25 s cadence
const WINDOW_MS   = 1000;    // gaze history = 1 s
const FIX_DIAG_PX = 80;      // ≤80 px box ⇒ fixation
const NEED_PTS    = 2;       // min gaze points
const TOP_N_EMOS  = 5;       // send up to 5 emotions

/* ---------- Types ---------- */
type Point = { x: number; y: number };
type Emotion = { name: string; score: number };
type Packet = {
  confusion : number;
  emotions  : Emotion[];
  cursor    : Point;
  gaze_last : Point | null;
  gaze_box  : { x1: number; y1: number; x2: number; y2: number } | null;
  gaze_pts  : number;
  gaze_fix  : boolean;
};

/* ---------- Helper ---------- */
const makeFrameMsg = (b64: string) => ({ models: { face: {} }, data: b64 });

export function useSignals() {
  const conf      = useRef(0);
  const emotions  = useRef<Emotion[]>([]);
  const cursor    = useRef<Point>({ x: 0, y: 0 });
  const gazeLast  = useRef<Point | null>(null);
  const gazeWin   = useRef<{ x: number; y: number; t: number }[]>([]);

  /* ---- Hume WebSocket + webcam ---- */
  useEffect(() => {
    const API_KEY = import.meta.env.VITE_HUME_API_KEY as string;
    if (!API_KEY) return;

    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video  = Object.assign(document.createElement("video"), {
        srcObject: stream, muted: true, playsInline: true
      });
      await video.play();

      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d")!;

      const ws = new WebSocket(
        `wss://api.hume.ai/v0/stream/models?apiKey=${API_KEY}`
      );

      ws.onmessage = (e) => {
        const msg   = JSON.parse(e.data);
        const emos  = msg?.face?.predictions?.[0]?.emotions ?? [];
        // sort high→low score and keep top N
        emotions.current = emos
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, TOP_N_EMOS)
          .map((e: any) => ({ name: e.name, score: e.score }));

        const confScore =
          emotions.current.find((e) => e.name === "Confusion")?.score ?? 0;
        conf.current = confScore;
      };

      const sendId = setInterval(() => {
        if (video.videoWidth === 0) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const jpeg = canvas.toDataURL("image/jpeg").split(",")[1];
        ws.readyState === 1 && ws.send(JSON.stringify(makeFrameMsg(jpeg)));
      }, INTERVAL_MS);

      return () => {
        clearInterval(sendId);
        ws.close();
        stream.getTracks().forEach((t) => t.stop());
      };
    })();
  }, []);

  /* ---- WebGazer ---- */
  useEffect(() => {
    const g: any = (window as any).webgazer;
    if (!g) return;

    g.setGazeListener((d: any) => {
      if (!d) return;
      const now = performance.now();
      const p = { x: d.x, y: d.y, t: now };
      gazeLast.current = { x: d.x, y: d.y };

      gazeWin.current.push(p);
      while (gazeWin.current[0]?.t < now - WINDOW_MS) {
        gazeWin.current.shift();
      }
    }).begin();
  }, []);

  /* ---- cursor ---- */
  useEffect(() => {
    const handler = (e: PointerEvent) =>
      (cursor.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  /* ---- send packet ---- */
  useEffect(() => {
    const id = setInterval(() => {
      const gw = gazeWin.current;
      let bbox: Packet["gaze_box"] = null;
      let fixation = false;

      if (gw.length) {
        const xs = gw.map(p => p.x);
        const ys = gw.map(p => p.y);
        bbox = {
          x1: Math.min(...xs),
          y1: Math.min(...ys),
          x2: Math.max(...xs),
          y2: Math.max(...ys)
        };
        const diag = Math.hypot(bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);
        fixation   = diag <= FIX_DIAG_PX && gw.length >= NEED_PTS;
      }

      const packet: Packet = {
        confusion : conf.current,
        emotions  : emotions.current,
        cursor    : cursor.current,
        gaze_last : gazeLast.current,
        gaze_box  : bbox,
        gaze_pts  : gw.length,
        gaze_fix  : fixation
      };

      fetch("http://localhost:5050/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packet)
      }).catch(console.error);
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, []);
}
