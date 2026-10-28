"use client";

import jsQR from "jsqr";
import { useEffect, useRef, type RefObject } from "react";

/**
 * Câmera traseira + jsQR (funciona no iPhone e no Android): lê um quadro a cada ~200ms e chama `onRead`
 * com o texto do QR. O mesmo QR só é lido de novo depois de 4s; `busy` pausa a leitura enquanto mostra um resultado.
 */
export function useQrCamera(on: boolean, onRead: (text: string) => unknown, busy: RefObject<boolean>, onError: () => void) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, timer = 0, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (stop) return;
          const c = canvas.current, vv = video.current;
          if (c && vv && vv.videoWidth && !busy.current) {
            const w = 480, h = Math.round((vv.videoHeight / vv.videoWidth) * w);
            c.width = w; c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(vv, 0, 0, w, h);
            const qr = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (qr?.data && !(qr.data === last.current.text && now - last.current.at < 4000)) {
              last.current = { text: qr.data, at: now };
              onRead(qr.data);
            }
          }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch {
        onError();
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, onRead, busy, onError]);

  return { video, canvas };
}
