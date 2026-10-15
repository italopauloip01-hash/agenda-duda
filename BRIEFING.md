# Briefing — Painel Agenda da Duda

- **Arquivo local:** `painel-duda.html` (nesta pasta; fonte original, 1801 linhas — idêntico ao artifact publicado, sem a casca doctype que a publicação adiciona)
- **Artifact publicado:** https://claude.ai/artifact/D1awmgVDn2MRuARGmAZtsM
- Origem: sessão anterior no claude.ai (arquivo original em `/tmp/.../scratchpad/painel-duda.html`, ~1903 linhas)

## Supabase
- Projeto: `rsrpfwtrkpclscpccaok` — https://rsrpfwtrkpclscpccaok.supabase.co (fica em outra conta, não na que o MCP acessa)
- Chave publishable (pode ir no HTML): `sb_publishable_0FRlkE_cdq_RKIpX6pSjGA_boyTYEX0`
- A service_role **nunca** vai no HTML; só nas credenciais do n8n
- `supabase/001_schema.sql` aplicado em 2026-10-14: 10 tabelas + view `clientes_resumo`, RLS por `owner_id`. Testado: sem login não lê nem grava
- `supabase/002_storage.sql` aplicado em 2026-10-15: bucket `portfolio` + policies de upload/delete
- Login: e-mail + senha. Google ainda não configurado (precisa Client ID do Google Cloud)
- Auth → URL Configuration: Site URL e Redirect URL = endereço do GitHub Pages

## Publicação
- Vercel: https://agenda-duda-ruddy.vercel.app (projeto `agenda-duda`, ligado ao repo: push em `main` publica sozinho; o nome pode ser trocado em Settings → Domains)
- Site: https://italopauloip01-hash.github.io/agenda-duda/ (GitHub Pages, branch `main`, raiz)
- Repo: https://github.com/italopauloip01-hash/agenda-duda — publicar = commit + `git push`
- O app é um único `index.html` (antes se chamava `painel-duda.html`)

## Dados de demonstração (2026-10-15)
- Conta italo.pauloip01@gmail.com recebeu: 40 clientes, ~334 agendamentos (1º/ago até +14 dias), estoque, despesas, avaliações, notificações, 1 folga e 1 bloqueio
- Gerar de novo: `SB_KEY=<service_role> OWNER=<uuid> node supabase/demo/gerar_demo.mjs` (usa os serviços já cadastrados)
- Apagar: `supabase/demo/limpar_demo.sql` no SQL Editor

## Design (2026-10-15)
- Visual discreto: fonte Geist, paleta neutra (tons de pedra) com acento rosé `--accent`, sem sombras, bordas de 1px, botões principais em preto (`--fg`)
- Modo escuro automático pelo sistema; sem emojis na interface (só nas mensagens de WhatsApp para clientes)
- Listas usam `.list-card` (linhas separadas por borda); avisos da agenda agrupados num cartão

## Stack técnica
- HTML/CSS/JS puro — sem frameworks
- Google Fonts: Geist
- Supabase JS v2 (CDN jsdelivr, versão fixa)
- Canvas API nativo (gráfico de tendência)
- SVG nativo (donut chart)
- Web Contacts API (só Chrome Android)
- Mobile-first, max-width 520px, dark mode completo

## Design System (tokens CSS em `:root`)
- `--bg`, `--bg-card`, `--bg-subtle`, `--fg`, `--fg-muted`, `--fg-soft`, `--on-fg`
- `--border`, `--border-strong`, `--accent: #A8556B`, `--accent-lt`
- `--nail: #B5637A`, `--pod: #7366B0`, `--ok`, `--warn`, `--danger`, `--info` (+ `-lt`)
- `--r: 14px`, `--r-sm: 10px`, `--nav-h: 64px`
- Dark mode: `prefers-color-scheme: dark` + `[data-theme="dark"]`

## Estrutura de páginas (bottom nav, 6 itens)
| Nav | ID da page | Função de init |
|---|---|---|
| Agenda | `#page-agenda` | `renderAppointments()` |
| Calendário | `#page-calendario` | `buildCalendar()` |
| Clientes | `#page-clientes` | `renderClients()` |
| Financeiro | `#page-financeiro` | `renderTrendChart()` |
| Serviços | `#page-servicos` | `renderServiceLists()` |
| Config | `#page-config` | `renderConfig()` |

## Drawers (modal bottom-sheet)
`novoAgendDrawer`, `detailDrawer`, `bloquearDrawer`, `folga2Drawer`, `novoClienteDrawer`, `fichaClienteDrawer`, `aniversariantesDrawer`, `novoServicoDrawer`, `novoProdutoDrawer`, `novaDespesaDrawer`, `notifDrawer`, `buscaDrawer`, `perfilDrawer`, `horariosDrawer`, `lembretesDrawer`

## Dados (arrays JS em memória)
- `APPTS[]` — 6 agendamentos do dia
- `CLIENTS[]` — 8 clientes com nome, cor, visitas, faltou, bday, vip
- `SVCS_NAIL[]` / `SVCS_POD[]` — serviços de esmalteria e podologia
- `INVENTORY[]` — estoque de produtos
- `EXPENSES[]` — despesas lançadas
- `AVALIACOES[]` — avaliações com pendente/publicada
- `NOTIFS[]` — notificações
- `FIN_DATA{semana,mes,ano}` — dados financeiros por período
- `FIN_TREND[12]` — evolução mensal para canvas
- `PORTFOLIO_CATS[6]` — categorias do portfólio
- `GALLERY_EMOJIS{}` — placeholders por categoria

## Funções principais
```js
gotoPage(id, navEl)          // navega entre páginas
openDrawer(id) / closeDrawer(id)
buildCalendar()              // grid mensal com barras de ocupação
calPrevMonth() / calNextMonth()
renderDonutChart()           // SVG stroke-dasharray
renderTrendChart()           // Canvas polyline + gradiente
renderPnLTable()             // tabela DRE
renderPortfolio()            // galeria categorizada
filterPortfolio(f, el)       // filtro por categoria
setGalleryView(mode, btn)    // toggle grid/list
importContacts()             // Web Contacts API + fallback
simulateGoogleLogin()        // demo login Google
```

## Pendências / próximas etapas
- [ ] Substituir `'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'` pelo Client ID real do Google
- [ ] Substituir emojis do portfólio por fotos reais
- [ ] Etapa 3: Flow n8n + WhatsApp bot
- [ ] Etapa 4: Configurar Supabase (schema documentado em `docs/schema-banco-dados.md` — ainda não está nesta pasta)
- [ ] Etapa 5: Conectar Evolution API
- [ ] Etapa 6: Substituir dados fake pelos dados reais do Supabase
