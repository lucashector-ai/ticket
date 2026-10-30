import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * S-05: a central (/tw-central) só vale para e-mail de admin do domínio da Tickets Win, CONFIRMADO,
 * e marca `secure` só com o app autenticador. Sem banco: sessão e 2FA simulados.
 */
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
const mfa: { method: "totp" | "email" | null } = { method: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/mfa", () => ({ mfaSettings: async () => ({ method: mfa.method, email: null, name: null, recoveryLeft: 0 }) }));
vi.mock("@/lib/notify", () => ({ userContact: async () => null }));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/producer-apply", () => ({ CENTRAL_SOURCE: "central", producerStatus: async () => null }));

const admin = (over: Partial<U> = {}): U => ({ id: "u1", email: "equipe@ticketswin.com.br", name: "Equipe", emailVerified: true, ...over });

describe("central admin: quem entra (S-05)", () => {
  beforeEach(() => { process.env.ADMIN_EMAILS = "equipe@ticketswin.com.br,fora@example.com"; session.user = null; mfa.method = null; });

  it("e-mail de admin confirmado entra; secure só com o app autenticador", async () => {
    const { adminUser } = await import("@/lib/admin");
    session.user = admin();
    expect(await adminUser()).toMatchObject({ email: "equipe@ticketswin.com.br", secure: false });
    mfa.method = "email";
    expect((await adminUser())?.secure).toBe(false);
    mfa.method = "totp";
    expect((await adminUser())?.secure).toBe(true);
  });

  it("e-mail de admin sem confirmar não entra (a conta só digitou o e-mail)", async () => {
    const { adminUser } = await import("@/lib/admin");
    session.user = admin({ emailVerified: false });
    mfa.method = "totp";
    expect(await adminUser()).toBeNull();
  });

  it("fora do domínio da Tickets Win não entra, mesmo listado em ADMIN_EMAILS; maiúsculas não enganam; sem sessão não entra", async () => {
    const { adminUser, isAdminEmail } = await import("@/lib/admin");
    session.user = admin({ email: "fora@example.com" });
    expect(await adminUser()).toBeNull();
    expect(isAdminEmail("EQUIPE@TicketsWin.com.br")).toBe(true);
    expect(isAdminEmail("equipe@ticketswin.com.br.evil.com")).toBe(false);
    expect(isAdminEmail("outra@ticketswin.com.br")).toBe(false);
    session.user = null;
    expect(await adminUser()).toBeNull();
  });
});
