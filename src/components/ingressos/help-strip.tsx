import Link from "next/link";
import { IcoArrow, IcoHelp, IcoPhone } from "./icons";

/** Rodapé informativo da página de ingressos. */
export function HelpStrip() {
  return (
    <div className="mi-help">
      <div className="mh">
        <span className="mh-i" aria-hidden="true"><IcoPhone /></span>
        <div>
          <b>Funciona offline</b>
          <span className="mh-s">Abra o ingresso antes de chegar. O QR fica salvo no celular.</span>
        </div>
      </div>
      <div className="mh">
        <span className="mh-i" aria-hidden="true"><IcoArrow size={20} /></span>
        <div>
          <b>Transferência segura</b>
          <span className="mh-s">Envie para um amigo pelo e-mail. O QR antigo é cancelado na hora.</span>
        </div>
      </div>
      <Link className="mh mh-a" href="/ajuda">
        <span className="mh-i" aria-hidden="true"><IcoHelp /></span>
        <div>
          <b>Precisa de ajuda?</b>
          <span className="mh-s">Reembolsos, meia-entrada e trocas na Central de ajuda.</span>
        </div>
      </Link>
    </div>
  );
}
