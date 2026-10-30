import { describe, expect, it } from "vitest";
import { currentSession, sessionRefusal } from "@/lib/checkin-day";

/* Portaria em evento de várias datas: em que sessão a portaria está e o que o operador lê ao recusar. */
const at = (iso: string) => new Date(`${iso}-03:00`); // horário de São Paulo
const sab = { id: "sab", startAt: at("2026-11-07T22:00"), doorsAt: at("2026-11-07T21:00") };
const dom = { id: "dom", startAt: at("2026-11-08T22:00"), doorsAt: at("2026-11-08T21:00") };
const festa = [dom, sab]; // fora de ordem de propósito

describe("portaria por dia", () => {
  it("sábado de noite e a madrugada seguinte são do sábado; o domingo abre 2 h antes dos portões", () => {
    expect(currentSession(festa, at("2026-11-07T23:30"))?.id).toBe("sab");
    expect(currentSession(festa, at("2026-11-08T04:00"))?.id).toBe("sab");
    expect(currentSession(festa, at("2026-11-08T18:59"))?.id).toBe("sab");
    expect(currentSession(festa, at("2026-11-08T19:00"))?.id).toBe("dom");
  });

  it("antes da primeira data conta a primeira; depois da última, a última", () => {
    expect(currentSession(festa, at("2026-11-01T12:00"))?.id).toBe("sab");
    expect(currentSession(festa, at("2026-11-20T12:00"))?.id).toBe("dom");
    expect(currentSession([], at("2026-11-07T22:00"))).toBeNull();
  });

  it("ingresso de sábado lido no domingo: recusado com o dia certo", () => {
    expect(sessionRefusal("sab", festa, at("2026-11-08T22:30"))).toBe("Ingresso para sábado, 7/11: vale só nesse dia.");
    expect(sessionRefusal("dom", festa, at("2026-11-07T22:30"))).toBe("Ingresso para domingo, 8/11: vale só nesse dia.");
    expect(sessionRefusal("sab", festa, at("2026-11-07T22:30"))).toBeNull();
    expect(sessionRefusal("dom", festa, at("2026-11-08T22:30"))).toBeNull();
  });

  it("duas sessões no mesmo dia: a mensagem diz o horário", () => {
    const mat = { id: "mat", startAt: at("2026-11-07T14:00"), doorsAt: null };
    const noite = { id: "noite", startAt: at("2026-11-07T21:00"), doorsAt: at("2026-11-07T20:00") };
    expect(sessionRefusal("noite", [mat, noite], at("2026-11-07T15:00"))).toBe("Ingresso para a sessão das 21h de sábado, 7/11: vale só nessa sessão.");
    expect(sessionRefusal("mat", [mat, noite], at("2026-11-07T17:59"))).toBeNull();
    expect(sessionRefusal("mat", [mat, noite], at("2026-11-07T18:00"))).toMatch(/sessão das 14h/);
  });

  it("sessão que não é do evento (tipo antigo) não trava a entrada", () => {
    expect(sessionRefusal("outra", festa, at("2026-11-08T22:30"))).toBeNull();
  });
});
