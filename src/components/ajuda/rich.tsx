import Link from "next/link";
import type { HelpBlock } from "@/lib/help/articles";
import { IcAlert, IcInfo } from "./icons";

/** Texto com **negrito** e [rótulo](/caminho) → nós React. Links internos usam <Link>. */
export function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else {
      const href = m[3];
      out.push(href.startsWith("/")
        ? <Link key={k++} href={href}>{m[2]}</Link>
        : <a key={k++} href={href} target="_blank" rel="noreferrer">{m[2]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Corpo de um artigo da central. */
export function ArticleBody({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p": return <p key={i}><Rich text={b.x} /></p>;
          case "h": return <h2 key={i}>{b.x}</h2>;
          case "ul": return <ul key={i}>{b.x.map((x, j) => <li key={j}><Rich text={x} /></li>)}</ul>;
          case "ol": return <ol key={i}>{b.x.map((x, j) => <li key={j}><Rich text={x} /></li>)}</ol>;
          case "tip": return <div className="hp-note" key={i}><IcInfo /><p><Rich text={b.x} /></p></div>;
          case "warn": return <div className="hp-note warn" key={i}><IcAlert /><p><Rich text={b.x} /></p></div>;
        }
      })}
    </>
  );
}
