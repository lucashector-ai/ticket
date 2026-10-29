import { BrandMark, BrandWord } from "@/components/brand-logo";

/** Logo da Tickets Win com o selo "Banco". */
export function BancoMark() {
  return (
    <span className="bk-mark">
      <BrandMark size={30} />
      <span className="bk-word"><BrandWord height={14} /></span>
      <span className="bk-tag">Banco</span>
    </span>
  );
}
