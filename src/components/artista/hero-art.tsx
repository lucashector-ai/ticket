"use client";

/** Ilustração do artista (silhueta com boné + glow), com as cores da paleta. */
export function HeroArt({ accent, id = "ah" }: { accent: string; id?: string }) {
  const spot = `${id}-spot`, body = `${id}-body`, floor = `${id}-floor`, glow = `${id}-glow`, grain = `${id}-grain`;
  const silhouette = (
    <g>
      <ellipse cx="440" cy="330" rx="92" ry="108" />
      <path d="M396 410h88v100h-88z" />
      <path d="M170 900C182 650 292 528 440 512C588 528 698 650 710 900Z" />
      <path d="M340 304C344 206 536 200 542 300C546 318 520 314 440 312C380 312 338 320 340 304Z" />
      <path d="M520 300C584 298 628 312 634 326C602 330 560 326 520 318Z" />
      <path d="M492 482C462 540 466 620 516 676L604 652C584 596 566 534 556 476Z" />
      <ellipse cx="524" cy="468" rx="36" ry="42" />
      <rect x="494" y="356" width="40" height="128" rx="20" transform="rotate(-24 514 420)" />
      <circle cx="490" cy="370" r="30" />
    </g>
  );
  return (
    <svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id={spot} cx="56%" cy="34%" r="62%">
          <stop offset="0" stopColor={accent} stopOpacity=".7" />
          <stop offset=".42" stopColor={accent} stopOpacity=".16" />
          <stop offset="1" stopColor="#0A0A0A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1A1A1C" />
          <stop offset=".72" stopColor="#0E0E10" />
          <stop offset="1" stopColor={accent} stopOpacity=".85" />
        </linearGradient>
        <linearGradient id={floor} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".62" stopColor="#0A0A0A" stopOpacity="0" />
          <stop offset="1" stopColor="#0A0A0A" />
        </linearGradient>
        <filter id={glow} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <filter id={grain}>
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
        </filter>
      </defs>
      <rect width="800" height="900" fill="#0A0A0A" />
      <rect width="800" height="900" fill={`url(#${spot})`} />
      <g fill={accent} opacity=".55" filter={`url(#${glow})`} transform="translate(10 -4)">
        {silhouette}
      </g>
      <g fill={`url(#${body})`}>{silhouette}</g>
      <rect width="800" height="900" fill={`url(#${floor})`} />
      <rect width="800" height="900" filter={`url(#${grain})`} opacity=".16" />
    </svg>
  );
}

/** Avatar pequeno (busto) usado em "artistas parecidos" e no player. */
export function BustIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="15.5" r="7" fill="currentColor" />
      <path d="M6 40c1.6-8.6 7.2-13.4 14-13.4S32.4 31.4 34 40z" fill="currentColor" />
    </svg>
  );
}
