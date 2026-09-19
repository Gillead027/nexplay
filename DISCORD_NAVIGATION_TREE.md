# DISCORD_NAVIGATION_TREE.md

Árvore de navegação do NexPlay até a última ação disponível, montada só a partir do que foi verificado no código durante a auditoria de `DISCORD_UI_ATLAS.md` (roteiros 0 a 14). Cada nó cita o roteiro/ficha onde o detalhe campo a campo está. Nada aqui foi copiado do Discord real sem checar o código antes: onde o Discord tem um ramo e o NexPlay não, o ramo aparece marcado como `MISSING`, para a árvore mostrar também o que falta.

**Legenda de status**
- `CORE`: existe, funciona, é o caminho normal.
- `PARTIAL`: existe, mas falta algo que o nó explica.
- `MISSING`: não existe hoje (o nó documenta o que era esperado).
- `DESKTOP`: só no cliente Electron. `ADMIN`: exige permissão de gerenciamento. `OWNER`: só o dono do servidor.

**Fatos estruturais que afetam a árvore inteira**
- Não existe router: trocar de servidor, canal ou DM nunca muda a URL, então não há link direto nem Voltar/Avançar (Roteiro 2). O nível mais alto é só `view = 'server' | 'friends'`.
- Ao trocar de servidor o app sempre abre o primeiro canal de texto, nunca o último visitado (Roteiro 2, `CHANNEL_LIST_DEFAULT_SELECT`).
- Não existe rastreio de leitura, presença nem "digitando" (Roteiro 5): por isso os ramos de não lida, Online e indicador de digitação estão ausentes em vários lugares abaixo.

---

## Árvore

