# DISCORD_REWRITE_BLUEPRINT.md

Planta mestra da reescrita do NexPlay para seguir **exatamente** a engenharia, a estrutura e a UI/UX do Discord. Documento vivo. Companheiro de `DISCORD_PARITY_PLAN.md` (status por feature) e `DISCORD_UI_ATLAS.md` (auditoria interação a interação). Este aqui é o **plano de reescrita**: o que muda, em que ordem, com que fonte da verdade, e como não quebrar a produção.

Última atualização: 2026-10-06.

## Objetivo e regras

- **Meta**: reescrever o NexPlay para espelhar o Discord na engenharia, na estrutura de código, no protocolo e na UI/UX.
- **O que se mantém**: só o **nome "NexPlay"** e a **logo**. Todo o resto passa a seguir o Discord como referência.
- **O que NÃO se faz**: copiar código-fonte, assets, textos de marca ou ícones proprietários do Discord. A reescrita é **limpa** — a partir do entendimento da arquitetura (interfaces, estrutura, nomes de protocolo e padrões de UX), reimplementada em código próprio. Nomes de canais, opcodes, entidades e campos de protocolo são reproduzidos quando servem à estrutura/interoperabilidade, não o código que os implementa.

## Escopo honesto da REA (onde cada verdade vem de)

A REA descompila o app **local** do Discord (`core.asar`/`app.asar` = a casca Electron e o preload). Ela **não** descompila a UI/lógica do app, que mora no `discord.com` (React/Flux servido remoto e ofuscado). Logo, a fonte da verdade muda por camada:

| Camada | Fonte da verdade | Alcance da REA |
|---|---|---|
| Casca nativa (processos, janela, IPC, preload, updater, módulos, permissões) | **REA exata** (`core.asar`) | Total |
| Protocolo/gateway (opcodes, heartbeat, eventos, ETF/erlpack, compressão zstd) | REA (pistas nos módulos) + **observação em runtime** + docs públicas de API | Parcial |
| Modelo de dados (entidades, snowflakes, bitfield de permissões) | Observação + docs de API + entidades visíveis no preload | Indireto |
| UI/UX (layout, design tokens, telas, interações, animações) | **Observação em runtime + o Atlas de vocês** | Nenhum via binário |

Regra prática: **casca = REA**; **protocolo = REA + observação**; **UI/UX = Atlas + observação**. Este doc marca, em cada fase, de onde vem a evidência.

## Ground truth — arquitetura do Discord (do REA)

Resumo do que já foi extraído do Discord Desktop 1.0.9260 (Electron 42.7.1). Detalhe completo em `docs/` da leitura REA (referência de arquitetura).

- **Dois pacotes**: `app.asar` (bootstrapper: splash, Sentry, updater de host + módulos) → carrega `core.asar` (o app desktop: processo main + preload). Contrato `core.startup({deps})`.
- **165 canais IPC** com prefixo `DISCORD_`, num enum `IPCEvents`; 96 handlers no main. Grupos: APP(27), WINDOW(25), PROCESS(12), FILE(10), NOTIFICATIONS(8), POWER(8), SPELLCHECK(6), WEBAUTHN(5), NATIVE(5), SAFE(3), e outros.
- **Ponte única** `window.DiscordNative` (uma `exposeInMainWorld`), ~30 áreas: `app, nativeModules, process, os, clipboard, ipc, window, gpuSettings, ntpClock, spellCheck, crashReporter, desktopCapture, fileManager, clips, processUtils, powerSaveBlocker, http, settings, safeStorage, webAuthn, hardware, tracing, riotGames, Gsi, dotaGsi, sysimg, ...`.
- **17 módulos nativos** carregados sob allowlist (`/^discord_[a-z0-9_-]+$/`): voice, krisp, dispatch, overlay2, hook, rpc, erlpack, zstd, spellcheck, utils, etc. Novos em Rust/N-API.
- **Dois atualizadores**: host (Squirrel/`Update.exe`) para a casca; módulos (updater em Rust) baixando de `updates.discord.com/modules/<canal>` com verificação de `package_sha256`.
- **Segurança da janela**: `frame:false`, `contextIsolation:true`, `nodeIntegration:false`, **`sandbox:false`** (o preload tem Node), `will-navigate` travado na origem, `setWindowOpenHandler` negando por padrão, permissões só para a própria origem, blocklist de protocolos externos.
- **Serialização**: ETF (erlpack) no gateway, compressão zstd.

