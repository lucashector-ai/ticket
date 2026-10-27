import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSessionUser } from "@/lib/auth/server";

type Props = {
  children: React.ReactNode;
  activePath?: string;
  /** Hero padrão: etiqueta, título e texto de apoio. Omita `title` para renderizar só o conteúdo. */
  eyebrow?: string;
  title?: string;
  lead?: string;
  actions?: React.ReactNode;
};

export async function getHeaderUser(): Promise<HeaderUser> {
  try {
    const u = await getSessionUser();
    return u ? { id: u.id, name: u.name, email: u.email, image: u.image } : null;
  } catch {
    return null;
  }
}

/** Casca das páginas institucionais: header (com sessão), hero opcional, conteúdo e footer. */
export async function InstShell({ children, activePath, eyebrow, title, lead, actions }: Props) {
  const user = await getHeaderUser();
  return (
    <div className="pg-inst">
      <SiteHeader user={user} variant="default" activePath={activePath} />
      {title && (
        <section className="in-hero">
          <div className="wrap">
            {eyebrow && <span className="eyebrow"><span className="dot" aria-hidden="true" />{eyebrow}</span>}
            <h1 className="in-t">{title}</h1>
            {lead && <p className="in-s">{lead}</p>}
            {actions && <div className="in-acts">{actions}</div>}
          </div>
        </section>
      )}
      <main className="wrap in-body">{children}</main>
      <SiteFooter />
    </div>
  );
}
