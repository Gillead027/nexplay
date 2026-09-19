# DISCORD_USER_JOURNEYS.md — Jornadas de usuário do NexPlay

Este documento segue, passo a passo, o que uma pessoa faz e o que o app responde em cada fluxo completo. Ele complementa os outros três documentos da auditoria:

- `DISCORD_UI_ATLAS.md` descreve cada interação isolada em 36 campos.
- `DISCORD_INTERACTION_MATRIX.md` põe as 174 interações lado a lado em tabelas.
- `DISCORD_NAVIGATION_TREE.md` mostra onde cada interação mora.

Aqui a pergunta é outra: **uma pessoa consegue fazer a tarefa inteira, do começo ao fim, do jeito que faria no Discord?**

## Como ler

- Toda linha de passo cita a ficha do Atlas (coluna **Ficha**). Nada aqui foi descrito sem estar numa ficha lida no código.
- Onde o Atlas marca "a confirmar", o passo diz isso. Não estimei nada para preencher lacuna.
- Status de cada passo: **DONE** (funciona como esperado), **PARTIAL** (funciona com limitação real), **MISSING** (não existe) e **BROKEN** (existe e se comporta errado).
- Cada jornada termina com um veredito e com a lista do que a separa do Discord.
- Nada foi reconstruído nesta etapa. Os passos DONE são funcionalidades reais que não devem ser refeitas.

Escopo: roteiros 0 a 13 do Atlas. Jornadas que dependem de roteiros ainda não auditados (mini-perfil, notificações, Quick Switcher em profundidade) ficam de fora até a auditoria chegar lá.

---

## Índice

| # | Jornada | Veredito |
|---|---|---|
| J1 | Abrir o app e entrar em um canal de voz | DONE, com 1 lacuna no boot |
| J2 | Mutar, desmutar e ensurdecer | PARTIAL: sem atalho e sem som de ensurdecer |
| J3 | Transmitir a tela | DONE no desktop, PARTIAL na web |
| J4 | Assistir à transmissão de outra pessoa | DONE, com lacunas menores |
| J5 | Fechar a janela sem sair da call | MISSING: não há como |
| J6 | Sair de verdade | PARTIAL: só existe uma forma de sair |
| J7 | Recarregar ou perder a rede durante a call | PARTIAL |
| J8 | Sessão expira com o app aberto | DONE (corrigido e em produção) |
| J9 | Atualização chega no meio de uma call | PARTIAL |

J1 a J6 são as jornadas pedidas. J7 a J9 foram adicionadas porque a auditoria mostrou falhas que só aparecem quando se encadeia o fluxo.

---

## J1 — Abrir o app e entrar em um canal de voz

