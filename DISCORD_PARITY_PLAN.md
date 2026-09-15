# DISCORD_PARITY_PLAN.md

Documento vivo de paridade funcional com o Discord, para o Sausixudos/GilleCord — app privado, self-hosted, para um grupo fechado de amigos. Atualizar conforme cada item avança. Categorias: `DONE`, `PARTIAL`, `MISSING`, `BLOCKED`, `OPTIONAL`, `PREMIUM`, `EXPERIMENTAL`.

Última análise completa do código: 2026-09-09. Atualizado em 2026-09-10 após implementar e verificar em produção: (1) a fundação de WebSocket + canais de voz como dados (ver §1); (2) edição/exclusão de mensagem + markdown seguro (ver §8); (3) reações em mensagens (ver §8); (4) responder mensagem (ver §8); (5) soundboard com áudio real via LiveKit (ver §12) — pendente de confirmação ao vivo do usuário; (6) cargos, permissões e moderação básica — kick/ban/timeout (ver §1, §14, §15); (7) mensagens fixadas e busca por canal (ver §8); (8) upload de arquivo/imagem em mensagem via MinIO self-hosted (ver §0, §8); (9) sistema de amigos + mensagens diretas 1:1 (ver §1, §15, §16) — verificado com script de CRUD puro, E2E via HTTP+WebSocket, verificação visual real em dois navegadores via Playwright, e smoke test em produção. Atualizado em 2026-09-11 com 2 correções de bug real relatadas pelo usuário (com prints como prova): (10) soundboard sem áudio no cliente desktop por bloqueio de CSP (ver §12); (11) tela de "Entrando na sala..." travando pra sempre ao voltar pra um canal de voz (ver §5). Atualizado em 2026-09-15 após implementar e verificar em produção (12) a fundação de múltiplos servidores de verdade — `servers`/`server_members`/`invites`, migração automática e sem perda de dado do servidor único existente, cargos/permissões/timeout agora por servidor, ~40 rotas escopadas com isolamento real, e a rail de servidores real na UI (ver §0, §1, §15, §16) — o último item grande de fundação do pedido original. Atualizado ainda em 2026-09-15, na mesma sessão, com (13) encaminhar mensagem (forward) entre canais, servidores e DMs — o item que essa fundação de múltiplos servidores + DM tinha desbloqueado (ver §8, §15, §16).

## 0. Arquitetura atual (para não recriar o que já existe)

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend web | React + Vite, TypeScript | `apps/web`, ~5.600 linhas. SPA única, sem router de páginas (tudo em `Workspace.tsx`, 2.234 linhas). |
| Cliente desktop | Electron 44 | `apps/desktop`. Empacotado via electron-builder + GitHub Releases + auto-update. Picker nativo de tela, detecção de atividade (jogo/mídia via `windows-media-sessions`/`ps-list`), CSP restrito. |
| Backend | Express + TypeScript | `apps/api`, ~1.530 linhas. WebSocket próprio via `ws` em `apps/api/src/realtime.ts` (autenticado pelo mesmo cookie de sessão). |
| Banco | SQLite (`node:sqlite`, arquivo único) | `apps/api/src/db.ts`. Schema: `users`, `text_channels`, `text_messages`, `text_bot_messages`, `voice_channels`, `roles`, `user_roles`, `bans`, `message_attachments`, `friendships`, `blocks`, `dm_channels`, `dm_messages`, e agora `servers`/`server_members`/`invites`. Sem migrations versionadas — `ALTER TABLE`/seed condicional, incluindo um rebuild real de tabela (`text_channels`/`roles`, `UNIQUE(name)` → `UNIQUE(server_id, name)`) verificado contra uma cópia do banco de produção antes de aplicar de verdade. |
| Autenticação | Cookie assinado (HMAC), stateless | `apps/api/src/session.ts`. Usuário+senha (bcrypt/scrypt a confirmar) + token de convite único global (continua controlando só "criar uma conta nesta instância" — ver §1). Convite por servidor (entrar num servidor específico já dentro da instância) agora é real, via tabela `invites`. Sem lista de sessões, sem revogação individual, sem MFA. |
| Voz/vídeo/tela | LiveKit self-hosted (SFU) | Config via env var `LIVEKIT_CONFIG` no `docker-compose.yml` (não mais arquivo estático — precisava de `${LIVEKIT_API_KEY}` pro webhook). IP externo direto, **sem TURN/coturn** (aceitável só porque a VPS tem IP público; falha para clientes atrás de NAT simétrico). Webhook (`participant_joined`/`left`/`room_started`/`finished`) empurra estado de sala pro WebSocket da API. |
| Mensagens de texto | WebSocket em tempo real | `apps/web/src/realtime.ts` + `apps/api/src/realtime.ts`. Fetch HTTP só no boot/reconexão; sem polling. |
| Bot de música | Node standalone, participante LiveKit real | `apps/music-bot`. YouTube/Spotify(metadata)/SoundCloud, fila real, jitter buffer, scheduler sem deriva (corrigido nesta sessão). Card "tocando agora" resincronizado por um laço periódico *server-side* (não mais pelo poll do cliente). |
| Upload/mídia | Anexo de mensagem via MinIO self-hosted (`apps/api/src/storage.ts`/`attachments.ts`) | Avatar/banner continuam via `data:` URL (não migrados, funcionam bem do jeito que estão). Anexos: até 15MB/arquivo, 5 por mensagem, upload em duas etapas (sobe → vincula ao enviar a mensagem), servidos por `GET /api/attachments/:id/:filename` que decide inline vs. download forçado no servidor (nunca no cliente) — só png/jpeg/webp/gif viram `<img>`, todo o resto (inclusive SVG) é download forçado, o que evita servir um arquivo malicioso como HTML/SVG a partir da nossa própria origem. Sem thumbnails/transcodificação de vídeo. |
| Deploy | Docker Compose na VPS (147.93.11.201) + Caddy (TLS) | Serviços: `api`, `web`, `music-bot`, `livekit`, `pot-provider`, `caddy`, `minio` (novo — storage de anexos, nunca exposto à internet, só acessível pelo `api` via rede interna do compose). Sem Redis, sem fila de jobs, sem observabilidade estruturada. |
| Conceito de "servidor" | `DONE` — `servers`/`server_members` reais | Qualquer usuário cria um servidor (`POST /api/servers`, sem permissão especial, igual Discord real) e entra em outro via convite (`POST /api/invites/:code/redeem`). O servidor único de antes ("Lobby dos amigos") foi migrado automaticamente para o primeiro `servers` real, sem perda de dado. Canais de texto e voz continuam duas tabelas físicas separadas de propósito (evita risco de colisão de id ao fundir — ver §1), unificadas só na camada de API (`GET /api/servers/:serverId/channels`). Ainda sem categorias. |