```
APP
│
├── JANELA (DESKTOP)                                                    [Roteiro 0]
│   ├── Iniciar o app
│   │   ├── Instância única: segunda execução foca a janela existente        CORE
│   │   ├── Falha de conexão no boot: diálogo "NexPlay indisponível"         CORE (sem retry automático)
│   │   └── desktop-config.json ausente/inválido: falha só no log            PARTIAL (sem aviso na tela)
│   ├── Barra de título própria (frame: false)
│   │   ├── Arrastar para mover                                              CORE
│   │   ├── Duplo clique para maximizar                                      MISSING
│   │   ├── Minimizar                                                        CORE
│   │   ├── Maximizar / restaurar (um único botão, ícone não muda)           PARTIAL
│   │   └── Fechar (X)                                                       PARTIAL
│   │       └── Encerra o processo sempre, mesmo em call, sem confirmar
│   ├── Alt+F4: mesmo caminho do X                                           PARTIAL
│   ├── Redimensionar pelas bordas (mínimo 1280×720)                         CORE
│   ├── Tela cheia
│   │   ├── F11 alterna                                                      CORE
│   │   └── Esc sai (interceptado no processo principal)                     CORE
│   ├── Recarregar: Ctrl+R / F5 (sem cache)                                  CORE
│   ├── Atualização automática
│   │   ├── Verificar ao abrir (só build empacotado)                         CORE
│   │   ├── Baixar (sem progresso na UI, só log)                             PARTIAL
│   │   ├── Diálogo "Atualizar e reiniciar / Depois"                         PARTIAL (pode aparecer em call)
│   │   └── Botão "Verificar agora"                                          MISSING
│   ├── Bandeja do sistema (ícone, menu, sair de verdade)                    MISSING
│   ├── Minimizar para a bandeja ao fechar                                   MISSING
│   ├── Iniciar com o Windows / iniciar minimizado                           MISSING
│   ├── Lembrar tamanho e posição da janela                                  MISSING
│   └── Foco/desfoco da janela (base para notificações nativas)              MISSING
│
├── ENTRADA (sem sessão)                                                [Roteiro 1]
│   ├── Restaurar sessão ao abrir (cookie de 12 h)                           CORE
│   │   └── Erro ao carregar config: tela "Não foi possível iniciar" + Tentar novamente   CORE
│   ├── Aba "Entrar"
│   │   ├── Usuário → Senha → Entrar (Enter também envia)                    CORE
│   │   ├── Erro: usuário/senha inválidos                                    CORE
│   │   ├── Erro: conta banida                                               CORE
│   │   └── Erro: limite de tentativas (20 por 15 min por IP)                CORE
│   ├── Aba "Criar conta"
│   │   ├── Usuário, senha (≥ 8), código de convite global, cor do perfil    CORE
│   │   ├── Erro: convite inválido / usuário já existe                       CORE
│   │   └── Entra automaticamente no servidor mais antigo da instância       CORE (sem evento MEMBER_JOIN)
│   ├── Mostrar/ocultar senha                                                MISSING
│   ├── Recuperar senha, MFA, passkeys                                       MISSING
│   └── Aviso de sessão expirando / relogin automático                       MISSING
│       └── Ao expirar com o app aberto: volta à tela de entrada com aviso (corrigido)
│
├── INÍCIO (view = friends)                                             [Roteiro 11]
│   ├── Botão Início na rail (badge = pedidos de amizade pendentes)          CORE
│   ├── Amigos
│   │   ├── Aba Todos
│   │   │   ├── Enviar mensagem (abre ou cria a DM)                          CORE
│   │   │   ├── Abrir perfil (mini-perfil)                                   CORE
│   │   │   └── Remover amigo (com confirmação)                              CORE
│   │   ├── Aba Pendentes (abre por padrão se houver pedido recebido)
│   │   │   ├── Aceitar (mesma chamada de "enviar pedido")                   CORE
│   │   │   ├── Recusar (sem confirmação, erro silenciado)                   PARTIAL
│   │   │   └── Cancelar pedido enviado                                      PARTIAL
│   │   ├── Aba Bloqueados → Desbloquear                                     CORE
│   │   ├── Aba Adicionar amigo
│   │   │   ├── Busca só entre quem divide servidor com você                 CORE (sem busca global)
│   │   │   └── Adicionar → "Pedido enviado" / "Agora vocês são amigos!"     CORE
│   │   └── Aba Online                                                       MISSING (sem presença)
│   ├── Mensagens diretas (sidebar, ordenadas pela última mensagem)          CORE
│   │   ├── Conversa 1:1                                                     CORE
│   │   │   ├── Enviar com markdown, editar, apagar, copiar, encaminhar      CORE
│   │   │   ├── Reagir, anexar arquivo                                       MISSING
│   │   │   ├── Fixar, buscar dentro da DM                                   MISSING
│   │   │   ├── Ligação de voz / vídeo                                       MISSING
│   │   │   └── Indicador de não lida                                        MISSING
│   │   └── DM em grupo                                                      MISSING
│   └── Loja, Premium, Atividades, Favoritos                                 MISSING (bloco Premium/cosméticos)
│
├── SERVIDORES (view = server)                                          [Roteiros 2, 3]
│   ├── Rail de servidores
│   │   ├── Clicar em um servidor (troca sidebar e painel)                   CORE
│   │   ├── Tooltip = title nativo do navegador                              CORE
│   │   ├── Botão direito no servidor                                        MISSING
│   │   ├── Reordenar, pastas de servidores                                  MISSING
│   │   ├── Indicador de não lida / menção                                   MISSING
│   │   ├── Atalho de teclado para trocar de servidor                        MISSING
│   │   └── Botão "+" → modal Adicionar servidor
│   │       ├── Aba Criar servidor (nome, descrição) → vira dono e Administrador   CORE
│   │       └── Aba Entrar com convite (código) → cargo @everyone             CORE
│   ├── Quick Switcher (Ctrl+K)                                              MISSING
│   │
│   ├── Sidebar do servidor
│   │   ├── Cabeçalho (nome do servidor)
│   │   │   ├── Clique abre direto as Configurações do Servidor              CORE
│   │   │   └── Menu suspenso (convidar, criar canal, sair...)               MISSING
│   │   ├── Sair do servidor (endpoint existe, nenhum botão chama)           MISSING
│   │   ├── Categorias
│   │   │   ├── Criar categoria (nome, "restrita à staff") ............ ADMIN CORE
│   │   │   ├── Recolher / expandir (preferência pessoal, persiste)          CORE
│   │   │   ├── "+" da categoria → Criar canal (tipo Texto ou Voz)    ADMIN  CORE
│   │   │   ├── Botão direito na categoria
│   │   │   │   ├── Marcar como lida (item vazio, sem função)                BROKEN (Roteiro 14)
│   │   │   │   ├── Recolher categoria / recolher todas                      CORE
│   │   │   │   ├── Silenciar categoria / config. de notificação (grava; nada lê)   PARTIAL (Roteiro 14)
│   │   │   │   ├── Editar categoria (nome, staff)                           CORE
│   │   │   │   ├── Excluir categoria (confirm() nativo)              ADMIN  CORE
│   │   │   │   ├── Copiar ID da categoria (sem aviso "Copiado")             PARTIAL
│   │   │   │   └── Duplicar categoria                                       MISSING
│   │   │   ├── Categoria "restrita à staff": invisível para quem só tem @everyone   CORE
│   │   │   └── Arrastar categoria para reordenar                            MISSING
│   │   ├── Canais de texto
│   │   │   ├── Clicar → abre o canal (histórico → final)                    CORE
│   │   │   ├── Arrastar para outra categoria                         ADMIN  CORE
│   │   │   │   └── Só confirma se a visibilidade muda (entra/sai de staff)  CORE
│   │   │   ├── Botão direito → "Mover para" categoria                ADMIN  CORE
│   │   │   ├── Engrenagem → Configurações do canal                   ADMIN
│   │   │   │   ├── Renomear (nome duplicado = 409)                          CORE
│   │   │   │   ├── Tópico, modo lento, visibilidade, anúncio                CORE
│   │   │   │   ├── Convites (mesmo painel do servidor)                      CORE
│   │   │   │   ├── Permissões por canal                                     MISSING (decisão de arquitetura)
│   │   │   │   └── Excluir canal (apaga mensagens em cascata)               CORE
│   │   │   └── Indicador de não lida / menção                               MISSING
│   │   └── Canais de voz (ver ramo VOZ abaixo)
│   │
│   ├── Painel central: canal de texto                                  [Roteiro 4]
│   │   ├── Cabeçalho do canal (nome, tópico, fixadas, busca)                CORE
│   │   ├── Histórico
│   │   │   ├── Rolar / carregar                                             CORE
│   │   │   ├── Mensagem nova de qualquer pessoa força rolar até o final     PARTIAL (bug: sem checar posição)
│   │   │   ├── Botão "Novas mensagens"                                      MISSING
│   │   │   ├── Carregar histórico mais antigo ao rolar para cima            MISSING (não confirmado)
│   │   │   └── Divisor de "novas mensagens"                                 MISSING
│   │   ├── Mensagem (passar o mouse → barra de ações)
│   │   │   ├── Responder → banner acima do composer → prévia clicável       CORE
│   │   │   ├── Encaminhar → canal/servidor/DM (um destino por vez)          CORE
│   │   │   ├── Copiar texto (sem aviso "Copiado")                           PARTIAL
│   │   │   ├── Adicionar reação → picker de emoji (busca + 9 categorias)    CORE
│   │   │   ├── Fixar / desafixar (MANAGE_MESSAGES, teto 50)          ADMIN  CORE
│   │   │   ├── Editar (só a própria)                                        CORE
│   │   │   ├── Apagar (própria ou MANAGE_MESSAGES; sem confirmação)         CORE
│   │   │   ├── Clique no avatar/nome → mini-perfil                          CORE
│   │   │   ├── Botão direito na mensagem                                    MISSING
│   │   │   ├── Copiar ID / link da mensagem                                 MISSING
│   │   │   └── Acesso por teclado à barra de ações                          MISSING
│   │   ├── Pastilhas de reação → clicar alterna a minha reação              CORE
│   │   ├── Mensagem "como servidor" (cartão com selo APP)                   CORE
│   │   ├── Cartão do bot de música (NexMusic)                               CORE
│   │   ├── Painel Mensagens fixadas → pular para a mensagem                 CORE
│   │   ├── Painel Buscar (mín. de caracteres)
│   │   │   ├── Resultado dentro da janela carregada → pula e destaca        CORE
│   │   │   └── Resultado antigo fora da janela: aparece, não navega         PARTIAL
│   │   └── Composer
│   │       ├── Enter envia, Shift+Enter quebra linha                        CORE
│   │       ├── Anexar arquivo (clipe, até 5 por mensagem, 15 MB cada)       CORE
│   │       ├── Arrastar arquivo / colar imagem                              MISSING
│   │       ├── Botão "Publicar como servidor" (MANAGE_MESSAGES)      ADMIN  CORE
│   │       ├── Comandos de música em texto (/play, !play...)                CORE (sem autocomplete)
│   │       ├── Autocomplete de @, #, :, /                                   MISSING
│   │       ├── Botão de emoji dentro do composer                            MISSING
│   │       ├── Seta ↑ para editar a última mensagem                         MISSING
│   │       ├── Contador de caracteres                                       CORE
│   │       ├── Bloqueio durante timeout (banner com o horário)              CORE
│   │       └── Contagem regressiva do modo lento                            MISSING
│   │
│   ├── Configurações do Servidor (tela cheia)                          [Roteiros 3, 9]
│   │   ├── Perfil do servidor (nome, descrição, ícone com recorte quadrado, cor de "Faixa")   CORE
│   │   ├── Cargos
│   │   │   ├── Criar cargo                                           ADMIN  CORE
│   │   │   ├── Buscar cargos (campo somente leitura, sem função)            MISSING (decorativo)
│   │   │   ├── Editar: Exibição (nome, cor, exibir separado)                CORE
│   │   │   ├── Editar: Permissões (bitfield agrupado, hierarquia)           CORE
│   │   │   ├── Editar: Gerenciar membros (busca funcional)                  CORE
│   │   │   ├── Excluir cargo (confirm() nativo)                             CORE
│   │   │   ├── Reordenar posição do cargo                                   MISSING
│   │   │   └── Regra transversal: só age sobre posição estritamente menor   CORE
│   │   ├── Membros
│   │   │   ├── Buscar membro                                                CORE
│   │   │   ├── Expulsar da voz                                              CORE
│   │   │   ├── Timeout (5 min, 10 min, 1 h, 1 dia, 7 dias) / remover        CORE
│   │   │   ├── Banir (motivo opcional; vale para a instância toda)          CORE
│   │   │   ├── Lista de banidos → Desbanir                                  CORE
│   │   │   └── Expulsar do servidor (sem banir)                             MISSING
│   │   ├── Convites (só MANAGE_SERVER)
│   │   │   ├── Ver e copiar o código (mostra "Copiado!")                    CORE
│   │   │   ├── Gerar novo código (invalida o antigo, confirm())             CORE
│   │   │   └── Limite de usos, expiração, link clicável                     MISSING
│   │   ├── Integrações (estado vazio honesto)                               CORE
│   │   └── Excluir servidor (só o dono; digitar o nome; cascata)     OWNER  CORE
│   │
│   └── Mini-perfil (popover ao clicar em avatar/nome)                      [Roteiro 13]
│       ├── Abrir: mensagens de canal/DM/chat da call, linhas de Amigos, participantes da call   CORE
│       ├── Posição: altura real medida, acompanha o resize                    DONE
│       ├── Conteúdo: banner, avatar, nome, pronomes, status, bio, atividade (só na mesma call)  PARTIAL
│       │   └── Cargos, membro desde, servidores em comum, selos, nota                          MISSING
│       ├── Carregando / erro com "Tentar de novo"; rebusca a cada abertura     DONE
│       ├── Ações: adicionar, cancelar, aceitar, recusar, enviar mensagem, remover, bloquear   CORE (sem confirmação)
│       ├── Fechar: X, clique fora, Esc (foco não entra nem volta)                              CORE
│       └── Próprio perfil: sem ações e sem atalho para Editar perfil                           PARTIAL
│
├── VOZ                                                                 [Roteiros 6, 7, 8]
│   ├── Canal de voz na sidebar
│   │   ├── Lista de participantes sob CADA canal (mute, AO VIVO, BOT)       CORE
│   │   ├── Indicador de "falando" (só no canal em que estou)                PARTIAL
│   │   ├── Clique → entrar
│   │   │   ├── Overlay "Entrando na sala..." (timeout 20 s + rede de segurança 15 s)   CORE
│   │   │   ├── Cancelar a tentativa                                         MISSING
│   │   │   ├── Erro: canal cheio / rede lenta / sem microfone (entra sem mic)   CORE
│   │   │   └── Som de entrada só depois do microfone publicado              CORE
│   │   ├── Engrenagem → configurações do canal de voz (bitrate, vídeo, limite)   ADMIN CORE
│   │   ├── Ícone de chat (só no canal em que estou) → chat da call
│   │   │   ├── Mensagens efêmeras (canal de dados WebRTC), sem markdown     CORE
│   │   │   └── Histórico, editar, apagar, reações                           MISSING
│   │   └── Botão desconectar ao lado de outro participante (com confirm())  CORE
│   │
│   ├── Tela da call (área principal, sem canal de texto)                    [Roteiro 13]
│   │   ├── Painel MEMBROS (só com call ativa; só quem está na call)         CORE
│   │   │   └── Lista de membros do servidor / por cargo / por presença       MISSING
│   │   ├── Cabeçalho: botão Mostrar membros                                 REMOVIDO (não tinha função)
│   │   └── Cabeçalho: botão Mensagens fixadas (glifo ⌖)                     REMOVIDO (não tinha função)
│   │
│   ├── Rodapé da sidebar (painel do usuário, sempre visível)                [Roteiro 13]
│   │   ├── Avatar, nome e linha de estado (não clicáveis)                   PARTIAL
│   │   │   ├── Linha: "Online" fora de call; estado da voz só durante a call   DONE
│   │   │   └── Menu de status / abrir o próprio perfil ao clicar             MISSING
│   │   ├── Microfone (mute/unmute; desabilitado fora da call e ensurdecido) CORE
│   │   │   └── Seta → escolher microfone                                    CORE (não persiste)
│   │   ├── Fone (deafen; muta junto e restaura o estado anterior)           CORE
│   │   │   └── Seta → escolher saída de áudio                               CORE (não persiste)
│   │   ├── Engrenagem → Configurações do app
│   │   ├── Atalho configurável de mute / deafen                             MISSING
│   │   └── Som específico de deafen / undeafen                              MISSING
│   │
│   ├── Painel "Voz conectada" (acima do rodapé, só em call)
│   │   ├── Câmera (liga direto em 1080p com simulcast)                      CORE
│   │   │   ├── Preview antes de ligar, fundo, blur                          MISSING
│   │   │   └── Escolher câmera (só em Configurações)                        PARTIAL
│   │   ├── Compartilhar tela
│   │   │   ├── DESKTOP: picker próprio                                      CORE
│   │   │   │   ├── Tela ou janela (miniaturas)
│   │   │   │   ├── Qualidade: 720p30 / 720p60 / 1080p60
│   │   │   │   ├── Compartilhar áudio do sistema (loopback, sem eco)
│   │   │   │   ├── Iniciar → som de início → selo AO VIVO
│   │   │   │   └── Cancelar (nada é publicado)
│   │   │   ├── WEB: picker nativo do navegador, qualidade vinda de Configurações   PARTIAL
│   │   │   ├── Parar (botão ou barra nativa do Windows; som toca uma vez)   CORE
│   │   │   └── Trocar qualidade sem parar                                   MISSING
│   │   └── Sair do canal (sem confirmação; som de saída depois)             CORE
│   │
│   ├── Área de vídeo / transmissões
│   │   ├── Câmeras: miniaturas sempre visíveis                              CORE
│   │   ├── Transmissão de tela: card pequeno → "Ver transmissão"            CORE
│   │   │   ├── Tile grande (várias ao mesmo tempo, lado a lado)             CORE
│   │   │   ├── Sair da transmissão (só para mim)                            CORE
│   │   │   ├── Volume da transmissão (independente do volume de voz)        CORE
│   │   │   └── Tela cheia (janela nativa no desktop; elemento no web)       CORE
│   │   │       └── Esc sai (duplicado com o processo principal)             CORE
│   │   └── Foco automático em quem fala                                     MISSING
│   │
│   ├── Lista de participantes (painel expandido)
│   │   └── Volume individual por pessoa (0–100, não persiste)               CORE
│   └── Áudio da call continua ao navegar para qualquer outra tela           CORE
│
├── CONFIGURAÇÕES DO APP (engrenagem do rodapé)                         [Roteiros 7, 10, 12]
│   ├── Meu perfil
│   │   ├── Banner (1920×480 recomendado, 800 KB)                            CORE
│   │   ├── Avatar (recorte quadrado central) / remover                      CORE
│   │   ├── Nome de exibição (somente leitura: username é fixo)             MISSING (alterar)
│   │   ├── Status (60), pronomes (30), sobre mim (300)                      CORE
│   │   ├── Cor do perfil (paleta fixa)                                      CORE
│   │   ├── Salvar alterações / Cancelar (edição em lote)                    CORE
│   │   └── Pré-visualização ao vivo                                         CORE
│   ├── Conta e segurança
│   │   ├── Trocar senha (atual + nova + confirmar)                          CORE
│   │   └── Sessões ativas / sair de todos os dispositivos                   MISSING
│   ├── Privacidade
│   │   └── Bloqueados → Desbloquear                                         CORE
│   ├── Voz e vídeo (com busca própria)
│   │   ├── Perfil de microfone: Isolamento (Krisp) / Estúdio / Personalizado   CORE
│   │   │   └── Personalizado: supressão, eco, ganho, sensibilidade (auto ou manual)
│   │   ├── Modo de entrada: Voz ativa / Push to talk                        CORE
│   │   │   └── Tecla de PTT ("Pressione uma tecla…")                        CORE
│   │   ├── Qualidade da transmissão de tela (fallback do web)               CORE
│   │   └── Câmera / dispositivos                                            CORE
│   ├── Aparência
│   │   ├── Tema, modo de desempenho (Completo/Leve), densidade              CORE
│   │   ├── Estilo das mensagens (Padrão/Compacto/Agrupado)                  CORE
│   │   ├── Fonte do chat, espaçamento, zoom da interface                    CORE
│   │   ├── Cor de destaque (paleta + seletor livre + hex + liga/desliga)    CORE
│   │   └── Pré-visualização ao vivo                                         CORE
│   ├── Sair da conta (sem confirmação; desconecta da voz antes)             CORE
│   ├── Notificações, atalhos, idioma, arquivos e mídia, avançado            MISSING (abas removidas por serem decorativas)
│   └── Sobre (versão, licenças, verificar atualização)                      MISSING (nunca existiu)
│
├── NOTIFICAÇÕES E NÃO LIDAS                                            [Roteiro 14]
│   ├── Modo de notificação da categoria (grava por usuário; nada lê)        PARTIAL
│   │   └── "Config. de notificação" muda o modo sem nenhum feedback        PARTIAL
│   ├── Silenciar servidor, canal ou DM; seção nas Configurações             MISSING
│   ├── Menções (@pessoa, @cargo, @everyone, #canal)                         MISSING
│   ├── Não lida (rail, canal, DM), contador de menção, faixa "Novas"        MISSING
│   ├── Inbox                                                                MISSING
│   ├── Notificação do desktop (o Electron nega a permissão)                 MISSING
│   ├── Flash e contador na barra de tarefas; título com contador            MISSING
│   ├── Som de mensagem no chat da call                                      CORE
│   │   └── Canal de texto e DM chegam em silêncio                           MISSING
│   ├── Receber chamada (toque, aceitar ou recusar)                          MISSING
│   └── Badge de pedidos de amizade no botão Início                          CORE (único badge do app)
│
├── TEMPO REAL (infraestrutura)                                         [Roteiro 5]
│   ├── WebSocket autenticado pelo cookie, heartbeat de 30 s                 CORE
│   ├── Escopo: broadcast / por servidor / por usuário (multi-aba livre)     CORE
│   ├── Reconexão com backoff (1 s → 15 s)                                   CORE
│   │   └── Sessão expirada: para o loop e volta à tela de entrada com aviso   DONE
│   ├── Indicador visual de "reconectando" do WebSocket                      MISSING
│   ├── Presença (online, ausente, ocupado, invisível)                       MISSING
│   └── "Fulano está digitando…"                                             MISSING
│
└── BOT DE MÚSICA (NexMusic)                                            [Roteiro 4, DISCORD_PARITY_PLAN.md]
    ├── Comandos em texto (/play, !play...) no chat de canal e no chat da call   CORE
    ├── Áudio: metadados do Spotify + áudio do YouTube via yt-dlp            CORE
    ├── Tráfego do yt-dlp sai por proxy residencial (sessão fixa de 60 min)  CORE
    └── Saldo de tráfego do proxy é pré-pago: acabou, o bot para           PARTIAL
```

