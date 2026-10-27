# Onde — ingressos

Site de descoberta e venda de ingressos (pt-BR). Next.js 16 (App Router) rodando em **Cloudflare Workers** via OpenNext, com **Neon Postgres** (Drizzle ORM) e **Neon Auth** (Better Auth gerenciado).

## Stack

| Camada | Tecnologia |
| --- | --- |
| Front/SSR | Next.js 16, React 19, TypeScript, CSS do design + Tailwind v4 (sem preflight) |
| Hospedagem | Cloudflare Workers (`@opennextjs/cloudflare`), assets estáticos, cache ISR em R2 (`onde-cache`), mídia em R2 (`onde-media`), KV (`onde-kv`) |
| Banco | Neon Postgres (projeto `onde`, região São Paulo), branches `main` (produção) e `dev` |
| Auth | Neon Auth (e-mail/senha + Google), SDK `@neondatabase/auth` |
| ORM | Drizzle (`src/db/schema.ts`), `drizzle-kit push` por branch |

## Rodando localmente

```bash
cp .env.example .env.local   # preencha com as credenciais do Neon
pnpm install
pnpm db:push                 # aplica o schema na branch apontada por DATABASE_URL
pnpm db:seed                 # 12 eventos, artistas, locais, lotes e cupom ONDE10
pnpm dev                     # http://localhost:3000
```

Checks: `pnpm typecheck`, `pnpm lint`. Preview no runtime do Workers: `pnpm preview`.

## Deploy (Cloudflare Workers Builds)

O Worker `ticket` está ligado a este repositório pelo Workers Builds: cada push na branch de produção gera build e deploy.

| Configuração | Valor |
| --- | --- |
| Repositório | `lucashector-ai/ticket` |
| Branch de produção | `claude/eager-galileo-rgwakn` |
| Build command | `pnpm exec opennextjs-cloudflare build` |
| Deploy command | `pnpm exec opennextjs-cloudflare deploy` |
| Root directory | `/` |

O build não precisa de segredos. Em tempo de execução, o Worker precisa destes **Secrets** (Settings → Variables and Secrets):

- `DATABASE_URL` — connection string da branch `main` do Neon (produção).
- `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_AUTH_JWKS_URL`.

Depois do primeiro deploy, adicione a URL pública do Worker como domínio confiável no Neon Auth, senão o login falha em produção.

Deploy manual (alternativa): com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no ambiente, rode `./scripts/cf-secrets.sh .env.local` e `pnpm deploy`.

## Estrutura

- `src/app` — rotas (home, explorar, eventos/[slug], artistas/[slug], entrar, cadastro, meus-ingressos, ingressos/[code], checkout/[orderId], api/auth, api/checkin).
- `src/components` — header, footer, toast, favoritos, cards, artes (`art/flyer.tsx`, `art/banner.tsx`) e componentes por página.
- `src/lib/data` — consultas (server only). `src/lib/actions` — server actions (auth, social, checkout, ingressos).
- `src/styles` — `base.css` (design compartilhado) e `pages/*.css` (escopo `.pg-<pagina>`).
- `src/db` — schema Drizzle e seed.
