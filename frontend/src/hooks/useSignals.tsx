import { useEffect, useRef } from "react";

/* ---------------- Packet type ---------------- */
type Packet = {
  confusion: number;
  gaze: { x: number; y: number } | null;
  cursor: { x: number; y: number };
};

/* ---------------- Hook ----------------------- */
export function useSignals() {
  const conf   = useRef(0);                               // Hume score
  const gaze   = useRef<Packet["gaze"]>(null);            // WebGazer
  const cursor = useRef({ x: 0, y: 0 });                  // pointer

  /* ---- 1. Hume confusion stream ---------------------- */
  useEffect(() => {
    const Hume: any = (window as any).Hume;               // global from <script>
    if (!Hume) { console.warn("Hume SDK not loaded"); return; }

    const client = new Hume.HumeWebSDK({
      apiKey: import.meta.env.VITE_HUME_API_KEY as string,
      models: ["facial", "prosody"]                       // drop "prosody" for video-only
    });

    client.onPrediction((pred: any) => {
      const score =
        pred?.facial?.emotion?.confusion?.[0]?.score ?? 0;
      conf.current = score;
    });

    client.connect().catch(console.error);
    return () => client.disconnect();
  }, []);

  /* ---- 2. WebGazer gaze stream ----------------------- */
  useEffect(() => {
    const g: any = (window as any).webgazer;
    if (!g) { console.warn("WebGazer missing"); return; }

    g.showPredictionPoints(true);                         // tiny dot for debug

    const readyCheck = setInterval(() => {
      if (g.isReady && g.isReady()) {
        console.log("✅ WebGazer ready");
        clearInterval(readyCheck);
      }
    }, 500);

    g.setGazeListener((d: any) => {
      if (d) gaze.current = { x: d.x, y: d.y };
    }).begin();

    return () => clearInterval(readyCheck);
  }, []);

  /* ---- 3. Cursor coordinates ------------------------- */
  useEffect(() => {
    const handler = (e: PointerEvent) =>
      (cursor.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  /* ---- 4. Send packet to Flask every 500 ms ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      const packet: Packet = {
        confusion: conf.current,
        gaze: gaze.current,
        cursor: cursor.current
      };

      console.log("packet →", packet);                    // browser-side debug

      fetch("http://localhost:5050/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packet)
      }).catch(console.error);
    }, 500);

    return () => clearInterval(id);
  }, []);
}
