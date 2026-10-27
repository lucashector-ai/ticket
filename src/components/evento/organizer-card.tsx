"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { toggleFollow } from "@/lib/actions/social";
import type { OrganizerInfo } from "./types";

export function OrganizerCard({ o, eventSlug, loggedIn, initialFollowing }: { o: OrganizerInfo; eventSlug: string; loggedIn: boolean; initialFollowing: boolean }) {
  const router = useRouter();
  const { flash } = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();
  const loginUrl = `/entrar?next=${encodeURIComponent(`/eventos/${eventSlug}`)}`;

  const onFollow = () => {
    if (!loggedIn) { flash("Entre na sua conta para seguir produtores."); router.push(loginUrl); return; }
    const next = !following;
    setFollowing(next);
    start(async () => {
      const r = await toggleFollow("organizer", o.id);
      if (!r.auth) { setFollowing(false); flash("Entre na sua conta para seguir produtores."); router.push(loginUrl); return; }
      setFollowing(r.following);
      flash(r.following ? `Você segue ${o.name}` : `Você deixou de seguir ${o.name}`);
    });
  };

  const onContact = () => {
    if (o.email) { window.location.href = `mailto:${o.email}?subject=${encodeURIComponent("Dúvida sobre evento no Tickets Win")}`; return; }
    flash("Contato direto com o produtor chega na próxima fase.");
  };

  return (
    <div className="blk-s">
      <h2>Quem organiza</h2>
      <div className="pr2">
        <div className="pr2-top">
          <Link className="prod-av" href={`/produtor/${o.slug}`} style={{ background: "#111111", color: "#D3F55B", overflow: "hidden" }} aria-label={`Página de ${o.name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {o.avatarUrl ? <img src={o.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : o.initials}
          </Link>
          <div className="pr2-id">
            <Link href={`/produtor/${o.slug}`}><b>{o.name}</b></Link>
            {o.verified && (
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.5-1 3.1 1 3.1-2.9 1.5-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.5 1-3.1-1-3.1 2.9-1.5.9-3.1 3.2.4z" fill="#111111" />
                  <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#D3F55B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Produtor verificado
              </span>
            )}
          </div>
          <button className={following ? "prod-b on" : "prod-b"} type="button" onClick={onFollow} aria-pressed={following} disabled={pending}>
            {following ? "Seguindo" : "Seguir"}
          </button>
        </div>
        {o.bio && <p className="pr2-bio">{o.bio}</p>}
        <div className="pr2-a">
          <button className="pr2-l" type="button" onClick={onContact}>Falar com o produtor</button>
          <Link className="pr2-l" href={`/produtor/${o.slug}`}>Ver página do produtor</Link>
        </div>
      </div>
    </div>
  );
}