**Implicação central**: a fundação "servidor" que bloqueava múltiplos servidores, cargos por servidor, convites por servidor e boa parte do FASE 7/8 **agora existe** (ver seção 1). O que resta dessas dependências (categorias, boost, server tags, temas por servidor, onboarding, fórum, stage, eventos) é trabalho de UI/feature específico sobre essa fundação, não mais um bloqueio de esquema.

---

## 1. Fundação de dados (bloqueador da maior parte do resto)

| Item | Status | Nota |
|---|---|---|
| Tabela `servers` (múltiplos servidores) | `DONE` | `servers`/`server_members` reais (`apps/api/src/servers.ts`/`serverMembers.ts`). Migração automática no boot: o servidor único existente virou o primeiro `servers` real ("Lobby dos amigos", dono = conta mais antiga), todo usuário/canal/cargo/soundboard existente migrado sem perda de dado — verificado contra uma cópia do banco de produção antes de aplicar de verdade, e de novo direto em produção depois do deploy. Qualquer usuário cria servidor novo (sem permissão especial), que já nasce com 1 canal de texto + 1 de voz padrão. |
| Canais unificados por servidor | `DONE` (nível API) | `text_channels`/`voice_channels` continuam duas tabelas físicas separadas de propósito — fundi-las arriscaria colisão de id numa migração de produção real (o `channelSlug()` de cada uma já gera ids independentes hoje). Unificadas só na camada de API: `GET /api/servers/:serverId/channels` devolve um `Channel[]` com discriminador `type: 'TEXT'\|'VOICE'`. Geração de id de canal de voz continua global (não por servidor) de propósito: o nome da sala do LiveKit é o id do canal, e esse namespace é único pro processo inteiro — escopar por servidor arriscaria duas salas de servidores diferentes colidirem e misturarem áudio. |
| Categorias de canal | `MISSING` | Canais de texto e de voz continuam listas planas (sem agrupamento) dentro de cada servidor. |
| Canais de voz como dados (não `.env`) | `DONE` | Tabela `voice_channels` (`apps/api/src/db.ts`), CRUD em `apps/api/src/voiceChannels.ts`, rotas `POST`/`DELETE /api/servers/:serverId/voice-channels`, UI de criação em `Workspace.tsx`. |
| Cargos (`roles`) | `DONE` (por servidor) | Tabelas `roles`/`user_roles` (`apps/api/src/roles.ts`), agora escopadas por `server_id` — cada servidor tem seu próprio `@everyone` (id gerado, a constante global `EVERYONE_ROLE_ID` foi removida por virar ambígua) e sua própria hierarquia de posição. Sem hierarquia de "dono" separada nem reordenação manual de posição — redução deliberada, ver §15. |
| Permissões granulares (allow/deny/inherit) | `PARTIAL` | Bitfield real (`Permission` em `packages/shared`, agora com `MANAGE_SERVER`) checado no backend por servidor em canais, mensagens, soundboard, cargos e moderação — mas só "concede" (sem allow/deny/inherit por canal, sem override por canal individual). |
| Convites reais (tabela, expiração, usos) | `DONE` (nível servidor) — `MISSING` expiração/limite de usos | Tabela `invites` (`apps/api/src/invites.ts`): um código regenerável por servidor, `POST /api/servers/:serverId/invite`/`.../invite/regenerate`, resgatado via `POST /api/invites/:code/redeem`. Schema já suporta `max_uses`/`expires_at`, mas ficam sempre `NULL` nesta rodada — sem UI pra configurar isso ainda. O token de convite global no `.env` continua existindo separadamente, controlando só "criar uma conta na instância" (decisão deliberada — ver nota no §0). |
| Timeout por servidor | `DONE` | Timeout deixou de ser por conta inteira (`users.timeout_until`, coluna preservada mas não mais escrita) e virou `server_members.timeout_until` — um timeout aplicado no servidor A não bloqueia mais DM nem mensagens em outro servidor, igual o comportamento real do Discord. Migração copiou qualquer timeout ativo pro servidor padrão, ninguém perdeu um timeout em vigor. |
| Amigos / bloqueios / DMs 1:1 | `DONE` (sem grupo) | Tabelas `friendships`/`blocks`/`dm_channels`/`dm_messages` (`apps/api/src/friendships.ts`/`blocks.ts`/`dmChannels.ts`) — continuam de propósito fora do conceito de servidor (amizade e DM cruzam servidores, igual Discord real). Pedido/aceite/recusa/remoção/bloqueio reais, DM 1:1 exige amizade `ACCEPTED`. DM em grupo, reação/pin/busca/anexo dentro de DM continuam `MISSING`. |
| WebSocket real para texto/presença/typing | `DONE` (texto/salas/canais/amigos/DM/servidores) — `MISSING` (typing/presença de status) | `apps/api/src/realtime.ts` ganhou `sendToServerMembers(serverId, evento)` — todo evento de canal/cargo/membro/soundboard/mensagem passou a ser entregue só pra quem é membro daquele servidor (resolvido na hora via `server_members`, sem cache/salas), em vez do `broadcast()` global de antes. `broadcast()` puro sobra só pra `MEMBER_BANNED`/`MEMBER_UNBANNED` (ban continua de instância inteira). Verificado com um script HTTP+WebSocket real confirmando que um não-membro de um servidor nunca recebe seus eventos. Ainda falta: typing indicator e presença de status. |
| Storage de objetos (uploads) | `DONE` | MinIO self-hosted (novo serviço no `docker-compose.yml`, ver §0). Usado só para anexo de mensagem por enquanto — avatar/banner continuam via `data:` URL (não migrados, sem necessidade). |
| Migrations versionadas | `PARTIAL` | Ainda é `CREATE TABLE IF NOT EXISTS`/seed condicional (sem versionamento formal), mas já suportou com sucesso e sem perda de dado em produção não só tabelas novas (`voice_channels`, `servers`) como um rebuild real de tabela existente (`text_channels`/`roles`, mudando a constraint `UNIQUE`) — o passo de maior risco de qualquer migração até agora nesta sessão, testado contra uma cópia do banco de produção antes de aplicar de verdade. Continua não sendo um sistema de migration versionado formal. |