**Objetivo:** sair do ícone do NexPlay na área de trabalho até estar falando em um canal de voz.
**Pré-condições:** app instalado; conta existente.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Dá duplo clique no NexPlay.exe | O processo sobe com sandbox ligado e pede o bloqueio de instância única. A janela só aparece em `ready-to-show`. Ela carrega a SPA de produção. | APP_LAUNCH (0.1) | DONE |
| 1a | Abre o app de novo com ele já rodando | A segunda instância encerra na hora, sem criar janela. A original restaura (se minimizada) e ganha foco. | APP_SECOND_INSTANCE (0.2) | DONE |
| 1b | O servidor está fora do ar | Aparece um diálogo nativo "NexPlay indisponível" com a origem e o motivo. Não existe tela de "tentando reconectar" nem retry automático. | APP_LAUNCH (0.1) | PARTIAL |
| 2 | Vê a janela | Janela sem moldura do SO, com barra de título própria (minimizar, maximizar, fechar). | WINDOW_MINIMIZE / MAXIMIZE / CLOSE (0.3 a 0.7) | DONE |
| 3 | Espera o carregamento | `LoadingWindow` aparece enquanto `GET /api/session` responde. Com cookie válido a tela vira o Workspace. Sem cookie vira a tela de entrada. | SESSION_RESTORE_ON_BOOT (1.1) | DONE |
| 4 | Se estava deslogada: escolhe "Entrar", digita usuário e senha, envia | Login por cookie HttpOnly assinado, válido por 12 h. Limite de 20 tentativas por 15 min por IP. Conta banida e credenciais erradas têm erro próprio. | LOGIN_USERNAME_FIELD, LOGIN_PASSWORD_FIELD, LOGIN_SUBMIT, LOGIN_ERROR_INVALID_CREDENTIALS, LOGIN_ERROR_BANNED (1.3, 1.4, 1.7, 1.9, 1.10) | DONE |
| 5 | Clica no ícone do servidor na rail | O servidor abre com suas categorias e canais na sidebar. | SERVER_SELECT (2.4) | DONE |
| 6 | Clica em um canal de voz | `joinChannel` sai do contexto de texto e mostra o overlay "Entrando na sala...". Com o modo de desempenho Completo ele usa a View Transition. Depois conecta ao LiveKit. | VOICE_CHANNEL_JOIN (6.1) | DONE |
| 7 | Espera conectar | Há um timeout próprio de 20 s. Se estourar, a mensagem é "A conexão com o canal de voz demorou demais. Verifique sua rede e tente de novo." e a pessoa continua fora, livre para tentar de novo. | VOICE_CHANNEL_JOIN_ERRORS (6.2) | DONE |
| 8 | Fica dentro da sala | O microfone é publicado. O som de entrada toca só depois que a UI já mostra "dentro". O painel de voz aparece acima do rodapé (canal, servidor, câmera, compartilhar, sair). | VOICE_CHANNEL_JOIN (6.1) | DONE |
| 8a | Não há microfone ou a permissão foi negada | A pessoa entra mesmo assim, sem áudio de saída, com a mensagem "Você entrou com o microfone desligado." | VOICE_CHANNEL_JOIN_ERRORS (6.2) | DONE |
| 9 | Os outros ouvem a entrada | Todos recebem `ParticipantConnected` e tocam o som de entrada. Quem acabou de entrar não ouve uma rajada de bipes dos que já estavam lá (supressão de 1,5 s). | VOICE_CHANNEL_JOIN (6.1) | DONE |
| 10 | Volta para um canal de texto sem sair da call | O áudio continua. `VoiceAudioSinks` fica montado durante toda a conexão, independente da tela aberta. | VOICE_AUDIO_PERSISTS_ACROSS_VIEWS (7.5) | DONE |

**Veredito:** a jornada funciona de ponta a ponta. Não refazer nada dela.

**O que a separa do Discord:**

- Sem tela de retry quando o servidor está fora do ar no boot (passo 1b).
- Sem atalho de teclado para entrar em um canal de voz (VOICE_CHANNEL_JOIN, 6.1).
- Sem Quick Switcher (QUICK_SWITCHER, 2.10) e sem navegação por teclado entre servidores (KEYBOARD_SERVER_NAVIGATION, 2.11), então o caminho é sempre mouse.
- Sem indicador de não lida na rail (RAIL_UNREAD_MENTION_INDICATOR, 2.9).
- O painel do usuário, primeiro texto que a pessoa lê ao entrar, mostrava "Desconectado" com o app aberto porque exibia o estado da chamada de voz e não a presença (USER_PANEL_IDENTITY, 13.15). **Corrigido** (commit `73e40f8`, em produção): fora de call mostra "Online". Continua valendo que o microfone e o fone ficam desabilitados fora da call, então não dá para mutar antes de entrar (USER_PANEL_CONTROLS, 13.16).
- Ao entrar em uma call, o painel "MEMBROS" lista só quem está nela (MEMBER_LIST_VOICE_ROSTER, 13.1). O botão "Mostrar membros" do cabeçalho, que não fazia nada, foi removido (13.3, commit `73e40f8`, em produção).

---

## J2 — Mutar, desmutar e ensurdecer

