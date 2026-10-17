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

## Pagamentos (2026-10-16)
- Tabela `pagamentos` (vários por agendamento: entrada + restante) + coluna `agendamentos.pagar_ate` — `supabase/003_pagamentos.sql`
- Pago = soma ≥ valor; "a receber" = já atendido (concluído ou passou do horário) e com saldo; "vencido" = `pagar_ate` < hoje
- Financeiro: Receita = concluídos no período (competência); Recebido = pagamentos no período (caixa); A receber = todo saldo em aberto
- Remarcar move os pagamentos para o novo agendamento
- O conector Supabase só enxerga UMA organização por autorização; o projeto fica na org "Agenda"

## App instalável (2026-10-16)
- PWA: `manifest.webmanifest`, `sw.js` (página rede-primeiro, CDN cache-primeiro, API do Supabase nunca em cache), ícones em `icons/` gerados por `node tools/gerar_icones.mjs`
- Android/Chrome: aviso "Instalar" na agenda (dispensável) + Ajustes → Instalar o app; iPhone: instruções do Safari
- Ao mudar `sw.js`, trocar `VERSAO` para limpar o cache antigo
- Botão voltar do celular fecha a gaveta aberta / volta para a Agenda (histórico com `pushState`)
- Google Play: possível depois empacotando o PWA (TWA/Bubblewrap); exige conta de desenvolvedor (US$ 25 uma vez)

## Versão 3.0 (2026-10-16)
- **Agendamento online**: `agendar.html?u=<slug>` — capa, book de fotos, avaliações (nota ≥ 4), serviço → dia → horário → dados. Funções `agenda_publica`, `horarios_ocupados`, `agendar_online` (SECURITY DEFINER, validam expediente, almoço, bloqueios, antecedência, prazo, máx. 3 futuros por telefone; conflito = 'ocupado'). Cria cliente se não existir, origem 'online', notificação. Ligar/desligar e prazo em Ajustes → Agendamento online (tabela `perfil`)
- **Horários de funcionamento** por dia com almoço (`horarios`); padrão = `horario_do_dia()` (seg–sex 8–18, sáb 8–13, dom fechado, almoço 12–13). Painel tem "Ver horários fora do expediente"
- **Portfólio**: upload reduzido a 1600px JPEG no bucket `portfolio/<uid>/`; foto de capa em `perfil.foto_capa`. Storage precisa da policy de SELECT para `remove()` funcionar
- **Mensagens prontas** (Ajustes): central única com 14 padrões (`MSGS_PADRAO`) + as criadas pela usuária. `perfil.modelos = {textos:{id:texto editado}, extras:[{id,titulo,texto}], ocultas:[id]}` (o formato antigo `{lembrete:'...'}` é lido como `textos`). Variáveis {nome} {servico} {dia} {hora} {data} {valor} {link} {studio}. As com `uso` alimentam botões (lembrete, cobrança, aniversário, avaliação) e não podem ser removidas. "Enviar mensagem pronta" na ficha e no agendamento abre a lista preenchida (usa o próximo horário da cliente quando aberto pela ficha)
- **Lembretes de amanhã**: lista com Enviar (abre WhatsApp, grava `lembrete_enviado_em`) e Confirmou
- **Exportar**: CSV (; e BOM) de atendimentos, pagamentos e despesas
- **Google** (código pronto, falta credencial): login pede contatos + calendário; `google_conexao` guarda refresh token (sem SELECT da coluna para o app); função `google-token` renova; agendamentos vão para o calendário "Agenda da Duda"; freebusy do calendário pessoal bloqueia horários; importar contatos com seleção

