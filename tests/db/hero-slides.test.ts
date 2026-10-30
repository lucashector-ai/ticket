import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Banner livre do carrossel da home (tabela hero_slides): a central cria, edita, liga/desliga, ordena junto com os
 * eventos e apaga; a home lista só os ligados. O banco também recusa link/arte fora da regra (CHECK).
 * A ordem dos eventos do banner no banco de teste é guardada antes e devolvida no fim.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/mfa", async (orig) => ({ ...(await orig<typeof import("@/lib/mfa")>()), logSecurity: async () => {} }));
const admin = { secure: true };
vi.mock("@/lib/admin", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin")>()),
  adminUser: async () => ({ id: "qa-test-admin", email: "equipe@ticketswin.com.br", name: "Equipe", secure: admin.secure }),
}));

let D: typeof import("@/db"), A: typeof import("@/lib/actions/admin"), H: typeof import("@/lib/data/hero"), L: typeof import("@/lib/admin");
const slides: string[] = [], events: string[] = [];
let heroBefore: { id: string; heroOrder: number | null }[] = [], posBefore: { id: string; position: number }[] = [], snap = false;
const input = (over: Record<string, unknown> = {}) => ({
  id: null, label: `QA banner ${qaId("s")}`, href: "/produtores", cta: "Crie seu evento", kind: "html" as const,
  html: "<!doctype html><p>qa</p>", image: null, width: 1440, height: 800, bg: "#EDFF3C", active: true, ...over,
});