**Objetivo:** controlar o próprio áudio durante a call.
**Pré-condições:** conectada a um canal de voz.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Clica no ícone de microfone (rodapé da sidebar ou painel central de voz) | `toggleMicrophone` inverte o estado. O ícone troca de `MicIcon` para `MicOffIcon` e o botão ganha destaque vermelho. | VOICE_SELF_MUTE (6.3) | DONE |
| 2 | Ouve o feedback | Um som de mute e outro de unmute, distintos, tocados só para quem clicou, no volume de saída configurado. | VOICE_SELF_MUTE (6.3) | DONE |
| 3 | Os outros veem | O LiveKit propaga `TrackMuted` e `TrackUnmuted`, e o ícone muda na lista de todo mundo. Não passa pelo WebSocket do NexPlay. | VOICE_SELF_MUTE (6.3) | DONE |
| 4 | Continua ouvindo os outros | Mutar só desliga o envio do próprio microfone. O que se ouve dos outros não muda. | VOICE_SELF_MUTE (6.3) | DONE |
| 5 | Clica no ícone de fone (ensurdecer) | O app guarda se o microfone estava ligado e o desliga junto. O botão de microfone também fica desabilitado. | VOICE_SELF_DEAFEN (6.4) | DONE |
| 6 | Ouve o feedback | **Não há som de ensurdecer nem de desensurdecer.** Só o ícone muda. | VOICE_SELF_DEAFEN (6.4) | MISSING |
| 7 | Os outros veem | Veem só o mute (consequência do mute automático). **Não existe indicador de "ensurdecido" separado**, porque o LiveKit só propaga o estado do microfone. | VOICE_SELF_DEAFEN (6.4) | PARTIAL |
| 8 | Clica no fone de novo (desensurdecer) | O microfone volta **somente se estava ligado antes**. Quem já estava mutada continua mutada. | VOICE_SELF_DEAFEN (6.4) | DONE |
| 9 | Troca para "Apertar para falar" em Configurações > Voz e vídeo | O microfone desliga na hora, até a tecla ser pressionada. A tecla é configurável e o modo persiste em `localStorage` (`np:input-mode`, `np:ptt-key`), por dispositivo. | VOICE_INPUT_MODE_SELECT, VOICE_PTT_KEY_REBIND (7.9, 7.10) | DONE |
| 10 | Troca o perfil de microfone (Isolamento, Estúdio, Personalizado) | As constraints são reaplicadas no track já publicado, sem reconectar. | VOICE_MIC_PROFILE_SELECT (7.11) | DONE |
| 11 | O microfone falha no meio da call | Aparece um erro descritivo por `describeMediaError`. | VOICE_SELF_MUTE (6.3) | DONE |
| 12 | Quer mutar sem sair do jogo, com atalho | **Não existe nenhum atalho de teclado para mutar ou ensurdecer**, dentro ou fora do app. O único teclado ligado ao áudio é o de PTT. | VOICE_SELF_MUTE, VOICE_SELF_DEAFEN (6.3, 6.4) | MISSING |

**Veredito:** o núcleo é sólido, incluindo o caso mais difícil (desensurdecer respeitando o mute anterior). Faltam três coisas pequenas e bem delimitadas.

**O que a separa do Discord:**

1. Atalho de teclado para mutar e ensurdecer (passo 12). É a maior lacuna da jornada, porque quem joga não alcança o mouse.
2. Som ao ensurdecer e desensurdecer (passo 6).
3. Indicador visível para os outros de que alguém está ensurdecido (passo 7). Exigiria um estado próprio, já que o LiveKit não tem esse conceito.

---

## J3 — Transmitir a tela

**Objetivo:** compartilhar uma tela ou janela para a sala.
**Pré-condições:** conectada a um canal de voz.

