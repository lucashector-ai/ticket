"use client";

import { useEffect, useState } from "react";
import { myProducerStatus } from "@/lib/actions/onboarding";

// guardado entre as navegações (o cabeçalho remonta a cada página)
let known: { uid: string; producer: boolean } | null = null;

/** O usuário logado é produtor? Começa com o último valor conhecido e confirma no servidor. */
export function useIsProducer(uid: string | null | undefined) {
  const [producer, setProducer] = useState(() => !!uid && known?.uid === uid && known.producer);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void myProducerStatus().then((p) => {
      known = { uid, producer: p };
      if (alive) setProducer(p);
    }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);
  return !!uid && producer;
}
