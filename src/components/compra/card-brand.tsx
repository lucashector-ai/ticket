/** Selo da bandeira do cartão (desenhado aqui, sem imagens de terceiros). `brand`: rótulo ("Visa", "Mastercard"…). */
export function CardBrand({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  if (b === "mastercard") {
    return (
      <span className="cbr mc" aria-hidden="true">
        <svg width="26" height="16" viewBox="0 0 26 16"><circle cx="9" cy="8" r="7" fill="#EB001B" /><circle cx="17" cy="8" r="7" fill="#F79E1B" fillOpacity=".9" /></svg>
      </span>
    );
  }
  const label = b === "visa" ? "VISA" : b === "elo" ? "elo" : b === "amex" ? "AMEX" : b === "hipercard" ? "HIPER" : b === "diners" ? "DINERS" : null;
  if (label) return <span className={`cbr ${b}`} aria-hidden="true">{label}</span>;
  return (
    <span className="cbr gen" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6.5 15h4" /></svg>
    </span>
  );
}

/** "12/28" */
export const expLabel = (m: number, y: number) => `${String(m).padStart(2, "0")}/${String(y % 100).padStart(2, "0")}`;