### No desktop (Electron)

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Clica no ícone de compartilhar tela no painel de voz | `startOrStopScreenShare` chama `window.desktop.chooseShareSource()`. O processo principal abre o picker próprio. | VOICE_SCREEN_SHARE_START (6.7) | DONE |
| 2 | Vê o picker | Uma janela modal sobre a principal, com miniaturas de 320×180 de cada tela e janela. Se havia um picker pendente, ele é cancelado antes de abrir o novo. | SCREEN_SHARE_PICKER_OPEN (0.20) | DONE |
| 3 | Escolhe a qualidade | Só existem três: 720p30, 720p60 e 1080p60. O gatilho e o estado visual do seletor estão "a confirmar" no Atlas. | SCREEN_SHARE_QUALITY_SELECT (0.21) | PARTIAL |
| 4 | Liga ou desliga o áudio do sistema | No Windows, ligado publica o áudio em loopback junto com o vídeo. Desligado publica só o vídeo. | SCREEN_SHARE_AUDIO_TOGGLE (0.22) | DONE |
| 5 | Cancela (fecha o picker) | Nada é publicado e ninguém percebe. A pessoa volta ao painel normal, sem erro. Se Esc fecha o picker, o Atlas marca como "a confirmar". | SCREEN_SHARE_PICKER_CANCEL (0.23) | DONE |
| 6 | Confirma | A captura começa e a track é publicada com `contentHint = 'detail'` (prioriza nitidez de texto). Com áudio de sistema, `restrictOwnAudio: true` impede que a voz dos outros volte para dentro da transmissão. | VOICE_SCREEN_SHARE_START (6.7) | DONE |
| 7 | Ouve o feedback | O som de início toca só depois que a track foi publicada de verdade. | VOICE_SCREEN_SHARE_START (6.7) | DONE |
| 8 | Os outros veem | A lista de canais de voz mostra o selo "AO VIVO". Quem quiser assistir precisa clicar (ver J4). | VOICE_SCREEN_SHARE_START (6.7) | DONE |
| 9 | Quer trocar a qualidade sem parar | **Não dá.** A qualidade só se escolhe antes de iniciar. | SCREEN_SHARE_QUALITY_CHANGE (8.8) | MISSING |
| 10 | Quer saber quem está assistindo | **Não há como.** Quem transmite não recebe nenhuma informação de quantas pessoas ou quais estão assistindo. | SCREEN_SHARE_WATCH (8.2) | MISSING |
| 11 | Para pelo botão do NexPlay | `setScreenShareEnabled(false)`. O selo "AO VIVO" some. | VOICE_SCREEN_SHARE_STOP (6.8) | DONE |
| 11a | Para pela barra nativa "Parar de compartilhar" do Windows | Cai no mesmo evento `LocalTrackUnpublished`. O som de parada toca uma única vez, seja qual for o caminho. | VOICE_SCREEN_SHARE_STOP (6.8) | DONE |
| 12 | Sai da call com a transmissão ativa | `room.disconnect()` derruba todas as tracks juntas. | VOICE_DISCONNECT (6.5) | DONE |

### Na web (fora do Electron)

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Clica em compartilhar | Não há picker do NexPlay. O app usa a qualidade já configurada em Configurações e dispara o `getDisplayMedia` do navegador. | VOICE_SCREEN_SHARE_START (6.7) | PARTIAL |
| 2 | Cancela o picker do navegador | O erro `"invalid capture constraints"` é reconhecido como cancelamento e não vira mensagem de erro. | VOICE_SCREEN_SHARE_START (6.7) | DONE |

A web nunca teve escolha de qualidade nem de áudio no momento de compartilhar. É diferença de plataforma, não bug.

**Veredito:** no desktop a jornada funciona inteira. Faltam dois controles que o Discord tem.

**O que a separa do Discord:**

1. Trocar a qualidade durante a transmissão (passo 9).
2. Saber quem está assistindo (passo 10).

---

## J4 — Assistir à transmissão de outra pessoa