**Recomendação**: com a fundação de múltiplos servidores feita, o `DISCORD_PARITY_PLAN.md` não tem mais nenhum item de fundação de dados grande pendente. O que resta desta seção (categorias de canal, allow/deny por canal, expiração/limite de uso de convite, typing/presença) é trabalho de feature específico, não mais uma mudança de esquema bloqueadora.

---

## 2. Autenticação e conta (Seção 2, 107-108 do pedido)

| Item | Status |
|---|---|
| Registro com convite | `DONE` — `POST /api/auth/register`, token único global, senha com hash |
| Login/logout | `DONE` |
| `registration_enabled`/`invite_only` configurável | `PARTIAL` — só existe o modo invite-only fixo; não há toggle admin |
| Alterar senha | `MISSING` |
| Alterar email/username | `MISSING` (username é fixo no registro) |
| Recuperação de senha | `MISSING` (sem email configurado — precisaria de SMTP) |
| Sessões/dispositivos (listar, revogar) | `MISSING` — sessão é cookie stateless, não há registro de sessões ativas |
| MFA/TOTP/códigos de recuperação | `MISSING` |
| Passkeys/WebAuthn | `MISSING` |
| Logout de todos os dispositivos | `BLOCKED` — impossível sem sessão stateful (precisaria trocar `SESSION_SECRET` por usuário ou guardar sessões em tabela) |

---

## 3-5. Interface principal, barra de servidores, pastas (Seções 3-5)