---

## Resumo por área

| Área | Principais lacunas |
|---|---|
| Janela desktop | bandeja, fechar-para-bandeja, iniciar com o Windows, persistir tamanho, duplo clique |
| Entrada e sessão | aviso de expiração, mostrar senha, recuperar senha |
| Início, amigos e DMs | aba Online, reação/anexo/pin/busca em DM, ligação, DM em grupo |
| Servidores e canais | menu do servidor, botão direito no servidor, sair do servidor, não lida, Quick Switcher |
| Mensagens | scroll forçado, botão direito, arrastar/colar arquivo, autocomplete, "Novas mensagens" |
| Configurações do servidor | busca de cargos decorativa, reordenar cargos, expulsar do servidor, limite/expiração de convite |
| Membros e perfil | lista de membros do servidor, cor e agrupamento por cargo, foco do mini-perfil, avatar e nome do painel do usuário sem clique (menu de status) |
| Voz e vídeo | atalho de mute, som de deafen/câmera, preview/blur, trocar qualidade sem parar, foco em quem fala |
| Configurações do app | alterar username, sessões ativas, seções removidas (notificações, atalhos, idioma) |
| Notificações e não lidas | rastreio de leitura, menções, notificação e flash do desktop (o Electron nega `notifications`), título com contador, inbox, silenciar servidor/canal/DM, som fora do chat da call; o modo de notificação da categoria grava e nada o lê |
| Tempo real | presença, "digitando", indicador de reconexão do WebSocket |

