import type { Metadata } from "next";
import { ContaSeguranca } from "@/components/conta/seguranca";
import { ContaShell } from "@/components/conta/shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listDevices, loginMethods } from "@/lib/actions/conta";
import { contaUser, listSecurityEvents } from "@/lib/data/conta";
import { maskEmail, mfaSettings } from "@/lib/mfa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacidade e segurança", robots: { index: false } };

/** "Mac · Chrome" a partir do user-agent (mesma regra dos aparelhos conectados). */
function ua(s: string | null) {
  if (!s) return "";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  const br = /Edg\//.test(s) ? "Edge" : /CriOS|Chrome\//.test(s) ? "Chrome" : /FxiOS|Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ");
}

export default async function SegurancaPage() {
  const { user, profile } = await contaUser("/conta/seguranca");
  const [mfa, devices, events, login] = await Promise.all([mfaSettings(user.id), listDevices().catch(() => []), listSecurityEvents(user.id), loginMethods().catch(() => ({ password: true, google: false }))]);
  const name = profile?.name || user.name || "";
  const mfaTo = mfa.method === "email" ? maskEmail(mfa.email || user.email) : null;
  return (
    <div className="pg-conta">
      <SiteHeader user={user} variant="default" activePath="/conta" />
      <ContaShell name={name} email={user.email} avatar={profile?.avatarUrl ?? user.image ?? null} mfa={!!mfa.method}>
        <ContaSeguranca
          mfa={{ method: mfa.method, to: mfaTo, recoveryLeft: mfa.recoveryLeft }}
          login={login}
          email={user.email}
          devices={devices}
          activity={events.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, ip: e.ip, device: ua(e.userAgent), at: e.createdAt.toISOString() }))}
          marketing={!!profile?.marketingOptIn}
        />
      </ContaShell>
      <SiteFooter />
    </div>
  );
}