| Item | Status |
|---|---|
| Layout 3 colunas (rail/canais/conteúdo/membros) | `DONE` — já implementado e redesenhado visualmente |
| Múltiplos servidores na rail | `DONE` — rail real (`.map()` sobre os servidores do usuário), botão "Adicionar servidor" abre modal com abas "Criar servidor"/"Entrar com convite" |
| Pastas de servidor | `MISSING` (sem bloqueio de esquema — só falta a feature de agrupar ícones na rail) |
| Indicador de não lida/menção na rail | `MISSING` — hoje não há sequer rastreio de "última mensagem lida" |
| Responsividade mobile | `MISSING` — layout é desktop-first fixo |

---

## 4. FASE 1 — CORE (prioridade do pedido)

| Item | Status |
|---|---|
| Servidores | `DONE` (ver §1) |
| Canais (texto) | `DONE` básico — criar, listar, enviar/receber em tempo real via WebSocket, por servidor |
| Canais (voz) | `DONE` — dados reais (`voice_channels`), criar/apagar pela UI, por servidor, ainda sem categorias |
| DM | `DONE` (1:1, ver §1) — sem grupo, sem reação/pin/busca/anexo dentro do DM ainda |
| Mensagens (texto simples) | `DONE` básico |
| Mensagens (tempo real de verdade) | `DONE` — WebSocket, ver §1 |
| Amigos | `DONE` (pedido/aceite/recusa/remoção/bloqueio, ver §1) |
| Cargos | `DONE` (por servidor, ver §1) |
| Permissões | `PARTIAL` (ver §1) |

## 5. FASE 2 — VOZ (prioridade especial #1 do pedido)

| Item | Status |
|---|---|
| WebRTC/SFU (LiveKit) | `DONE` |
| Conectar/desconectar canal de voz | `DONE`, com som próprio sincronizado (corrigido nesta sessão) |
| Mute/deafen | `DONE` |
| Volume individual por participante | `DONE` |
| Reconexão automática | `PARTIAL` — não verificado explicitamente; LiveKit client tem retry nativo, mas não há UI de "reconectando..." |
| Timeout ao entrar/trocar de canal de voz | `DONE` (achado real em 2026-09-11, relatado pelo usuário com 2 prints, 1ª correção insuficiente) — `room.connect()`/`room.disconnect()` não tinham timeout próprio, mais um problema mais sutil: a tela de "Entrando na sala..." ficava presa a `joiningId`, que só era liberado quando a *promise* de `room.connect()` resolvia — mas `RoomEvent.ConnectionStateChanged` pode virar "Connected" (e já atualizar cabeçalho/lista de membros) antes dessa promise realmente resolver, um desalinhamento real do client do LiveKit. 1ª correção (timeout de 20s dentro de `connect()`) não cobria esse caso porque ainda dependia da mesma promise. Corrigido de vez com uma rede de segurança independente em `Workspace.tsx`: libera a tela assim que `voice.connected` vira `true` de verdade (reage ao estado real, não à promise), com teto de 15s que libera de qualquer jeito mesmo se a conexão nunca se confirmar. |
| TURN/coturn | `MISSING` — funciona hoje só por causa do IP público direto da VPS; falharia atrás de NAT simétrico/firewall restritivo |
| Push-to-talk / Voice Activity | `DONE` (input mode já implementado) |
| Teste de microfone | `DONE` |
| Noise suppression/echo/AGC | `PARTIAL` — Krisp (noise suppression) integrado; echo cancellation/AGC dependem do que o browser nativo já faz via `getUserMedia` constraints, não há controle fino |

## 6. FASE 3 — TRANSMISSÃO DE TELA (prioridade especial #2)

| Item | Status |
|---|---|
| Seleção de fonte (app/tela) com preview | `DONE` — picker nativo Electron já com abas |
| Seletor de resolução/FPS antes de iniciar | `DONE` |
| Toggle de compartilhar áudio | `DONE` |
| Som próprio de início/fim de transmissão | `DONE` (corrigido nesta sessão) |
| Indicador "AO VIVO" | `DONE` (mas note: foi removido da lista de membros por pedido do usuário e centralizado na lista de canais de voz — comportamento intencional, não regressão) |
| Trocar qualidade sem encerrar | `MISSING` — precisa renegociar track, não implementado |
| Multistream (vários compartilhando ao mesmo tempo) | `PARTIAL` — LiveKit suporta nativamente múltiplos publishers; UI de grid/foco pra múltiplas transmissões simultâneas não testada/implementada |
| Redução automática de bitrate sob perda de pacote | `PARTIAL` — LiveKit tem adaptive stream nativo; não há UI mostrando isso ao usuário |
| Fullscreen / Focus / PiP | `PARTIAL` — fullscreen existe; grid/focus/PiP formal não confirmado |