**Objetivo:** ver a tela que alguém compartilha na call.
**Pré-condições:** conectada ao canal de voz onde alguém está transmitindo.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Vê que alguém começou | O selo "AO VIVO" aparece na lista de canais de voz. Na galeria da call surge um card da transmissão não assistida. **A transmissão não abre sozinha.** | VOICE_SCREEN_SHARE_START (6.7), SCREEN_SHARE_WATCH (8.2) | DONE |
| 2 | Clica no card | A transmissão sai da galeria e vira um `HeroTile` grande na `.hero-row`, acima dela. Não há som e o transmissor não é notificado. | SCREEN_SHARE_WATCH (8.2) | DONE |
| 3 | Abre mais de uma transmissão | Cada uma vira seu próprio `HeroTile`, lado a lado. Não há limite de uma por vez. | SCREEN_SHARE_MULTI_HERO (8.4) | DONE |
| 4 | Ajusta o volume da transmissão | O slider é independente do volume de voz da mesma pessoa. O valor **reseta para 100 %** ao reconectar. | SCREEN_SHARE_VOLUME (8.5) | PARTIAL |
| 5 | Entra em tela cheia | No desktop usa a tela cheia da janela inteira (o mesmo estado do F11). Na web usa a Fullscreen API só no `.screen-stage`. Se falhar aparece "Não foi possível ativar a tela cheia. Tente novamente." | SCREEN_SHARE_FULLSCREEN_TOGGLE (8.6) | DONE |
| 6 | Sai da tela cheia com Esc | No desktop o processo principal intercepta Esc antes do React. Na web o navegador cuida sozinho. | SCREEN_SHARE_FULLSCREEN_EXIT_ESC (8.7), APP_FULLSCREEN_EXIT_ESC (0.15) | DONE |
| 7 | Passa o mouse no tile e clica em "Sair da transmissão" | O tile volta a ser um card pequeno na galeria, com "Ver transmissão" disponível de novo. | SCREEN_SHARE_STOP_WATCHING (8.3) | DONE |
| 8 | O transmissor para | O tile some. O retorno exato de quem estava em foco ao layout normal não foi reauditado em detalhe. | VOICE_SCREEN_SHARE_STOP (6.8) | PARTIAL |
| 9 | Quer assistir em qualidade menor para economizar banda | **Não existe controle do lado de quem assiste.** A única alavanca de qualidade é a de quem transmite, e só antes de começar. | SCREEN_SHARE_QUALITY_CHANGE (8.8) | MISSING |
| 10 | Reconecta à call | A lista de transmissões que estava assistindo (`watchingIds`) é zerada, e é preciso clicar de novo em cada uma. | SCREEN_SHARE_WATCH (8.2) | PARTIAL |

**Veredito:** funciona bem. As lacunas são de conforto, não de função.

**O que a separa do Discord:**

1. Qualidade escolhida por quem assiste (passo 9).
2. Volume e transmissões assistidas que não sobrevivem a uma reconexão (passos 4 e 10).

---

## J5 — Fechar a janela sem sair da call

No Discord: clicar no X manda o app para a bandeja, a call **continua**, e o ícone da bandeja reabre a janela. Esta é a jornada que o pedido original destaca como paridade obrigatória do desktop.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Clica no X da barra de título | `windowAction('close')` chama `mainWindow.close()`. O handler `window-all-closed` chama `app.quit()` **sem condição nenhuma**. | WINDOW_CLOSE (0.7) | BROKEN |
| 1a | Aperta Alt+F4 | É um atalho do Windows, que o NexPlay não intercepta. Cai no mesmo caminho do X, sem distinção de política. | APP_ALT_F4 (0.8) | BROKEN |
| 2 | Espera a call continuar | **A call morre.** O processo inteiro encerra, o WebSocket cai abruptamente e o LiveKit só percebe a queda depois de um pequeno atraso. Os outros veem a pessoa sair. | WINDOW_CLOSE (0.7) | BROKEN |
| 3 | Procura o ícone na bandeja | **Não existe.** `main.ts` nem importa `Tray` ou `nativeImage`. | SYSTEM_TRAY (0.9) | MISSING |
| 4 | Procura a opção "Minimizar para a bandeja" | Não existe em nenhuma configuração. | SYSTEM_TRAY (0.9) | MISSING |
| 5 | Procura "Iniciar minimizado" | Não existe, e depende da bandeja para fazer sentido. | START_MINIMIZED (0.11) | MISSING |
| 6 | Procura "Abrir ao iniciar o Windows" | Não existe nenhuma chamada a `setLoginItemSettings`. | AUTO_LAUNCH_ON_BOOT (0.10) | MISSING |

