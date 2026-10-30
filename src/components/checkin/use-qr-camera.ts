"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Câmera traseira + jsQR (funciona no iPhone e no Android): lê um quadro a cada ~200ms e chama `onRead`
 * com o texto do QR. O jsQR (~250 KB) só é baixado quando a câmera abre, junto com o pedido de permissão. `busy` pausa a leitura enquanto mostra um resultado.
 * O mesmo QR só é lido de novo depois de sair da frente da câmera por 2s: quem continua com o celular apontado
 * depois do "liberado" não vira um "já entrou" vermelho (antes bastavam 4s com o QR parado na frente).
 */
/** `restart`: mudar o número reabre a câmera (depois de negar a permissão, por exemplo). */
export function useQrCamera(on: boolean, onRead: (text: string) => unknown, busy: RefObject<boolean>, onError: () => void, restart = 0) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** último QR lido e a última vez em que ele ainda aparecia no quadro */
  const last = useRef<{ text: string; seen: number }>({ text: "", seen: 0 });

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null, timer = 0, stop = false;
    (async () => {
      try {
        const [media, { default: jsQR }] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false }),
          import("jsqr"),
        ]);
        stream = media;
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (stop) return;
          const c = canvas.current, vv = video.current;
          // durante o resultado continua olhando (só para saber se o QR ainda está na frente), sem disparar
          if (c && vv && vv.videoWidth) {
            const w = 480, h = Math.round((vv.videoHeight / vv.videoWidth) * w);
            c.width = w; c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(vv, 0, 0, w, h);
            const qr = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (qr?.data) {
              const again = qr.data === last.current.text && now - last.current.seen < 2000;
              if (qr.data === last.current.text) last.current.seen = now;
              if (!again && !busy.current) {
                last.current = { text: qr.data, seen: now };
                onRead(qr.data);
              }
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
  }, [on, onRead, busy, onError, restart]);

  return { video, canvas };
}
