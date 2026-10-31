import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { clearAttempts, reserveAttempt } from "@/lib/attempts";

/*
 * Freio próprio do login e do cadastro (SEC-300). O Neon Auth recebe os pedidos do nosso servidor e não vê o IP de
 * quem tenta, então o limite dele (se houver) não protege uma conta em particular. Aqui, antes de chamar o Neon Auth:
 *   - login: 5 tentativas a cada 15 min por e-mail (contador atômico, reservado antes; o login certo zera);
 *   - cadastro: 20 por hora por IP (IPv6 contado pela rede /64, que é o que uma pessoa troca à vontade).
 * A mensagem do login travado é a mesma com ou sem conta (não revela quais e-mails existem). O Turnstile continua
 * na frente; este freio vale também quando ele estiver desligado. Cada trava acionada vai para o log (sem e-mail
 * nem IP em claro).
 */

export const LOGIN_PER_EMAIL = 5;
const LOGIN_WINDOW = 15 * 60;
export const SIGNUP_PER_IP = 20;

export const LOGIN_LOCKED = "Muitas tentativas de entrar com este e-mail. Espere 15 minutos ou use “Esqueci a senha”.";
export const SIGNUP_LOCKED = "Muitos cadastros feitos desta rede em pouco tempo. Tente de novo mais tarde.";
const DOWN = "Não foi possível entrar agora. Tente de novo em instantes.";

const h = (s: string) => createHash("sha256").update(s).digest("base64url").slice(0, 32);
const emailKey = (email: string) => `login:${h(email.trim().toLowerCase())}`;

/** Chave de IP para limites: IPv4 inteiro; IPv6 pelo prefixo /64 (SEC-310). */
export function ipKey(ip: string) {
  const v = ip.trim().toLowerCase();
  if (!v.includes(":")) return v;
  const [head, tail = ""] = v.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const full = v.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return `${full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

async function callerIp() {
  const hd = await headers();
  return (hd.get("cf-connecting-ip") ?? hd.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
}

const abuse = (op: string, key: string) => console.warn(JSON.stringify({ k: "abuse", op, key: h(key).slice(0, 12) }));

/** Reserva uma tentativa de login para o e-mail; devolve a mensagem de recusa ou null. */
export async function loginAttempt(email: string): Promise<string | null> {
  const key = emailKey(email);
  try {
    if ((await reserveAttempt(key, "login", LOGIN_PER_EMAIL, LOGIN_WINDOW)).ok) return null;
  } catch (e) {
    console.error("login guard", e);
    return DOWN;
  }
  abuse("login", key);
  return LOGIN_LOCKED;
}

/** Login certo: zera as tentativas do e-mail. */
export async function loginSucceeded(email: string) {
  await clearAttempts(emailKey(email), "login").catch(() => {});
}

/** Reserva um cadastro para o IP de quem chama; devolve a mensagem de recusa ou null. */
export async function signupAttempt(): Promise<string | null> {
  const key = `ip:${ipKey(await callerIp())}`;
  try {
    if ((await reserveAttempt(key, "signup", SIGNUP_PER_IP, 3600)).ok) return null;
  } catch (e) {
    console.error("signup guard", e);
    return DOWN;
  }
  abuse("signup", key);
  return SIGNUP_LOCKED;
}
