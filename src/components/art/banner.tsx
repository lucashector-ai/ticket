/* Banners (21:9 / 16:9 / preenchimento) dos eventos — gerados a partir do design Tickets Win. */
"use client";

import { useState } from "react";
import { isImageArt } from "./flyer";
export const BANNER_IDS = ["baile", "sintonia", "terreiro", "marea", "subsolo", "cypher", "noite", "luz", "orquestra", "mesa", "calourada", "guitarra"] as const;
export type BannerId = (typeof BANNER_IDS)[number];
export type BannerFit = "ratio" | "card" | "fill";

type BannerVals = {
  is: Record<BannerId, boolean>;
  pos: "absolute" | "relative"; ar: string; rowTop: string; rowBot: string; lift: string; padX: string;
};

export function bannerVals(id: string, fit: BannerFit = "ratio"): BannerVals {
  const b = (BANNER_IDS as readonly string[]).includes(id) ? (id as BannerId) : "baile";
  const is = Object.fromEntries(BANNER_IDS.map((k) => [k, k === b])) as Record<BannerId, boolean>;
  const fill = fit === "fill", card = fit === "card";
  return {
    is, pos: fill ? "absolute" : "relative", ar: fill ? "auto" : card ? "16 / 9" : "21 / 9",
    rowTop: fill ? "11%" : card ? "4%" : "10%", rowBot: fill ? "30%" : card ? "18%" : "14%",
    lift: fill ? "200px" : "0px", padX: fill ? "max(20px, calc((100cqw - 1216px) / 2))" : "8cqw",
  };
}

/** Arte do banner de um evento. `fit="fill"` ocupa o container pai (position:absolute).
 *  `poster`: a imagem é o cartaz (3:4) usado no lugar do banner, que é opcional (DM-2). */
export function BannerArt({ id, fit = "ratio", poster = false }: { id: string; fit?: BannerFit; poster?: boolean }) {
  if (isImageArt(id)) return <BannerImage id={id} v={bannerVals(id, fit)} poster={poster} />;
  return <BannerTemplate v={bannerVals(id, fit)} />;
}

/** Imagem enviada pelo produtor. Se for alta (o cartaz no lugar do banner), monta o banner:
 *  cartaz inteiro no centro sobre um fundo desfocado dele mesmo, em vez de cortar o cartaz.
 *  Quem não sabe se é cartaz (`poster` falso) descobre pela proporção quando a imagem carrega. */