describe.skipIf(!TEST_DB)("banner livre do carrossel (hero_slides, banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    A = await import("@/lib/actions/admin");
    H = await import("@/lib/data/hero");
    L = await import("@/lib/admin");
    const { db, schema } = D;
    const { isNotNull } = await import("drizzle-orm");
    heroBefore = await db.select({ id: schema.events.id, heroOrder: schema.events.heroOrder }).from(schema.events).where(isNotNull(schema.events.heroOrder));
    posBefore = await db.select({ id: schema.heroSlides.id, position: schema.heroSlides.position }).from(schema.heroSlides);
    snap = true;
  });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { eq, inArray, isNotNull } = await import("drizzle-orm");
    if (slides.length) await db.delete(schema.heroSlides).where(inArray(schema.heroSlides.id, slides));
    if (events.length) await db.delete(schema.events).where(inArray(schema.events.id, events));
    // só devolve a ordem se ela foi guardada (sem a foto, não mexe em nada)
    if (!snap) return;
    await db.update(schema.events).set({ heroOrder: null }).where(isNotNull(schema.events.heroOrder));
    for (const e of heroBefore) await db.update(schema.events).set({ heroOrder: e.heroOrder }).where(eq(schema.events.id, e.id));
    for (const s of posBefore) await db.update(schema.heroSlides).set({ position: s.position }).where(eq(schema.heroSlides.id, s.id));
  });

  it("cria (no fim), edita, desliga: a home só lista os ligados", async () => {
    const r = await A.saveHeroSlide(input());
    expect(r).toMatchObject({ ok: true });
    slides.push(r.id!);
    const row = (await L.adminHeroSlides()).find((s) => s.id === r.id)!;
    const maxBefore = Math.max(0, ...heroBefore.map((e) => e.heroOrder ?? 0), ...posBefore.map((s) => s.position));
    expect(row.position).toBe(maxBefore + 1);
    expect((await H.listHeroSlides()).some((s) => s.id === r.id)).toBe(true);

    expect(await A.saveHeroSlide({ ...input({ id: r.id, label: "QA banner editado", width: 1200, height: 600, active: false }) })).toMatchObject({ ok: true });
    const edited = (await L.adminHeroSlides()).find((s) => s.id === r.id)!;
    expect(edited).toMatchObject({ label: "QA banner editado", width: 1200, height: 600, active: false, position: row.position });
    expect((await H.listHeroSlides()).some((s) => s.id === r.id)).toBe(false);
  });

  it("arte do celular (html_mobile): grava, troca o tamanho, apaga ao esvaziar; padrão 358 × 206", async () => {
    const r = await A.saveHeroSlide(input());
    expect(r).toMatchObject({ ok: true });
    slides.push(r.id!);
    const get = async () => (await H.listHeroSlides()).find((s) => s.id === r.id)!;
    expect(await get()).toMatchObject({ htmlMobile: null, mobileWidth: 358, mobileHeight: 206 });
    expect(await A.saveHeroSlide(input({ id: r.id, htmlMobile: "<p>celular</p>", mobileWidth: 716, mobileHeight: 412 }))).toMatchObject({ ok: true });
    expect(await get()).toMatchObject({ htmlMobile: "<p>celular</p>", mobileWidth: 716, mobileHeight: 412 });
    expect((await L.adminHeroSlides()).find((s) => s.id === r.id)).toMatchObject({ htmlMobile: "<p>celular</p>", mobileWidth: 716 });
    expect(await A.saveHeroSlide(input({ id: r.id, htmlMobile: "" }))).toMatchObject({ ok: true });
    expect(await get()).toMatchObject({ htmlMobile: null, mobileWidth: 358, mobileHeight: 206 });
    expect((await A.saveHeroSlide(input({ id: r.id, htmlMobile: "x".repeat(300_001) }))).error).toMatch(/celular passa de 300 KB/);
    // o banco também recusa (CHECK)
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    await expect(db.update(schema.heroSlides).set({ htmlMobile: "x".repeat(300_001) }).where(eq(schema.heroSlides.id, r.id!))).rejects.toThrow();
    await expect(db.update(schema.heroSlides).set({ mobileWidth: 100 }).where(eq(schema.heroSlides.id, r.id!))).rejects.toThrow();
    await expect(db.update(schema.heroSlides).set({ mobileHeight: 5000 }).where(eq(schema.heroSlides.id, r.id!))).rejects.toThrow();
  });

  it("recusa link de fora, HTML acima de 300 KB e conta sem app autenticador", async () => {
    for (const href of ["//evil.com", "javascript:alert(1)", "http://site.com"]) {
      expect(await A.saveHeroSlide(input({ href }))).toMatchObject({ ok: false });
    }
    expect((await A.saveHeroSlide(input({ html: "x".repeat(300_001) }))).error).toMatch(/300 KB/);
    admin.secure = false;
    try {
      expect((await A.saveHeroSlide(input())).ok).toBe(false);
      expect((await A.setHeroOrder([])).ok).toBe(false);
    } finally { admin.secure = true; }
  });

  it("o banco também recusa link e arte fora da regra (CHECK)", async () => {
    const { db, schema } = D;
    const bad = [
      { label: "x", href: "//evil.com", html: "<p>x</p>" },
      { label: "x", href: "javascript:alert(1)", html: "<p>x</p>" },
      { label: "x", href: "/ok", html: "<p>x</p>", image: "/midia/a.png" },
      { label: "x", href: "/ok", html: null, image: null },
      { label: "x", href: "/ok", html: "<p>x</p>", bg: "red" },
    ];
    for (const v of bad) await expect(db.insert(schema.heroSlides).values(v)).rejects.toThrow();
  });

  it("ordem única com os eventos: banner livre antes do 1º evento; evento fora da lista sai do banner", async () => {
    const { db, schema } = D;
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA banner", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
    events.push(ev.id);
    const r = await A.saveHeroSlide(input({ label: "QA primeiro" }));
    slides.push(r.id!);
    const others = (await L.adminHeroSlides()).filter((s) => s.id !== r.id).map((s) => `s:${s.id}`);
    expect(await A.setHeroOrder([`s:${r.id}`, `e:${ev.id}`, ...others])).toMatchObject({ ok: true });
    const [e1] = await db.select({ o: schema.events.heroOrder }).from(schema.events).where((await import("drizzle-orm")).eq(schema.events.id, ev.id));
    const s1 = (await L.adminHeroSlides()).find((s) => s.id === r.id)!;
    expect(s1.position).toBe(1);
    expect(e1.o).toBe(2);
    // os eventos que estavam no banner e não vieram na lista saíram
    const { isNotNull } = await import("drizzle-orm");
    const left = await db.select({ id: schema.events.id }).from(schema.events).where(isNotNull(schema.events.heroOrder));
    expect(left.map((x) => x.id)).toEqual([ev.id]);
    // id que não existe, repetido ou de outro formato: nada muda
    expect((await A.setHeroOrder([`e:${ev.id}`, `e:${ev.id}`])).ok).toBe(false);
    expect((await A.setHeroOrder(["e:00000000-0000-4000-8000-000000000000"])).ok).toBe(false);
    expect((await A.setHeroOrder(["x"])).ok).toBe(false);
    expect((await L.adminHeroSlides()).find((s) => s.id === r.id)!.position).toBe(1);
  });

  it("apagar", async () => {
    const r = await A.saveHeroSlide(input());
    expect(await A.deleteHeroSlide(r.id!)).toMatchObject({ ok: true });
    expect((await L.adminHeroSlides()).some((s) => s.id === r.id)).toBe(false);
    expect((await A.deleteHeroSlide(r.id!)).ok).toBe(false);
  });
});