**Único caminho que hoje mantém a call com a janela fora da frente:** o botão **Minimizar**. Ele leva a janela para a barra de tarefas e não pausa nada. Voz, transmissão e WebSocket seguem ativos. Isso é PARTIAL como substituto, porque a janela continua ocupando espaço na barra de tarefas e não há ícone de bandeja para reabri-la.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 7 | Clica em Minimizar | `mainWindow.minimize()`. A call, a transmissão e o WebSocket continuam ativos. | WINDOW_MINIMIZE (0.3) | PARTIAL |
| 8 | Reabre pela barra de tarefas | Restaura a janela. Os outros não percebem diferença em nenhum momento. | WINDOW_MINIMIZE (0.3) | PARTIAL |

**Veredito:** MISSING. O passo 1 já falha, e os passos 3 a 6 não têm nenhum código por trás. Todas as lacunas partem de uma só causa: **não existe bandeja do sistema**.

**O que a separa do Discord (uma mudança destrava as quatro):**

1. Bandeja do sistema com menu (abrir, sair).
2. Política de fechar configurável: X manda para a bandeja ou encerra.
3. Só então "iniciar minimizado" e "abrir ao iniciar o Windows" passam a ter sentido.

---

## J6 — Sair de verdade

No Discord: com o app na bandeja, clicar direito no ícone e escolher "Sair" encerra tudo. Sem bandeja, fechar a janela é a única saída.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Clica no X ou aperta Alt+F4 | O processo encerra na hora, **sem confirmação**, mesmo estando em call. | WINDOW_CLOSE (0.7), APP_ALT_F4 (0.8) | DONE |
| 2 | Estava em call | A saída **não é graciosa**. Nenhum `disconnect()` explícito roda, e o `window-all-closed` não dá tempo de avisar o backend. Os outros só veem a pessoa sair quando o LiveKit detecta a perda. | WINDOW_CLOSE (0.7) | PARTIAL |
| 3 | Sai pelo caminho normal de voz antes | Clicar em sair da call primeiro faz `room.disconnect()` e depois toca o som de saída, de propósito nessa ordem. Todo o estado de voz é resetado. | VOICE_DISCONNECT (6.5) | DONE |
| 4 | Usa "Sair da conta" em Configurações | Esse caminho **não encerra o app**. Ele desconecta da voz, apaga o cookie (`DELETE /api/session`) e volta para a tela de entrada, com o app ainda aberto. Não há confirmação. | LOGOUT (1.14) | DONE |
| 5 | Procura "Sair" na bandeja | Não existe bandeja. | SYSTEM_TRAY (0.9) | MISSING |

**Veredito:** PARTIAL. Sair funciona, mas só existe uma forma, e ela é a mesma de "fechar". O Discord separa as duas ações e este app não pode separar enquanto não tiver bandeja (mesma causa raiz da J5).

**O que a separa do Discord:**

1. Sem distinção entre fechar e sair (depende da bandeja, J5).
2. Saída abrupta de uma call quando se fecha a janela sem antes clicar em sair da call.

---

## J7 — Recarregar ou perder a rede durante a call

Jornada extra. Mostra o que sobrevive quando a conexão é interrompida.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Aperta F5 ou Ctrl+R | O processo principal intercepta e chama `reloadIgnoringCache()`. A SPA remonta do zero. | APP_RELOAD (0.16) | DONE |
| 2 | Estava em call | **A call cai.** O `Room` foi criado com `disconnectOnPageLeave: true`. Os outros veem a pessoa sair, como numa queda de conexão. | VOICE_CHANNEL_JOIN (6.1), APP_RELOAD (0.16) | PARTIAL |
| 3 | Espera voltar | A sessão é restaurada e a pessoa precisa clicar no canal de voz de novo. Entrar automaticamente onde estava não acontece. Se o app volta ao mesmo servidor e canal, o Atlas marca como "a confirmar". | SESSION_RESTORE_ON_BOOT (1.1), APP_RELOAD (0.16) | PARTIAL |
| 4 | O modo de entrada e o perfil de microfone | Sobrevivem, porque estão em `localStorage`. | VOICE_INPUT_MODE_SELECT (7.9), VOICE_MIC_PROFILE_SELECT (7.11) | DONE |
| 5 | Ensurdecer, volumes individuais e transmissões assistidas | Resetam (`deafened` volta a `false` em cada `connect()`). | VOICE_SELF_DEAFEN (6.4), VOICE_PARTICIPANT_VOLUME_CONTROL (7.4), SCREEN_SHARE_WATCH (8.2) | PARTIAL |
| 6 | A rede cai sem F5 | O LiveKit tenta se recuperar sozinho. O rodapé mostra "Reconectando", depois "Conectado" de novo, **sem a pessoa fazer nada**. | VOICE_NETWORK_RECONNECT (6.9) | DONE |
| 7 | A rede não volta | O Atlas marca o comportamento como **não confirmado**: precisaria simular perda real de rede para saber se cai para "Desconectado" ou se mostra erro. | VOICE_NETWORK_RECONNECT (6.9) | PARTIAL |
| 8 | O WebSocket de dados cai | Reconecta com backoff exponencial de 1 s a 15 s. | REALTIME_RECONNECT (1.17) | DONE |