## O que a árvore mostra

1. **Os ramos ausentes formam poucos grupos com uma causa só**, o que ajuda a priorizar: tudo que depende de rastreio de leitura (não lida na rail, no canal, na DM, "Marcar como lida"), tudo que depende de presença (aba Online, bolinha de status), e tudo que depende de uma bandeja no Electron (fechar-para-bandeja, iniciar minimizado, controles de voz na bandeja).
2. **Há dois lugares decorativos ainda vivos**: a busca de cargos (somente leitura) e o item "Marcar como lida" da categoria (função vazia); os botões "Mostrar membros" e "Mensagens fixadas" do cabeçalho da tela de voz, achados no Roteiro 13, foram removidos. Ambos os que restam contrariam o pedido de nada sem função. Há ainda duas **configurações** sem efeito visível: a cor do cargo e "exibir separadamente".
3. **A profundidade máxima real** está no fluxo de compartilhar tela (mais de 8 níveis até parar a transmissão) e em Configurações do Servidor > Cargos (mais de 6 níveis até alterar uma permissão de um cargo específico).
4. **Fricção inconsistente em ações destrutivas**: excluir servidor exige digitar o nome, excluir categoria e cargo usam `confirm()` nativo, apagar mensagem e sair da conta não pedem nada.

## Próximos documentos

`DISCORD_INTERACTION_MATRIX.md` (tabela mestra, uma linha por interação, com gatilho, feedback, realtime, persistência, permissão e erro) e `DISCORD_USER_JOURNEYS.md` (os quatro roteiros ponta a ponta do pedido original: entrar em voz e mutar, transmitir tela, fechar sem sair da call, encerrar de verdade) já existem e foram construídos a partir desta árvore e dos roteiros 0 a 13.