function BannerImage({ id, v, poster }: { id: string; v: BannerVals; poster: boolean }) {
  const [tall, setTall] = useState(poster);
  const check = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth && img.naturalWidth / img.naturalHeight < 1.3) setTall(true);
  };
  const layer = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;
  return (
    <div aria-hidden="true" style={{ position: v.pos, inset: "0", width: "100%", aspectRatio: v.ar, overflow: "hidden", background: "#111111" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {tall && <img src={id} alt="" decoding="async" style={{ ...layer, objectFit: "cover", filter: "blur(28px) saturate(1.15) brightness(.72)", transform: "scale(1.2)" }} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={check} onLoad={(ev) => check(ev.currentTarget)} src={id} alt="" decoding="async"
        style={{ ...layer, objectFit: tall ? "contain" : "cover", filter: tall ? "drop-shadow(0 12px 32px rgba(0,0,0,.45))" : undefined }} />
    </div>
  );
}


function BannerTemplate({ v }: { v: BannerVals }) {
  return (<>
    <div aria-hidden="true" style={{ position: v.pos, inset: "0", width: "100%", aspectRatio: v.ar, overflow: "hidden", containerType: "inline-size", background: "#111111", fontFamily: "'Inter', sans-serif" }}>
      {/* BAILE DO FUTURO */}
      {v.is.baile && (<>
        <div style={{ position: "absolute", inset: "0", backgroundColor: "#CBFF3D", backgroundImage: "radial-gradient(ellipse at 18% 34%, rgba(110,160,0,.55), rgba(110,160,0,0) 46%), radial-gradient(ellipse at 82% 58%, rgba(80,130,0,.5), rgba(80,130,0,0) 50%), radial-gradient(ellipse at 52% 12%, rgba(255,255,210,.7), rgba(255,255,210,0) 42%)" }}>
          <div style={{ position: "absolute", left: "0", right: "0", top: v.rowTop, bottom: v.rowBot, display: "flex", alignItems: "center", justifyContent: "center", gap: "5cqw", padding: `0 ${v.padX}`, color: "#111111" }}>
            <div style={{ position: "relative", fontFamily: "'Anton', sans-serif", textTransform: "uppercase", lineHeight: ".84", fontSize: "11cqw" }}>
              <div>Baile do</div>
              <div>Futuro</div>
              <svg viewBox="0 0 40 40" className="bn-spin" style={{ position: "absolute", right: "-5cqw", top: "-2.4cqw", width: "7cqw", height: "7cqw" }}>
                <path d="M20 0 L23 15 L38 9 L26 20 L38 31 L23 25 L20 40 L17 25 L2 31 L14 20 L2 9 L17 15 Z" fill="#111111" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.1cqw", letterSpacing: ".12em" }}>VOL.03 — CONVIDADA ESPECIAL</div>
              <div style={{ fontFamily: "'Anton', sans-serif", textTransform: "uppercase", fontSize: "5.4cqw", lineHeight: ".95", margin: ".7cqw 0 .9cqw" }}>MC Luana K</div>
              <div style={{ fontWeight: "700", fontSize: "1.55cqw" }}>31 de outubro · Galpão Elevado, SP</div>
              <span style={{ display: "inline-flex", marginTop: "1.6cqw", padding: "1.05cqw 2.1cqw", borderRadius: "999px", background: "#111111", color: "#CBFF3D", fontWeight: "700", fontSize: "1.35cqw", textTransform: "uppercase", letterSpacing: ".03em" }}>Compre seu ingresso</span>
            </div>
          </div>
        </div>

      </>)}
      {/* SINTONIA 98.7 */}
      {v.is.sintonia && (<>
        <div style={{ position: "absolute", inset: "0", backgroundColor: "#0D1878", backgroundImage: "radial-gradient(ellipse at 50% -6%, rgba(125,249,255,.42), rgba(125,249,255,0) 52%), conic-gradient(from 150deg at 50% -12%, rgba(255,255,255,0) 0deg, rgba(125,249,255,.16) 8deg, rgba(255,255,255,0) 16deg, rgba(255,255,255,0) 26deg, rgba(255,255,255,.12) 32deg, rgba(255,255,255,0) 40deg, rgba(255,255,255,0) 50deg, rgba(125,249,255,.14) 56deg, rgba(255,255,255,0) 64deg)" }}>
          <div style={{ position: "absolute", inset: "0", background: "repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 1px, rgba(255,255,255,0) 1px 4px)" }} />
          <div style={{ position: "absolute", left: "0", right: "0", top: v.rowTop, bottom: v.rowBot, display: "flex", alignItems: "center", justifyContent: "center", gap: "5cqw", padding: `0 ${v.padX}`, color: "#FFFFFF" }}>
            <div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: "900", letterSpacing: "-.05em", lineHeight: "1", fontSize: "5.4cqw" }}>SINTONIA</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: "700", letterSpacing: "-.07em", lineHeight: ".95", fontSize: "11cqw", color: "#7DF9FF", textShadow: "0 0 3cqw rgba(125,249,255,.45)" }}>98.7</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.1cqw", letterSpacing: ".12em" }}>● AO VIVO NA ARENA</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: "900", letterSpacing: "-.04em", fontSize: "2.6cqw", lineHeight: "1.05", margin: ".8cqw 0 .9cqw" }}>MC Jade Fortal</div>
              <div style={{ fontWeight: "600", fontSize: "1.5cqw", opacity: ".85" }}>+ Os Brabos do Piseiro · DJ Litoral</div>
              <div style={{ fontWeight: "700", fontSize: "1.55cqw", marginTop: ".4cqw" }}>15 de novembro · Arena Norte, Fortaleza</div>
              <span style={{ display: "inline-flex", marginTop: "1.6cqw", padding: "1.05cqw 2.1cqw", borderRadius: "999px", background: "#7DF9FF", color: "#0D1878", fontWeight: "700", fontSize: "1.35cqw", textTransform: "uppercase", letterSpacing: ".03em" }}>Compre seu ingresso</span>
            </div>
          </div>
          <div style={{ position: "absolute", left: "7cqw", right: "7cqw", bottom: `calc(3cqw + ${v.lift})`, height: "5.4cqw", border: ".12cqw solid rgba(255,255,255,.5)", borderRadius: ".6cqw" }}>
            <div style={{ position: "absolute", left: "1.2cqw", right: "1.2cqw", bottom: "0", height: "1.8cqw", background: "repeating-linear-gradient(90deg, rgba(255,255,255,.75) 0 .1cqw, rgba(255,255,255,0) .1cqw .8cqw)" }} />
            <div style={{ position: "absolute", left: "1.2cqw", right: "1.2cqw", top: ".8cqw", display: "flex", justifyContent: "space-between", fontFamily: "'Space Mono', monospace", fontSize: ".95cqw", color: "rgba(255,255,255,.8)" }}>
              <span>88</span>
              <span>92</span>
              <span>96</span>
              <span>100</span>
              <span>104</span>
              <span>108</span>
            </div>
            <div className="bn-needle" style={{ position: "absolute", left: "54.5%", top: "-.8cqw", bottom: "-.8cqw", width: ".3cqw", background: "#FF3B30", boxShadow: "0 0 1.4cqw rgba(255,59,48,.85)" }} />
          </div>
        </div>

      </>)}
      {/* TERREIRO ELETRÔNICO */}
      {v.is.terreiro && (<>
        <div style={{ position: "absolute", inset: "0", backgroundColor: "#C4532B", backgroundImage: "radial-gradient(ellipse at 30% 40%, rgba(240,150,70,.55), rgba(240,150,70,0) 50%), radial-gradient(ellipse at 85% 70%, rgba(110,30,10,.5), rgba(110,30,10,0) 50%)" }}>
          <div className="bn-spin-slow" style={{ position: "absolute", left: "4cqw", top: "50%", width: "56cqw", height: "56cqw", marginTop: "-32cqw", borderRadius: "50%", background: "repeating-conic-gradient(#E9A23B 0deg 5deg, rgba(233,162,59,0) 5deg 15deg)", WebkitMaskImage: "radial-gradient(circle, #000 30%, transparent 68%)", maskImage: "radial-gradient(circle, #000 30%, transparent 68%)", opacity: ".75" }} />
          <div style={{ position: "absolute", left: "0", right: "0", top: v.rowTop, bottom: v.rowBot, display: "flex", alignItems: "center", justifyContent: "center", gap: "5cqw", padding: `0 ${v.padX}`, color: "#F2E3C6" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", letterSpacing: "-.045em", lineHeight: ".9" }}>
              <div style={{ fontSize: "5cqw", whiteSpace: "nowrap" }}>TERREIRO</div>
              <div style={{ fontSize: "3.62cqw", whiteSpace: "nowrap" }}>ELETRÔNICO</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.1cqw", letterSpacing: ".12em" }}>AFRO HOUSE · AMAPIANO · PERCUSSÃO</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", letterSpacing: "-.035em", fontSize: "2.4cqw", lineHeight: "1", margin: ".8cqw 0 .9cqw", whiteSpace: "nowrap" }}>Ayô Bantu &amp; Nkiru</div>
              <div style={{ fontWeight: "700", fontSize: "1.55cqw" }}>28 de novembro · Pelourinho, Salvador</div>
              <span style={{ display: "inline-flex", marginTop: "1.6cqw", padding: "1.05cqw 2.1cqw", borderRadius: "999px", background: "#F2E3C6", color: "#7A2A14", fontWeight: "700", fontSize: "1.35cqw", textTransform: "uppercase", letterSpacing: ".03em" }}>Compre seu ingresso</span>
            </div>
          </div>
          <div style={{ position: "absolute", left: "0", right: "0", bottom: v.lift, height: "3.2cqw", background: "conic-gradient(from -45deg at 50% 100%, #8C3119 0deg 90deg, rgba(140,49,25,0) 90deg) 0 0 / 3.2cqw 3.2cqw" }} />
          <div style={{ position: "absolute", left: "0", right: "0", bottom: `calc(3.2cqw + ${v.lift})`, height: ".5cqw", background: "#F2E3C6", opacity: ".5" }} />
        </div>

      </>)}
      {/* MAREA FESTIVAL */}
      {v.is.marea && (<>
        <div style={{ position: "absolute", inset: "0", backgroundColor: "#F3E7D3", backgroundImage: "radial-gradient(ellipse at 70% 30%, rgba(255,190,120,.55), rgba(255,190,120,0) 50%)" }}>
          <div style={{ position: "absolute", left: "56cqw", top: "6cqw", width: "30cqw", height: "30cqw", borderRadius: "50%", background: "linear-gradient(to bottom, #FF5B1F 0 52%, rgba(255,91,31,0) 52% 57%, #FF5B1F 57% 64%, rgba(255,91,31,0) 64% 70%, #FF5B1F 70% 76%, rgba(255,91,31,0) 76% 83%, #FF5B1F 83% 87%, rgba(255,91,31,0) 87%)" }} />
          <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "38%", background: "#1E35C8" }} />
          <svg viewBox="0 0 600 40" preserveAspectRatio="none" style={{ position: "absolute", left: "0", bottom: `calc(4cqw + ${v.lift})`, width: "100%", height: "5cqw" }}>
            <path d="M0 12 Q 25 4 50 12 T 100 12 T 150 12 T 200 12 T 250 12 T 300 12 T 350 12 T 400 12 T 450 12 T 500 12 T 550 12 T 600 12" fill="none" stroke="#F3E7D3" strokeOpacity=".45" strokeWidth="1.5" />
            <path d="M0 30 Q 25 22 50 30 T 100 30 T 150 30 T 200 30 T 250 30 T 300 30 T 350 30 T 400 30 T 450 30 T 500 30 T 550 30 T 600 30" fill="none" stroke="#F3E7D3" strokeOpacity=".25" strokeWidth="1.5" />
          </svg>
          <div style={{ position: "absolute", left: "0", right: "0", top: v.rowTop, bottom: v.rowBot, display: "flex", alignItems: "center", justifyContent: "center", gap: "5cqw", padding: `0 ${v.padX}`, color: "#1E35C8" }}>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.1cqw", letterSpacing: ".12em" }}>FESTIVAL — ED.02</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: "15cqw", lineHeight: ".9", letterSpacing: "-.035em" }}>Marea</div>
            </div>
            <div style={{ background: "rgba(243,231,211,.92)", padding: "1.6cqw 2cqw", borderRadius: "1.2cqw" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.1cqw", letterSpacing: ".12em" }}>21—22 NOV · FLORIPA</div>
              <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: "3.6cqw", lineHeight: "1", letterSpacing: "-.02em", margin: ".8cqw 0 .9cqw" }}>CÉU ABERTO</div>
              <div style={{ fontWeight: "600", fontSize: "1.5cqw" }}>Lia Moreno · Coletivo Maré Alta · Dunas</div>
              <span style={{ display: "inline-flex", marginTop: "1.6cqw", padding: "1.05cqw 2.1cqw", borderRadius: "999px", background: "#1E35C8", color: "#FFFFFF", fontWeight: "700", fontSize: "1.35cqw", textTransform: "uppercase", letterSpacing: ".03em" }}>Compre seu ingresso</span>
            </div>
          </div>
        </div>

      </>)}
      {/* SUBSOLO 004 */}
      {v.is.subsolo && (<>
        <div style={{ position: "absolute", inset: "0", backgroundColor: "#0B0B0B", backgroundImage: "linear-gradient(rgba(255,255,255,.07) 1px, rgba(255,255,255,0) 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, rgba(255,255,255,0) 1px)", backgroundSize: "5cqw 5cqw", color: "#EDEDED" }}>
          <div style={{ position: "absolute", right: "5cqw", top: "50%", transform: "translateY(-50%)", fontFamily: "'Anton', sans-serif", fontSize: "36cqw", lineHeight: ".8", color: "transparent", WebkitTextStroke: ".2cqw #EDEDED", letterSpacing: "-.02em" }}>004</div>
          <div style={{ position: "absolute", left: "60cqw", top: "14cqw", width: "3.4cqw", height: "3.4cqw", borderRadius: "50%", background: "#FF3B1F", boxShadow: "0 0 3cqw rgba(255,59,31,.6)" }} />
          <div style={{ position: "absolute", left: "6cqw", top: "50%", transform: "translateY(-50%)", fontFamily: "'Space Mono', monospace" }}>
            <div style={{ fontSize: "2cqw", letterSpacing: ".4em" }}>SUBSOLO</div>
            <div style={{ fontSize: "3cqw", fontWeight: "700", lineHeight: "1.25", marginTop: "3cqw" }}>
VERA KASSAB              <br />
RUÍDO BRANCO              <br />
OTO b2b NARA            </div>
            <div style={{ fontSize: "1.2cqw", letterSpacing: ".1em", lineHeight: "1.7", marginTop: "3cqw", color: "#A6A6A6" }}>
SEX 30.10 — 23:59 → 08:00              <br />
LOCAL REVELADO 24H ANTES · SEM FOTOS            </div>
          </div>
        </div>

      </>)}
      {/* CYPHER NACIONAL */}
      {v.is.cypher && (<>
        <div style={{ position: "absolute", inset: "0", background: "#ECEAE3", color: "#111111" }}>
          <div style={{ position: "absolute", right: "-6cqw", top: "50%", width: "50cqw", height: "50cqw", marginTop: "-25cqw", backgroundImage: "radial-gradient(#111111 28%, rgba(17,17,17,0) 31%)", backgroundSize: "1.4cqw 1.4cqw", WebkitMaskImage: "radial-gradient(circle, #000 18%, transparent 68%)", maskImage: "radial-gradient(circle, #000 18%, transparent 68%)" }} />
          <div style={{ position: "absolute", left: "-2cqw", top: "13cqw", background: "#111111", color: "#ECEAE3", transform: "rotate(-4deg)", padding: "1cqw 5cqw .6cqw 6cqw", fontFamily: "'Archivo Black', sans-serif", fontSize: "12cqw", lineHeight: "1", letterSpacing: "-.045em" }}>CYPHER</div>
          <div style={{ position: "absolute", left: "26cqw", top: "29cqw", background: "#E3261B", color: "#ECEAE3", transform: "rotate(2.5deg)", padding: ".6cqw 2.4cqw", fontFamily: "'Archivo Black', sans-serif", fontSize: "6cqw", lineHeight: "1.05" }}>NACIONAL</div>
          <div style={{ position: "absolute", left: "5cqw", top: "9cqw", width: "10cqw", height: "3cqw", background: "rgba(214,198,150,.78)", transform: "rotate(-24deg)" }} />
          <div style={{ position: "absolute", left: "6cqw", bottom: "6cqw" }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: "6.4cqw", lineHeight: ".9" }}>DOM 08.11 — 18H</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.3cqw", letterSpacing: ".06em", marginTop: "1.4cqw" }}>FINAL DE BATALHAS · 16 MCs · VIADUTO SANTA TEREZA · BH</div>
          </div>
        </div>

      </>)}
      {/* NOITE ÁCIDA */}
      {v.is.noite && (<>
        <div style={{ position: "absolute", inset: "0", background: "#170A2B", color: "#E6E3F2" }}>
          <div style={{ position: "absolute", right: "12cqw", top: "50%", width: "34cqw", height: "34cqw", marginTop: "-19cqw", borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #FFFFFF 0%, #E6E3F2 7%, #A49EC0 26%, #4B3F6E 54%, #1C1233 80%)" }} />
          <div style={{ position: "absolute", right: "4cqw", top: "22cqw", width: "50cqw", height: "9cqw", borderRadius: "50%", border: ".5cqw solid rgba(230,227,242,.85)", transform: "rotate(-12deg)" }} />
          <div style={{ position: "absolute", right: "6cqw", top: "33cqw", width: "13cqw", height: "13cqw", borderRadius: "50%", background: "radial-gradient(circle at 30% 28%, #FFFFFF 0%, #FFC2F1 12%, #FF4FD8 42%, #6A1265 82%)" }} />
          <div style={{ position: "absolute", left: "6cqw", top: "50%", transform: "translateY(-50%)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".14em" }}>TRANCE · HARD GROOVE · BREAKS</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: "900", fontSize: "8.6cqw", lineHeight: ".92", letterSpacing: "-.05em", color: "#FF4FD8", marginTop: "2cqw" }}>
NOITE              <br />
ÁCIDA            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".1em", marginTop: "2.4cqw" }}>SEX 06.11 · 23H — CAIS MAUÁ · POA</div>
          </div>
        </div>

      </>)}
      {/* LUZ DE CHÃO */}
      {v.is.luz && (<>
        <div style={{ position: "absolute", inset: "0", background: "#F1EEE6", color: "#111111" }}>
          <div style={{ position: "absolute", left: "52cqw", top: "50%", width: "30cqw", height: "30cqw", marginTop: "-19cqw", borderRadius: "50%", border: ".14cqw solid #111111" }} />
          <div style={{ position: "absolute", left: "66.9cqw", top: "9cqw", width: ".14cqw", height: "34cqw", background: "rgba(17,17,17,.35)" }} />
          <div style={{ position: "absolute", left: "46cqw", top: "43cqw", width: "42cqw", height: ".3cqw", background: "#FFCB66", boxShadow: "0 0 3cqw 1cqw rgba(255,184,64,.6), 0 0 .8cqw .2cqw rgba(255,214,130,.9)" }} />
          <div style={{ position: "absolute", left: "75cqw", top: "39cqw", width: ".9cqw", height: "4cqw", background: "#111111", borderRadius: ".45cqw .45cqw 0 0" }} />
          <div style={{ position: "absolute", left: "6cqw", top: "50%", transform: "translateY(-50%)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".12em" }}>Nº 06 — INSTALAÇÃO IMERSIVA</div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: "10cqw", lineHeight: ".9", letterSpacing: "-.03em", marginTop: "1.6cqw" }}>
Luz              <br />
              <em>de chão</em>
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".08em", lineHeight: "1.7", marginTop: "2.4cqw" }}>
26.10 — 30.11.26 · TER—DOM              <br />
CASA TANGENTE · SÃO PAULO            </div>
          </div>
        </div>

      </>)}
      {/* ORQUESTRA DE RUA */}
      {v.is.orquestra && (<>
        <div style={{ position: "absolute", inset: "0", background: "#5A0F16", color: "#F3E3C8" }}>
          <div style={{ position: "absolute", left: "0", right: "0", top: "20cqw", height: "14cqw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={{ display: "block", height: ".18cqw", background: "rgba(243,227,200,.4)" }} />
            <span style={{ display: "block", height: ".18cqw", background: "rgba(243,227,200,.4)" }} />
            <span style={{ display: "block", height: ".18cqw", background: "rgba(243,227,200,.4)" }} />
            <span style={{ display: "block", height: ".18cqw", background: "rgba(243,227,200,.4)" }} />
            <span style={{ display: "block", height: ".18cqw", background: "rgba(243,227,200,.4)" }} />
          </div>
          <div style={{ position: "absolute", left: "70cqw", top: "22cqw", width: "2.6cqw", height: "2cqw", borderRadius: "50%", background: "#F3E3C8", transform: "rotate(-20deg)" }} />
          <div style={{ position: "absolute", left: "78cqw", top: "27cqw", width: "2.6cqw", height: "2cqw", borderRadius: "50%", background: "#F2B544", transform: "rotate(-20deg)" }} />
          <div style={{ position: "absolute", left: "86cqw", top: "18.6cqw", width: "2.6cqw", height: "2cqw", borderRadius: "50%", background: "#F3E3C8", transform: "rotate(-20deg)" }} />
          <div style={{ position: "absolute", left: "5cqw", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Serif Display', serif", fontSize: "34cqw", lineHeight: ".8", letterSpacing: "-.05em", color: "#F2B544" }}>14</div>
          <div style={{ position: "absolute", left: "44cqw", top: "50%", transform: "translateY(-50%)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".12em" }}>NOVEMBRO · SÁB · 20H</div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: "7.4cqw", lineHeight: ".9", textTransform: "uppercase", marginTop: "1.4cqw" }}>
Orquestra              <br />
de rua            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".08em", marginTop: "2cqw" }}>60 MÚSICOS · MARINA DA GLÓRIA · RJ</div>
          </div>
        </div>

      </>)}
      {/* MESA LONGA */}
      {v.is.mesa && (<>
        <div style={{ position: "absolute", inset: "0", background: "#E8E2D2", color: "#1E3A2B" }}>
          <div style={{ position: "absolute", left: "66cqw", top: "13cqw", width: "3cqw", height: "3cqw", borderRadius: "50%", background: "#E8743B" }} />
          <div style={{ position: "absolute", left: "36cqw", right: "0", top: "16cqw", height: ".14cqw", background: "rgba(30,58,43,.35)" }} />
          <div style={{ position: "absolute", left: "40cqw", right: "0", top: "16cqw", bottom: "0", background: "#1E3A2B", clipPath: "polygon(46% 0, 54% 0, 92% 100%, 8% 100%)" }} />
          <div style={{ position: "absolute", left: "66.4cqw", top: "20cqw", width: "1cqw", height: "1cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "68.6cqw", top: "20cqw", width: "1cqw", height: "1cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "63.4cqw", top: "27cqw", width: "1.8cqw", height: "1.8cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "70.8cqw", top: "27cqw", width: "1.8cqw", height: "1.8cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "59.6cqw", top: "36cqw", width: "2.8cqw", height: "2.8cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "73.6cqw", top: "36cqw", width: "2.8cqw", height: "2.8cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "54.6cqw", top: "47cqw", width: "4cqw", height: "4cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "77.4cqw", top: "47cqw", width: "4cqw", height: "4cqw", borderRadius: "50%", background: "#E8E2D2" }} />
          <div style={{ position: "absolute", left: "6cqw", top: "50%", transform: "translateY(-50%)" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".12em" }}>Nº 08 — 120 LUGARES</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: "10cqw", lineHeight: ".86", letterSpacing: "-.03em", marginTop: "1.6cqw" }}>
Mesa              <br />
              <em>Longa</em>
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "1.2cqw", letterSpacing: ".08em", lineHeight: "1.7", marginTop: "2.4cqw" }}>
JANTAR A SEIS MÃOS + DJ SET              <br />
SEX 13.11 · ROOFTOP BELA VISTA · SP            </div>
          </div>
        </div>

      </>)}
      {/* CALOURADA SEM FIM */}
      {v.is.calourada && (<>
        <div style={{ position: "absolute", inset: "0", background: "repeating-conic-gradient(from 0deg at 50% 60%, #2C55F5 0deg 6deg, #3B63FF 6deg 12deg)", color: "#FFFFFF" }}>
          <div style={{ position: "absolute", left: "6cqw", top: "50%", transform: "translateY(-50%) rotate(-5deg)", fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "11cqw", lineHeight: ".86", letterSpacing: "-.04em", color: "#FFE04A", textShadow: ".5cqw .5cqw 0 #111111" }}>
CALOURADA            <br />
SEM FIM          </div>
          <div style={{ position: "absolute", right: "8cqw", top: "8cqw", width: "15cqw", height: "15cqw", borderRadius: "50%", background: "#FF3D6E", display: "grid", placeItems: "center", transform: "rotate(12deg)", fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "3cqw", lineHeight: ".95", textAlign: "center", boxShadow: ".4cqw .4cqw 0 #111111" }}>
OPEN            <br />
ATÉ 1H          </div>
          <div style={{ position: "absolute", right: "14cqw", bottom: "6cqw", width: "18cqw", height: "18cqw", background: "#FFE04A", clipPath: "polygon(50% 0, 59.8% 13.3%, 75% 6.7%, 76.9% 23.1%, 93.3% 25%, 86.7% 40.2%, 100% 50%, 86.7% 59.8%, 93.3% 75%, 76.9% 76.9%, 75% 93.3%, 59.8% 86.7%, 50% 100%, 40.2% 86.7%, 25% 93.3%, 23.1% 76.9%, 6.7% 75%, 13.3% 59.8%, 0 50%, 13.3% 40.2%, 6.7% 25%, 23.1% 23.1%, 25% 6.7%, 40.2% 13.3%)", display: "grid", placeItems: "center", transform: "rotate(-10deg)" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "2.1cqw", lineHeight: ".95", color: "#111111", textAlign: "center" }}>
BATERIA              <br />
AO VIVO            </span>
          </div>
          <div style={{ position: "absolute", left: "6cqw", bottom: "5cqw", fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.2cqw", letterSpacing: ".06em" }}>QUI 29.10 · 22H · ESPAÇO LAGO · BSB</div>
        </div>

      </>)}
      {/* GUITARRA MOLHADA */}
      {v.is.guitarra && (<>
        <div style={{ position: "absolute", inset: "0", backgroundColor: "#F5EFE3", backgroundImage: "radial-gradient(rgba(17,17,17,.08) .6px, rgba(17,17,17,0) .8px)", backgroundSize: ".7cqw .7cqw", color: "#0078BF" }}>
          <div style={{ position: "absolute", right: "-4cqw", top: "50%", width: "40cqw", height: "40cqw", marginTop: "-20cqw", borderRadius: "50%", background: "#FF48B0", mixBlendMode: "multiply", opacity: ".92" }} />
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ position: "absolute", left: "0", bottom: "8cqw", width: "100%", height: "12cqw", mixBlendMode: "multiply" }}>
            <path d="M0 8 Q 6 2 12.5 8 T 25 8 T 37.5 8 T 50 8 T 62.5 8 T 75 8 T 87.5 8 T 100 8" fill="none" stroke="#0078BF" strokeWidth=".8" />
            <path d="M0 20 Q 6 14 12.5 20 T 25 20 T 37.5 20 T 50 20 T 62.5 20 T 75 20 T 87.5 20 T 100 20" fill="none" stroke="#0078BF" strokeWidth=".8" />
            <path d="M0 32 Q 6 26 12.5 32 T 25 32 T 37.5 32 T 50 32 T 62.5 32 T 75 32 T 87.5 32 T 100 32" fill="none" stroke="#0078BF" strokeWidth=".8" />
          </svg>
          <div style={{ position: "absolute", left: "6cqw", top: "8cqw", fontFamily: "'Archivo Black', sans-serif", fontSize: "9cqw", lineHeight: ".9", letterSpacing: "-.04em", color: "#FF48B0", mixBlendMode: "multiply" }}>
GUITARRA            <br />
MOLHADA          </div>
          <div style={{ position: "absolute", left: "6.5cqw", top: "8.4cqw", fontFamily: "'Archivo Black', sans-serif", fontSize: "9cqw", lineHeight: ".9", letterSpacing: "-.04em", color: "#0078BF", mixBlendMode: "multiply" }}>
GUITARRA            <br />
MOLHADA          </div>
          <div style={{ position: "absolute", left: "6cqw", top: "29cqw", fontFamily: "'Archivo Black', sans-serif", fontSize: "2.6cqw", lineHeight: "1.15", mixBlendMode: "multiply" }}>OS AFOGADOS · TERRA BRUTA · LÍRIO</div>
          <div style={{ position: "absolute", left: "6cqw", bottom: "3.4cqw", fontFamily: "'Space Mono', monospace", fontWeight: "700", fontSize: "1.2cqw", letterSpacing: ".06em" }}>SÁB 07.11 — 21H · GALPÃO 17 · RECIFE</div>
        </div>

      </>)}
      <div style={{ position: "absolute", inset: "0", pointerEvents: "none", opacity: ".2", mixBlendMode: "overlay", backgroundImage: "radial-gradient(rgba(255,255,255,.9) .6px, rgba(255,255,255,0) 1px), radial-gradient(rgba(0,0,0,.9) .6px, rgba(0,0,0,0) 1px)", backgroundSize: "3px 3px, 4px 4px", backgroundPosition: "0 0, 1px 2px" }} />
    </div>
  </>);
}