**Veredito:** PARTIAL. A recuperação de rede funciona sozinha. O F5 derruba a call por escolha deliberada da configuração do `Room`, o que difere do Discord, onde recarregar não desconecta.

---

## J8 — Sessão expira com o app aberto

Jornada extra e o único **BROKEN** confirmado nesta lista.

> **Atualização:** corrigido (commit `9dc41a6`) e publicado em produção. A tabela abaixo descreve o que a auditoria comprovou **antes** do conserto, como registro. Com o conserto, os passos 2 a 5 passam a: o WebSocket recusado consulta `GET /api/session`, um 401 para o loop e leva à tela de entrada com "Sua sessão expirou. Entre novamente para continuar." O passo 1 (nenhum aviso *antes* de expirar) continua como está.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Deixa o app aberto por mais de 12 h | Nenhum aviso proativo de expiração. O cliente não tem timer vigiando `expiresAt`. | SESSION_EXPIRE_NATURAL (1.16) | MISSING |
| 2 | Continua olhando a tela | O app segue parecendo logado por tempo indefinido, até uma chamada HTTP autenticada falhar com 401. O tratamento depende de cada chamada. | SESSION_EXPIRE_NATURAL (1.16) | BROKEN |
| 3 | O WebSocket tenta reconectar | O handshake é rejeitado com `401 Unauthorized`. O cliente **não inspeciona o código de fechamento** e trata isso como queda de rede comum. Ele agenda nova tentativa em 1 s, 2 s, 4 s, 8 s e depois **15 s para sempre**. | REALTIME_RECONNECT_SESSION_EXPIRED (5.4) | BROKEN |
| 4 | Não recebe mensagens novas | O tempo real morre, sem nenhuma mensagem explicando por quê. | REALTIME_RECONNECT_SESSION_EXPIRED (5.4) | BROKEN |
| 5 | Aperta F5 ou reabre | O boot vê o cookie inválido e mostra a tela de entrada, **sem dizer que a sessão expirou**. Fica indistinguível de nunca ter logado. | SESSION_RESTORE_ON_BOOT (1.1), SESSION_EXPIRE_NATURAL (1.16) | PARTIAL |
| 6 | Estava em call | A conexão LiveKit usa um token próprio de curta duração e não depende do cookie, então a call plausivelmente continua. O Atlas marca como **a confirmar**. | SESSION_EXPIRE_NATURAL (1.16) | PARTIAL |

**Veredito:** BROKEN. A pessoa fica presa num app aparentemente vivo e sem tempo real, sem saber que precisa entrar de novo. O conserto é pequeno e bem localizado: ao receber um fechamento por sessão expirada, ir para a tela de entrada com uma mensagem.

---

## J9 — Atualização chega no meio de uma call

Jornada extra. Aparece porque o desktop tem auto-update e a call é o uso principal.

