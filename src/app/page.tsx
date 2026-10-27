import { listLiveEvents } from "@/lib/data/events";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [events, user] = await Promise.all([listLiveEvents(), getSessionUser()]);
  return (
    <main className="wrap" style={{ padding: 40 }}>
      <h1 className="disp">Onde</h1>
      <p>{events.length} eventos ao vivo. Usuário: {user?.email ?? "anônimo"}</p>
      <ul>{events.map((e) => <li key={e.id}>{e.title} — {e.dateNice} — {e.city}</li>)}</ul>
    </main>
  );
}
