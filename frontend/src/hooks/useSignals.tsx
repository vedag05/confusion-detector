import { useEffect, useRef } from "react";

/* ---------- Packet type ---------- */
type Packet = {
  confusion: number;                          // Hume score 0-1
  gaze:      { x: number; y: number } | null; // WebGazer coords
  cursor:    { x: number; y: number };        // mouse coords
};

/* Helper to wrap a JPEG frame in the JSON Hume expects */
const makeFrameMsg = (jpegBase64: string) => ({
  models: { face: {} },   // ask for Facial Expression model
  data:   jpegBase64
});

export function useSignals() {
  const conf   = useRef(0);
  const gaze   = useRef<Packet["gaze"]>(null);
  const cursor = useRef({ x: 0, y: 0 });

  /* ---- 1.  Hume WebSocket + webcam frames ---- */
  useEffect(() => {
    const API_KEY = import.meta.env.VITE_HUME_API_KEY as string;
    if (!API_KEY) { console.warn("No Hume API key"); return; }

    (async () => {
      /* 1-a open webcam */
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video  = Object.assign(document.createElement("video"), {
        srcObject: stream,
        muted: true,
        playsInline: true
      });
      await video.play();

      /* 1-b helpers for frame capture */
      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d")!;

      /* 1-c open WebSocket */
      const ws = new WebSocket(
        `wss://api.hume.ai/v0/stream/models?apiKey=${API_KEY}`
      );
      ws.onopen = () => console.log("🟢 Hume WS open");

      ws.onmessage = (e) => {
        try {
          const msg   = JSON.parse(e.data);
          const score =
            msg?.face?.predictions?.[0]?.emotions
               ?.find((e: any) => e.name === "Confusion")?.score ?? 0;
          conf.current = score;
        } catch {/* ignore parse errors */}
      };

      /* 1-d send a frame twice per second */
      const sendId = setInterval(() => {
        if (video.videoWidth === 0) return;         // camera not ready
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const jpeg = canvas.toDataURL("image/jpeg").split(",")[1];
        if (ws.readyState === 1) ws.send(JSON.stringify(makeFrameMsg(jpeg)));
      }, 500);

      /* cleanup */
      return () => {
        clearInterval(sendId);
        ws.close();
        stream.getTracks().forEach(t => t.stop());
      };
    })().catch(console.error);
  }, []);

  /* ---- 2.  WebGazer gaze ---- */
  useEffect(() => {
    const g: any = (window as any).webgazer;
    if (!g) { console.warn("WebGazer missing"); return; }

    g.setGazeListener((d: any) => {
      if (d) gaze.current = { x: d.x, y: d.y };
    }).begin();
  }, []);

  /* ---- 3.  Cursor coords ---- */
  useEffect(() => {
    const handler = (e: PointerEvent) =>
      (cursor.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  /* ---- 4.  Emit packet to Flask every 500 ms ---- */
  useEffect(() => {
    const id = setInterval(() => {
      const packet: Packet = {
        confusion: conf.current,
        gaze: gaze.current,
        cursor: cursor.current
      };

      console.log("packet →", packet);             // browser debug

      fetch("http://localhost:5050/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packet)
      }).catch(console.error);
    }, 500);

    return () => clearInterval(id);
  }, []);
}