| # | O que a pessoa faz | O que o app faz (verificado) | Ficha | Status |
|---|---|---|---|---|
| 1 | Não faz nada | A checagem roda uma vez por lançamento do app e, se há versão nova, o download começa sozinho em segundo plano. Não existe botão manual de "Verificar atualização agora". | APP_AUTO_UPDATE_CHECK, APP_AUTO_UPDATE_DOWNLOAD (0.17, 0.18) | DONE |
| 2 | Está em call quando o download termina | Um diálogo nativo modal cobre o app **a qualquer momento, inclusive em plena call**. Não há checagem de "usuário ocupado". | APP_AUTO_UPDATE_INSTALL_PROMPT (0.19) | PARTIAL |
| 3 | Escolhe "Depois" | O app segue na versão atual, e a atualização baixada espera a próxima oportunidade. | APP_AUTO_UPDATE_INSTALL_PROMPT (0.19) | DONE |
| 4 | Escolhe "Atualizar e reiniciar" | `quitAndInstall()` fecha o app e roda o instalador. **A call cai abruptamente**, sem checagem de "está numa call". | APP_AUTO_UPDATE_INSTALL_PROMPT (0.19) | PARTIAL |

**Veredito:** PARTIAL. A pessoa escolhe entre atualizar ou não, então o app não decide por ela. Mas o diálogo aparece mesmo no pior momento e não avisa que a call vai cair.

---

## Lacunas que cruzam as jornadas

Cada lacuna abaixo aparece em mais de uma jornada ou bloqueia uma inteira. Estão ordenadas por impacto na jornada. A ordem oficial de prioridade da implementação continua em `DISCORD_PARITY_PLAN.md`.

| # | Lacuna | Jornadas | Causa raiz | Tipo |
|---|---|---|---|---|
| 1 | Sem bandeja do sistema (fechar sempre encerra) | J5, J6 | `main.ts` não usa `Tray` e o `window-all-closed` sempre chama `app.quit()` | MISSING |
| 2 | Sessão expirada vira loop silencioso de reconexão | J8 | O cliente de tempo real ignora o motivo do fechamento | DONE (corrigido; já não é lacuna) |
| 3 | Sem atalho de teclado para mutar e ensurdecer | J2 | Nenhum `keydown` ligado a `toggleMicrophone` fora do PTT | MISSING |
| 4 | Diálogo de atualização ignora se há call | J9 | Nenhuma checagem de estado de voz antes de mostrar ou aplicar | PARTIAL |
| 5 | F5 derruba a call | J1, J7 | `disconnectOnPageLeave: true` no `Room` | PARTIAL |
| 6 | Sem som e sem indicador remoto de ensurdecer | J2 | O LiveKit só propaga o estado do microfone | MISSING |
| 7 | Trocar a qualidade da transmissão em andamento | J3, J4 | A qualidade só entra na captura inicial | MISSING |
| 8 | Quem transmite não vê quem assiste | J3 | Assistir é estado local (`watchingIds`), sem evento de rede | MISSING |
| 9 | Volumes e transmissões assistidas resetam a cada reconexão | J4, J7 | São estado React local, sem `localStorage` | PARTIAL |
| 10 | Sem tela de retry quando o servidor está fora do ar | J1 | `did-fail-load` só mostra um diálogo | PARTIAL |

As lacunas 1 e 2 são as de maior impacto: uma bloqueia duas jornadas inteiras e a outra deixa a pessoa presa sem explicação.

**O que já funciona e não deve ser refeito:** login e restauração de sessão, entrada e saída de voz, timeout e mensagens de erro de entrada, mute e o caso difícil de desensurdecer, PTT e perfis de microfone, picker de transmissão com qualidade e áudio, transmissão parada pela barra nativa, múltiplas transmissões em foco, tela cheia com Esc, reconexão de rede de voz, o áudio persistindo ao trocar de canal, e a instância única.

---

## Fora do escopo desta etapa

- Nada foi consertado. Este documento só registra o que a auditoria comprovou.
- Jornadas que dependem de roteiros 13 em diante (mini-perfil, notificações, Quick Switcher completo, deep links, estados offline) entram quando a auditoria chegar lá.
- Os itens "a confirmar" só se resolvem com teste real: rede perdida de verdade, Esc no picker, sessão expirada durante uma call.