### Página da cliente — visual (2026-10-16)
- Identidade própria, separada do painel: paleta rosê/creme (`--rose #C9718A`, `--rose-2 #A44E68`, `--blush`, `--gold`), títulos Fraunces (serifada, itálico nos destaques), corpo DM Sans, botões pílula; modo escuro ameixa (`--sobre-rosa` escuro para contraste)
- Animações: capa com aproximação lenta, `.reveal` com IntersectionObserver, etapas com `surge`, pétalas na confirmação; tudo desliga com prefers-reduced-motion
- Carrossel de avaliações automático (5s, pausa ao tocar), pontos clicáveis
- Fluxo: barra de passos, resumo com "alterar", abas Unhas / Pés & podologia, horários por turno, "lembrar meus dados" (localStorage), fotos com setas/deslize, rodapé com horários (destaca hoje)
- Só a área de agendamento re-renderiza a cada escolha (carrossel e animações não reiniciam)

### Status do Google (2026-10-17)
- FEITO: projeto Google Cloud `agenda-da-duda-511919` (conta italopauloip01@gmail.com, com 2SV), People + Calendar API ativas, consentimento Externo **em produção** (não verificado, até 100 usuários), nome provisório "Agenda Beleza", página inicial + `privacidade.html`, domínios autorizados (vercel, github.io, supabase), escopos salvos (calendário = não confidenciais; contatos = confidencial), cliente OAuth web "Marquei web" com origens e redirect do Supabase. Client ID e secret gravados em `config_privada`
- FALTA: Supabase → Authentication → Providers → Google (ativar e colar Client ID/Secret — ver `config_privada`) e ligar "Allow manual linking"; depois testar login
- Nome do produto: "Marquei" e "Mimo" já existem no mercado; opções livres sugeridas: Hora do Mimo, Hora Linda, Bela Vez

### Ativar o Google (passo a passo original)
1. console.cloud.google.com → criar projeto "Agenda da Duda"
2. APIs e serviços → ativar **Google People API** e **Google Calendar API**
3. Google Auth Platform → Branding (nome, e-mail) → Público: Externo → **Publicar app** (fica "não verificado": a tela mostra um aviso, mas funciona e o acesso não expira em 7 dias como no modo teste)
4. Data access → escopos: `contacts.readonly`, `calendar.app.created`, `calendar.freebusy`
5. Clients → criar **Aplicativo da Web**: origens `https://agenda-duda-ruddy.vercel.app` e `https://italopauloip01-hash.github.io`; URI de redirecionamento `https://rsrpfwtrkpclscpccaok.supabase.co/auth/v1/callback`
6. Supabase → Authentication → Sign In / Providers → Google: ativar, colar Client ID e Secret. Em Authentication → Settings, ligar "Allow manual linking"
7. Guardar as credenciais para a função de renovação:
   `insert into config_privada values ('google_client_id','...'),('google_client_secret','...') on conflict (chave) do update set valor = excluded.valor;`

### Robô do WhatsApp (próxima etapa)
Envio automático (lembrete 24h, confirmação, avaliação) precisa de Evolution API + n8n num servidor ligado 24h. Hoje: lembretes em um toque e link de agendamento.

## Publicação
- Vercel: https://agenda-duda-ruddy.vercel.app (projeto `agenda-duda`, ligado ao repo: push em `main` publica sozinho; o nome pode ser trocado em Settings → Domains)
- Site: https://italopauloip01-hash.github.io/agenda-duda/ (GitHub Pages, branch `main`, raiz)
- Repo: https://github.com/italopauloip01-hash/agenda-duda — publicar = commit + `git push`
- O app é um único `index.html` (antes se chamava `painel-duda.html`)

## Dados de demonstração (2026-10-15)
- Conta italo.pauloip01@gmail.com recebeu: 40 clientes, ~334 agendamentos (1º/ago até +14 dias), estoque, despesas, avaliações, notificações, 1 folga e 1 bloqueio
- Gerar de novo: `SB_KEY=<service_role> OWNER=<uuid> node supabase/demo/gerar_demo.mjs` (usa os serviços já cadastrados) e depois `gerar_pagamentos_demo.mjs`
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