## Delta — NexPlay hoje vs Discord (por camada)

| Camada | Discord | NexPlay hoje | Ação da reescrita |
|---|---|---|---|
| Pacotes | `app.asar` + `core.asar` (host/core, auto-update de módulos) | asar único, Electron 44, electron-builder + GitHub Releases | Avaliar split host/core só se o auto-update de módulos for desejado; hoje o update é do app inteiro (mais simples, aceitável). **Baixa prioridade.** |
| IPC | 165 canais `DISCORD_*`, enum tipado | 15 canais próprios (`window:`, `desktop:`, `media:`, `activity:`, `app:`, pickers) | **Reestruturar** para o shape do Discord: enum de canais por domínio, ponte única `window.NexplayNative` espelhando as áreas do `DiscordNative` que fazem sentido aqui. |
| Preload | `window.DiscordNative` (~30 áreas) | `window.desktop.*` (~15 métodos) | Expandir e reorganizar por domínio igual ao `DiscordNative`. |
| Segurança janela | `sandbox:false` | **`sandbox:true`, `devTools:false`** (melhor que o Discord) | **Manter** o NexPlay (não regredir). Documentar como divergência deliberada. |
| Módulos nativos | 17, allowlist, Rust/N-API | picker/activity nativos, sem sistema de módulos | Introduzir estrutura de módulos só se features exigirem (overlay, krisp). **Média prioridade.** |
| Updater | host + módulos, sha256 | app inteiro via electron-builder, auto-update | Alinhar ao fluxo do Discord se o split host/core entrar; senão manter. |
| Gateway | opcodes/heartbeat/ETF/zstd | WebSocket próprio (`ws`), JSON, cookie de sessão | **Reescrever o protocolo** no formato Discord (opcodes, heartbeat, sequence, resume, eventos nomeados). ETF/zstd opcionais. |
| Modelo de dados | guilds/channels/roles/permissions bitfield/snowflakes | servers/channels/roles/bitfield (já perto!), SQLite | Alinhar nomes e snowflakes; bitfield já existe. |
| UI/UX | layout 3-4 colunas, design system, telas, interações | React+Vite SPA, já com boa paridade comportamental (Atlas) | **Reescrever a camada visual** seguindo o design/interações do Discord (do Atlas + observação). Maior volume. |
| Backend | serviços distribuídos | Express + SQLite + LiveKit + MinIO, self-hosted | Manter stack; alinhar contratos/entidades ao Discord. |

## Fases da reescrita

Cada fase é isolável, verificável, e com uma branch própria. Ordem pensada para **não tocar a produção cedo** (começa pela casca, que é autocontida) e para desbloquear as seguintes.

### Fase 0 — Fundação da leitura (em andamento)
- Este blueprint + specs REA por subsistema (um alvo exato por camada).
- **Entregável**: `DISCORD_REWRITE_BLUEPRINT.md` (este) + specs REA em `docs/rea/`.
- **Fonte**: REA. **Risco**: nenhum (só leitura/doc).

### Fase 1 — Casca nativa (`apps/desktop`) no shape do Discord
- Reescrever o preload para uma ponte única `window.NexplayNative` organizada por domínio igual ao `DiscordNative`; enum tipado de canais IPC por domínio; handlers reorganizados; manter `sandbox:true`/`devTools:false` (divergência deliberada, melhor que o Discord).
- **Entregável**: `apps/desktop` reestruturado, superfície de API espelhando o Discord, testes de policy/settings mantidos verdes.
- **Fonte**: REA exata. **Risco**: baixo (casca isolada; o web app só precisa do adaptador de ponte). **Verificação**: app abre, janela/picker/activity/updater funcionam, testes passam.

