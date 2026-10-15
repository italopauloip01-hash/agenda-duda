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
- Site: https://italopauloip01-hash.github.io/agenda-duda/ (GitHub Pages, branch `main`, raiz)
- Repo: https://github.com/italopauloip01-hash/agenda-duda — publicar = commit + `git push`
- O app é um único `index.html` (antes se chamava `painel-duda.html`)

## Stack técnica
- HTML/CSS/JS puro — sem frameworks
- Google Fonts: DM Serif Display + DM Sans
- Canvas API nativo (gráfico de tendência)
- SVG nativo (donut chart)
- Web Contacts API (com fallback de simulação)
- Google Identity Services (demo/fallback incluído)
- Mobile-first, max-width 480px, dark mode completo

## Design System (tokens CSS em `:root`)
- `--bg`, `--bg-card`, `--fg`, `--fg-muted`, `--fg-soft`
- `--border`, `--accent: #C2637A`, `--accent-lt: #F5E3E8`
- `--nail: #C2637A`, `--pod: #7A63C2`
- `--ok: #3D9E6A`, `--warn: #D4860A`, `--danger: #C93B3B`, `--info: #2E86C1`
- `--shadow`, `--shadow-md`, `--r: 14px`, `--r-sm: 9px`
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