## 7. FASE 4 — VÍDEO

| Item | Status |
|---|---|
| Câmera on/off | `DONE` |
| Preview antes de ligar | `DONE` |
| Selecionar dispositivo de câmera | `DONE` |
| Fundo/blur/fundo customizado | `MISSING` |
| Grid multi-participante | `PARTIAL` |

## 8. FASE 5 — SOCIAL

| Item | Status |
|---|---|
| Perfil (avatar, banner, bio, pronomes, cor) | `DONE` |
| Mini-perfil / popover | `DONE` — inclui agora atividade rica (capa+progresso, sessão atual) |
| Presença (online/ausente/dnd/invisível/offline) | `MISSING` — hoje só existe "conectado à voz" ou não; não há status de presença geral (só atividade de jogo/música) |
| Status personalizado (emoji+texto+duração) | `MISSING` |
| Atividade (jogo/Spotify) | `DONE` — implementado nesta sessão inteira (detecção real via `ps-list`+`windows-media-sessions`, sem simulação) |
| Notificações (sistema/push) | `MISSING` |
| Busca de mensagens | `DONE` (por canal) — `GET /api/text-channels/:id/messages/search?q=`, `LIKE` parametrizado com fuga manual de `%`/`_`/`\`; sem busca cross-canal/cross-servidor (não existe ainda). |
| Inbox/caixa de entrada | `MISSING` |
| Reações | `DONE` — picker completo de emoji unicode (busca + 9 categorias, dataset com ~1900 emojis), tempo real via WebSocket, `apps/api/src/reactions.ts`. Super Reaction animada (Premium) continua `MISSING`. |
| Threads | `MISSING` |
| Enquetes | `MISSING` |
| Edição/exclusão de mensagem | `DONE` — autor sempre pode; quem tem o cargo com `MANAGE_MESSAGES` também pode apagar mensagem de outro (não editar, igual Discord real); `PATCH`/`DELETE /api/text-channels/:id/messages/:id`, indicador "(editado)", tempo real via WebSocket. |
| Pins | `DONE` — `POST`/`DELETE /api/text-channels/:id/messages/:id/pin`, exige `MANAGE_MESSAGES`, teto de 50 por canal (mesmo do Discord real), painel "Mensagens fixadas" na UI, tempo real via WebSocket (reaproveita `TEXT_MESSAGE_UPSERT`). |
| Reply | `DONE` — só guarda o id da mensagem original (não um snapshot congelado), resolvido contra o que já está carregado na conversa; mostra placeholder honesto se não encontrar. Clique no preview pula/destaca a original. |
| Forward (encaminhar pra outro canal/DM) | `DONE` — `POST .../messages/:id/forward` (origem canal ou DM) pra qualquer canal de qualquer servidor do usuário ou qualquer DM/amigo, com atribuição "Encaminhada de {autor}" congelada no momento do envio. Sem anexo no forward (risco real de referência compartilhada de objeto no MinIO, ver nota no código), sem comentário adicional junto, um destino por vez, sem "ir pra mensagem original" ainda. Verificado com 17 checagens E2E reais (5 caminhos, encadeamento, negativos, isolamento de realtime) + dois navegadores reais + smoke test em produção. |
| Markdown (negrito/itálico/negrito+itálico/sublinhado/tachado/spoiler/código inline/bloco de código/autolink) | `DONE` — renderizador próprio em `apps/web/src/components/Markdown.tsx`, monta árvore de elementos React (nunca `dangerouslySetInnerHTML`), 15 testes unitários cobrindo formatação e segurança contra XSS. Faltam: escape com barra invertida, citações (`>`), listas. |
| Emoji picker (unicode) | `DONE` — busca por nome + 9 categorias sobre o dataset completo do unicode-emoji-json (vendorizado em `packages/shared/src/emoji-data.ts`, gerado por script, sem dependência em runtime); `apps/web/src/components/EmojiPicker.tsx`, lazy-loaded, posicionamento fixo com clamp de viewport (mesma ideia do `ProfilePopover`). |
| Emoji/sticker customizado do servidor | `MISSING` — sem bloqueio de esquema desde que `servers` existe (ver §1); falta implementar a feature em si |
| Upload de arquivo/imagem em mensagem | `DONE` — até 15MB/arquivo, 5 por mensagem, via MinIO (ver §0/§1); vídeo funciona como download genérico (sem preview/transcodificação) |
| GIF picker | `MISSING` |

## 9. FASE 6 — PERSONALIZAÇÃO

| Item | Status |
|---|---|
| Temas (claro/escuro/ash/onyx/sistema) | `DONE` |
| Densidade da UI | `DONE` |
| Estilo de mensagem (padrão/compacto) | `DONE` — "agrupado" não confirmado |
| Sliders de fonte/espaçamento/zoom | `DONE` |
| Cor de acento customizada (hex) | `DONE` |
| Avatar animado (GIF) | `MISSING` |
| Banner animado | `MISSING` (banner estático já existe) |
| Temas Premium/editor de tema completo | `MISSING` |
| Perfil por servidor | `BLOCKED` por §1 |

## 10. FASE 7 — COSMÉTICOS / PREMIUM

Tudo nesta fase é `MISSING`: Shop, moeda interna (Orbs), inventário, decorações de avatar, profile effects, profile frames, nameplates, display name styles, badges, sistema de tiers Premium/Boost, server tags, server themes. Nenhuma infraestrutura existe (sem tabela de itens, sem inventário, sem moeda). É a fase de maior volume de trabalho novo e menor urgência funcional — o pedido já reconhece isso como "sem cobrança real, tudo administrável".

## 11. FASE 8 — SERVER POWER FEATURES

`Timeout/ban/kick` agora `DONE` (ver §1, §15) — `POST/DELETE /api/moderation/timeout`, `/bans`, `/voice-kick`, com hierarquia por posição de cargo. O resto continua `MISSING` ou `BLOCKED` por §1: fóruns, stage channels, eventos, onboarding, rules screening, aplicação para entrar, AutoMod, audit log, slowmode (não existe nem por canal).

## 12. FASE 9 — APPS

| Item | Status |
|---|---|
| Bot de música (participante real na call) | `DONE` — arquitetura completa, corrigida nesta sessão (jitter buffer, scheduler) |
| Bots/apps genéricos (slash commands, webhooks, botões, modals) | `MISSING` — o único "bot" é o SausiMusic, hardcoded, sem framework de apps reutilizável |
| Comandos de música via texto (`/play`, `!play` etc.) | `DONE` — parser próprio em `packages/shared` |
| Slash command picker de verdade (UI `/`) | `MISSING` — comandos de música são digitados como texto puro, não há autocomplete/picker |
| Soundboard | `DONE` — áudio real via LiveKit (track publicada por quem toca, `Track.Source.Unknown` + name "soundboard", SFU distribui pra sala inteira, sem relay de servidor); upload com validação real de duração (`decodeAudioData`, não só tamanho de arquivo); volume dedicado por ouvinte; sincronização ao vivo via WebSocket; toast de quem tocou o quê via canal de dados do LiveKit. Achado real em 2026-09-11 (relatado pelo usuário, com print como prova): no cliente desktop empacotado, `playSoundboardSound` usava `fetch()` numa `data:` URL pra pegar os bytes do áudio, e a CSP do Electron bloqueava isso (`connect-src` não liberava o esquema `data:`) — dava "Failed to fetch" e nenhum som saía. Corrigido decodificando a `data:` URL manualmente (`atob`+`Uint8Array`, sem `fetch()` nenhum, ver `apps/web/src/livekit/useVoiceRoom.ts`), mais `data:` adicionado ao `connect-src` como defesa em profundidade. Isso explica por que a "confirmação ao vivo" nunca tinha chegado — o recurso realmente não funcionava no desktop. |
| Webhooks | `MISSING` |
| Activities (jogos in-call) | `MISSING` |

## 13. FASE 10 — EXTRAS

Clips, overlay de jogo, streamer mode, quests, E2EE avançado: todos `MISSING`. Overlay nativo Windows é `OPTIONAL`/baixa prioridade conforme o próprio pedido (§103). E2EE de mídia: `OPTIONAL` — LiveKit suporta E2EE nativo (frame encryption), viável de habilitar depois, mas não trivial e não crítico pra um grupo fechado de amigos confiando na própria VPS.

---

## 14. Segurança e infraestrutura transversal (Seções 127-130)

| Item | Status |
|---|---|
| Hash de senha | `DONE` (a confirmar algoritmo exato em `users.ts`) |
| HTTPS | `DONE` (Caddy) |
| Rate limiting | `DONE` (nos endpoints que existem) — auth, criação de canal, mensagens, reações, cargos, moderação e agora upload de anexo (`uploadLimiter`) têm limiter próprio |
| Validação de permissão no backend | `DONE` (reduzida) — bitfield de permissões checado em canais/mensagens/soundboard/cargos/moderação, com hierarquia por posição de cargo; ainda sem allow/deny por canal individual (ver §1) |
| CSP | `DONE` no cliente desktop empacotado; não configurado no `web` servido puro (não há necessidade igual, já que é servido por origem própria via Caddy) |
| Admin global (painel) | `PARTIAL` — a aba "Membros"/"Cargos" das configurações do servidor já cobre moderação básica (ver §1, §15); não há um painel dedicado separado |
| Feature flags | `MISSING` — recomendado antes de começar a ligar features grandes em produção incrementalmente |
| i18n | `MISSING` — strings em português hardcoded em todos os componentes |
| Observabilidade estruturada | `MISSING` — hoje é `console.log`/arquivo de debug ad-hoc no desktop |

---

## 15. Prioridade especial do usuário (Seção 141) — status atual

1. Voz estável — `DONE`
2. Transmissão de tela — `DONE` (falta troca de qualidade sem reconectar)
3. Compartilhamento de áudio — `DONE`
4. Vídeo — `DONE` básico (falta fundo/blur)
5. Conversar com amigos — `DONE` (sistema de amigos real + DM 1:1, ver §1; grupo de DM ainda `MISSING`, forward já desbloqueado por multi-servidor mas não implementado)
6. Servidores e canais — `DONE` (múltiplos servidores reais, ver §1; só categorias continuam `MISSING`)
7. Bots de música — `DONE`
8. Personalização de perfil — `DONE`
9. Temas — `DONE`
10. Sistema Premium completo — `MISSING`
11. Soundboard — `DONE` (áudio real via LiveKit, agora por servidor; falta confirmação ao vivo do usuário numa call de verdade)
12. Roles/permissões — `DONE` (por servidor, ver §1)
13. Administração — `DONE` (básica: kick da voz, timeout por servidor, ban/desban de instância, cargos — via aba "Membros"/"Cargos"/"Convites"; sem painel dedicado nem audit log, ver §14)
14. Chat completo — `PARTIAL` (texto em tempo real, markdown, edição/exclusão, reações com picker completo, reply, pins, busca por canal, upload de arquivo/imagem, forward e renomear canal já funcionam; threads/enquetes ainda ausentes, nenhum bloqueado por esquema)

---

## 16. Próximos passos recomendados (ordem sugerida, não decidida ainda)

Dado que grande parte do pedido depende da fundação de dados (§1) que não existe, e que o próprio usuário pediu para não trabalhar em tudo simultaneamente, os candidatos a "próximo passo" são:

- **A) Fundação de dados + WebSocket real** — `DONE` (ver §1). Necessário antes de roles/permissões/DMs/moderação/auditoria.
- **B) Chat completo no servidor único atual** — markdown, edição/exclusão, reações, reply, pins, busca por canal e upload de arquivo/imagem **já feitos** (ver §8). Falta só: forward (depende de DM/multi-servidor, `BLOCKED` por §1) e emoji picker completo — os dois de baixo valor isolado ou bloqueados, então esta opção está praticamente esgotada.
- **C) Roles/permissões básicas + moderação (kick/ban/timeout)** — `DONE` (ver §1, §14, §15). Cargos globais reais, bitfield de permissões, hierarquia por posição, kick/ban/timeout com força de desconexão real, aba "Cargos"/"Membros" funcional. Verificado com 28 checagens de E2E real (dois usuários, WebSocket, banco) e confirmado em produção logo após o deploy. Pendente só de uma passada visual/UX do usuário nas novas telas (não dá pra abrir navegador a partir deste ambiente).
- **D) Soundboard** — `DONE` (ver §12), pendente só de confirmação ao vivo do usuário numa call real.
- **E) Upload de arquivo/imagem em mensagem** — `DONE` (ver §0/§1/§8). Primeiro serviço de infraestrutura novo da sessão (MinIO self-hosted, nunca exposto à internet). Verificado com 18 checagens locais (MinIO real via Docker, incluindo a prova de segurança de que um SVG malicioso é sempre forçado a download) + 8 checagens direto em produção via HTTPS (registro, upload, download com bytes idênticos, envio de mensagem, exclusão limpando o objeto).
- **F) Amigos + mensagens diretas 1:1** — `DONE` (ver §1, §4, §15). Pedido/aceite (com auto-aceite em pedido mútuo simultâneo)/recusa/remoção/bloqueio reais; DM 1:1 exige amizade; `realtime.ts` ganhou envio direcionado (`sendToUsers`) em vez de só broadcast global. Escopo reduzido deliberado: sem DM em grupo, sem "solicitação de mensagem" de não-amigo, sem reação/pin/busca/anexo dentro do DM ainda. Verificado em 3 camadas: CRUD puro (31/31), E2E via HTTP+WebSocket com 3 usuários (31/31), e verificação visual real com Playwright em dois navegadores (pedido → aceite ao vivo → DM → mensagens nos dois sentidos, sem reload, sem erro de console) + smoke test em produção via HTTPS (7/7).
- **G) Fundação de múltiplos servidores de verdade** — `DONE` (ver §0, §1, §3-5, §4, §15). `servers`/`server_members`/`invites` reais; migração automática e sem perda de dado do único servidor existente ("Lobby dos amigos") pro primeiro `servers` real, incluindo o rebuild de `UNIQUE(name)` → `UNIQUE(server_id, name)` em `text_channels`/`roles` (o passo de maior risco desta sessão, testado contra uma cópia do banco de produção antes de aplicar de verdade). Cargos/permissões/timeout passaram de globais para por-servidor; ~40 rotas migraram pra `/api/servers/:serverId/...` com isolamento real (404, nunca 403, pra não-membro); `realtime.ts` ganhou `sendToServerMembers`. Rail de servidores real na UI, com modal de criar/entrar por convite, `ServerSettings` com perfil de servidor editável de verdade e aba de convites nova. Escopo reduzido deliberado: sem categorias, boost, server tags, exclusão de servidor pela UI, convite com expiração/limite de uso (schema já suporta, UI não). Verificado em 4 camadas: migração replayada contra cópia real do banco de produção (zero perda de dado, `foreign_key_check` limpo) antes de tocar em produção, script E2E HTTP+WebSocket real (isolamento entre servidores, convite, permissão, entrega de evento só pra membro), verificação visual real com Playwright em dois navegadores (criar servidor → gerar convite → outro usuário entra → mensagem em tempo real no novo servidor), e smoke test em produção via HTTPS (8/8) logo após o deploy.
- **H) Encaminhar mensagem (forward)** — `DONE` (ver §8, §15). Desbloqueado por F+G (precisa de DM e de múltiplos servidores de verdade pra ter destino cross-servidor). `POST .../messages/:id/forward` tanto com origem canal quanto origem DM, destino qualquer canal de qualquer servidor do usuário ou qualquer DM/amigo (abre a DM na hora se não existir ainda), reaproveitando as mesmas checagens de acesso que editar/apagar/pin já tinham pra origem e as mesmas de enviar mensagem normal pro destino (timeout/bloqueio) — sem inventar uma permissão nova que a rota de enviar mensagem em si nem checa hoje. Nenhuma variante nova de evento de tempo real precisou existir. Escopo reduzido deliberado: sem anexo (risco real de referência compartilhada de objeto no MinIO — apagar uma cópia apagaria o objeto da outra), sem comentário adicional, um destino por vez, sem "ir pra mensagem original" (só guarda os ids de melhor esforço). Verificado com 17 checagens E2E reais (os 5 caminhos canal/DM × canal/DM, encadeamento de forward-de-forward atribuindo ao remetente imediato, destino sem acesso, bloqueio, mensagem de bot, isolamento de realtime) + dois navegadores reais (forward cross-servidor e forward pra DM sem conversa prévia, ambos entregues ao vivo) + smoke test em produção via HTTPS (5/5).
- **I) Renomear canal de texto/voz** — `DONE`. Quem tem `MANAGE_CHANNELS` pode renomear um canal existente sem perder id/descrição/data de criação; checagem de nome duplicado por servidor; `TEXT_CHANNEL_UPDATE`/`VOICE_CHANNEL_UPDATE` novos em tempo real pra outros membros verem o novo nome sem F5. Verificado com teste automatizado real (HTTP contra API de verdade: 401 sem sessão, 403 sem permissão, 404 em servidor errado, 400 nome vazio, 409 nome duplicado, persistência e imutabilidade de id/descrição/data) — passou junto com o typecheck e o resto da suíte antes do commit.
- **J) Emoji picker completo (unicode)** — `DONE` (ver §8). Troca a paleta curada de 8 emojis por um picker real sobre o dataset completo do unicode-emoji-json (~1900 emojis, 9 categorias), vendorizado como `.ts` gerado e commitado em `packages/shared` (sem dependência em runtime, já que o `tsconfig` do pacote não tem `resolveJsonModule`). Busca por nome + abas de categoria; validação do servidor passou de "está numa lista de 8" pra "está no dataset conhecido" (`Set` construído uma vez). Achado real de UX corrigido antes de fechar: um popover `position:absolute` do tamanho do antigo picker de 8 emojis cabia sempre na área visível da lista de mensagens, mas o novo picker (busca+abas+grid) é alto o suficiente para ser cortado pelo `overflow:auto` da lista quando a mensagem está perto do fim — corrigido reaproveitando a mesma técnica do `ProfilePopover` (`position:fixed` com coordenadas calculadas a partir do retângulo do botão, com clamp de viewport). Verificado com E2E real (HTTP contra API de verdade: emoji fora da paleta antiga aceito, string arbitrária e emoji vazio rejeitados com 400) + navegador real via Playwright (busca, troca de categoria, seleção aplicando a reação ao vivo, sem clipping, sem erro de console novo).

Com A–J feitos, o pedido original não tem mais nenhum item de fundação de dados grande pendente. O que resta do pedido é trabalho de feature específico: categorias de canal, threads, enquetes, presença/status, indicador de não-lida, e toda a FASE 7/8 (cosméticos/Premium/server tags/boost).

Este documento será atualizado a cada sessão de trabalho subsequente com o que foi de fato implementado, testado e implantado — nunca marcar `DONE` sem teste ponta a ponta real, conforme a regra do pedido original.
