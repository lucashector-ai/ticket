import type { HelpIcon } from "@/lib/help/articles";

const PATHS: Record<HelpIcon, React.ReactNode> = {
  ticket: <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6zM14 5v2M14 11v2M14 17v2" />,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M18 16v2" /></>,
  swap: <path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5" />,
  group: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></>,
  half: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 6.5a5.5 5.5 0 0 0 0 11z" fill="currentColor" stroke="none" /></>,
  refund: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l2.5 2" />,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" /><path d="M9 12l2 2 4-4" /></>,
  stage: <><path d="M3 20h18M5 20v-6h14v6" /><path d="M8 14V9l4-5 4 5v5" /><path d="M12 10v1" /></>,
  access: <><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3.5 6M12 14.5l3.5 6" /></>,
};

export function CatIcon({ name, size = 22 }: { name: HelpIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

type P = { size?: number };
const base = (size: number, children: React.ReactNode, sw = 1.9) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IcSearch = ({ size = 22 }: P) => base(size, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>, 2);
export const IcArrow = ({ size = 16 }: P) => base(size, <path d="M5 12h14M13 6l6 6-6 6" />);
export const IcChevron = ({ size = 14 }: P) => base(size, <path d="M9 6l6 6-6 6" />, 2);
export const IcMail = ({ size = 22 }: P) => base(size, <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></>, 1.8);
export const IcClose = ({ size = 16 }: P) => base(size, <path d="M6 6l12 12M18 6L6 18" />, 2);
export const IcCheck = ({ size = 16 }: P) => base(size, <path d="M5 12.5l4.5 4.5L19 7.5" />, 2.2);
export const IcInfo = ({ size = 18 }: P) => base(size, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>, 1.9);
export const IcAlert = ({ size = 18 }: P) => base(size, <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5h.01" /></>, 1.9);
export const IcClock = ({ size = 18 }: P) => base(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 1.9);
export const IcThumb = ({ size = 18, down = false }: P & { down?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={down ? { transform: "scaleY(-1)" } : undefined}>
    <path d="M7 10v10H4.5A1.5 1.5 0 0 1 3 18.5v-7A1.5 1.5 0 0 1 4.5 10zM7 10l4-7a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7" />
  </svg>
);

export const IcWhatsApp = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.4 4.8 4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.2-.2-.5-.3z" />
  </svg>
);
