import type { TemplateKey } from "@/lib/mail/templates";

/* Miniatura de cada modelo: um e-mail desenhado com retângulos (cabeçalho, blocos, botão). */
const L = (w: number, y: number, h = 5, o = 0.18) => <rect x={14} y={y} width={w} height={h} rx={2.5} fill="#111" opacity={o} />;
const Btn = ({ y }: { y: number }) => <rect x={14} y={y} width={52} height={13} rx={6.5} fill="#111" />;

export function TplArt({ k }: { k: TemplateKey }) {
  let body: React.ReactNode;
  switch (k) {
    case "novo":
      body = <><rect x={14} y={30} width={132} height={44} rx={7} fill="#DCF568" /><path d="M24 64l18-18 14 14 10-8 24 12" stroke="#111" strokeWidth={2} fill="none" opacity={.5} />{L(90, 82, 7, .8)}{L(70, 94)}<Btn y={106} /></>;
      break;
    case "ultimos":
      body = <><rect x={14} y={30} width={132} height={36} rx={7} fill="#111" /><text x={80} y={56} textAnchor="middle" fontSize={20} fontWeight={800} fill="#DCF568" fontFamily="Inter,sans-serif">3</text>{L(96, 74, 7, .8)}{[86, 97, 108].map((y) => <g key={y}>{L(70, y)}<rect x={120} y={y} width={26} height={5} rx={2.5} fill="#111" opacity={.5} /></g>)}</>;
      break;
    case "cupom":
      body = <>{L(80, 30, 7, .8)}{L(110, 42)}<rect x={14} y={54} width={132} height={34} rx={7} fill="none" stroke="#111" strokeWidth={1.6} strokeDasharray="4 3" /><text x={80} y={76} textAnchor="middle" fontSize={12} fontWeight={800} fill="#111" fontFamily="Courier New,monospace" letterSpacing={2}>VIP20</text><rect x={14} y={96} width={44} height={26} rx={5} fill="#DCF568" />{L(70, 100)}{L(50, 110)}</>;
      break;
    case "lembrete":
      body = <><rect x={14} y={30} width={132} height={30} rx={7} fill="#111" /><text x={80} y={51} textAnchor="middle" fontSize={15} fontWeight={800} fill="#DCF568" fontFamily="Inter,sans-serif">2 dias</text>{L(70, 68, 7, .8)}<rect x={14} y={82} width={132} height={26} rx={7} fill="#111" opacity={.07} /><circle cx={27} cy={95} r={5} fill="#111" opacity={.6} />{L(80, 92)}<Btn y={114} /></>;
      break;
    case "pos":
      body = <>{L(100, 30, 7, .8)}{L(80, 42)}<rect x={14} y={54} width={132} height={36} rx={7} fill="#111" opacity={.12} /><circle cx={40} cy={70} r={7} fill="#111" opacity={.3} /><rect x={14} y={98} width={62} height={26} rx={6} fill="#DCF568" /><rect x={84} y={98} width={62} height={26} rx={6} fill="#111" opacity={.12} /></>;
      break;
    case "agenda":
      body = <>{L(70, 30, 7, .8)}{[[14, 44], [84, 44], [14, 86], [84, 86]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width={62} height={28} rx={6} fill={i === 0 ? "#DCF568" : "#111"} opacity={i === 0 ? 1 : 0.12} /><rect x={x} y={y + 31} width={40} height={4} rx={2} fill="#111" opacity={.35} /></g>)}</>;
      break;
    case "parceiro":
      body = <>{L(76, 30, 7, .8)}{L(110, 42)}<rect x={14} y={54} width={132} height={40} rx={7} fill="#FFB3DE" /><path d="M64 74h32M80 66v16" stroke="#111" strokeWidth={2.4} strokeLinecap="round" opacity={.55} />{L(80, 102, 6, .6)}<Btn y={112} /></>;
      break;
    case "branco":
      body = <>{L(90, 32, 8, .8)}{L(130, 50)}{L(120, 60)}{L(100, 70)}<rect x={14} y={86} width={132} height={22} rx={6} fill="none" stroke="#111" strokeOpacity={.3} strokeDasharray="3 3" /><path d="M80 92v10M75 97h10" stroke="#111" strokeOpacity={.4} strokeWidth={1.6} strokeLinecap="round" /></>;
      break;
  }
  return (
    <svg className="ml-art" viewBox="0 0 160 132" aria-hidden="true">
      <rect x={0} y={0} width={160} height={132} rx={10} fill="#ECECE6" />
      <rect x={6} y={6} width={148} height={150} rx={8} fill="#fff" />
      <circle cx={18} cy={14} r={4} fill="#111" /><rect x={26} y={12} width={30} height={4} rx={2} fill="#111" opacity={.75} /><rect x={6} y={22} width={148} height={1} fill="#111" opacity={.08} />
      {body}
    </svg>
  );
}