### Fase 2 — Protocolo/gateway no formato Discord
- Reescrever `apps/api/src/realtime.ts` + `apps/web/src/realtime.ts` para o modelo do gateway do Discord: opcodes (Hello, Heartbeat, Identify, Resume, Dispatch...), `sequence`, `session_id`, resume após queda, eventos nomeados (`MESSAGE_CREATE`, `GUILD_CREATE`, `PRESENCE_UPDATE`, `TYPING_START`...). ETF/zstd opcionais numa segunda passada.
- **Entregável**: gateway com opcodes + resume + eventos nomeados; desbloqueia typing/presença (hoje MISSING).
- **Fonte**: REA (pistas) + observação + docs. **Risco**: médio (é o coração do tempo real; migrar com cuidado, atrás de flag).
- **Feito (2026-10-06)**: envelope `{op,d,s,t}` com HELLO / HEARTBEAT / HEARTBEAT_ACK / IDENTIFY / RESUME / RECONNECT / INVALID_SESSION / DISPATCH (`packages/shared/src/gateway.ts`). Sessão sobrevive 60 s à queda guardando até 1000 eventos; RESUME reenvia na ordem e confirma com `RESUMED`. O cliente pede com `?v=2`; flag `REALTIME_GATEWAY=false` no servidor (ou servidor antigo) faz o app cair sozinho no formato antigo. Typing e presença já existiam e passam pelo mesmo canal; os nomes dos eventos continuam os do NexPlay (`TEXT_MESSAGE_UPSERT` etc.), o renome para os do Discord fica para a Fase 3, junto do modelo de dados. Testes: `apps/api/src/gateway.test.ts` (WebSocket real) e `apps/web/src/realtime.test.ts`.

### Fase 3 — Modelo de dados e entidades
- Alinhar entidades e nomes ao Discord (guild/channel/role/member/message/overwrite), snowflakes com timestamp embutido, bitfield de permissões com allow/deny/inherit por canal (hoje só "concede").
- **Entregável**: esquema e tipos alinhados; permissões com override por canal.
- **Fonte**: observação + docs. **Risco**: médio-alto (migração de dados em produção; já há experiência de rebuild de tabela sem perda).

### Fase 4 — UI/UX exata do Discord
- Reescrever a camada visual: design tokens (cores, tipografia, espaçamento, raios), layout 3-4 colunas, cada tela e interação seguindo o Atlas + observação do app real. Estrutura React alinhada (stores por domínio).
- **Entregável**: UI indistinguível do Discord em layout/interação, com nome/logo NexPlay.
- **Fonte**: Atlas + observação. **Risco**: alto volume, baixo risco técnico (incremental, tela a tela).

### Fase 5 — Features e extras
- Itens restantes do `DISCORD_PARITY_PLAN` (pastas de servidor, não lidas/menções, premium/loja cosmética, stage, fórum, eventos, onboarding).
- **Fonte**: Atlas + observação. **Risco**: por item.

## Como não quebrar a produção

- Uma **branch por fase**, deploy controlado, verificação real (como vocês já fazem: script CRUD, E2E HTTP+WebSocket, Playwright em dois navegadores, smoke em produção).
- Começar pela **casca (Fase 1)**, que é autocontida e não toca backend nem dados.
- Protocolo e dados (Fases 2-3) atrás de **flag**, com caminho de rollback.
- Nada entra em produção sem verificação real — padrão "nada decorativo" que vocês já seguem.

## Próximo passo imediato

Fase 1. Extrair com a REA a estrutura exata da casca do Discord (enum de canais, áreas do `DiscordNative`, config de janela/permissões) e produzir o **spec alvo do `apps/desktop`** — o mapa um-para-um do que a casca do NexPlay passa a expor. Depois, reescrever o preload + IPC do NexPlay para esse spec, mantendo as divergências de segurança deliberadas (`sandbox:true`, `devTools:false`).
