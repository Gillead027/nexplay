# NexPlay

MVP privado e self-hosted para voz, compartilhamento de tela e chat entre pequenos grupos.

## Arquitetura de produção

```text
Chrome / Edge
  |-- HTTPS /             -> Caddy -> web:80
  |-- HTTPS /api/*        -> Caddy -> api:3000
  |                               `-> music-bot:4100 (rede interna)
  |-- WSS /livekit/*      -> Caddy -> livekit:7880
  `-- WebRTC              -> VPS:7882/UDP (preferencial)
                              VPS:7881/TCP (fallback)
```

Somente Caddy (`80/TCP` e `443/TCP`) e a mídia LiveKit (`7881/TCP` e `7882/UDP`) publicam portas no host. Frontend, API e sinalização `7880/TCP` permanecem na rede interna do Compose.

O Compose usa `APP_DOMAIN` como fonte única e deriva estas URLs:

- aplicação: `https://APP_DOMAIN`;
- API: `https://APP_DOMAIN/api`;
- LiveKit WebSocket: `wss://APP_DOMAIN/livekit`.

O Caddy preserva `/api/*` para o Express. Em `/livekit/*`, `handle_path` remove o prefixo antes de encaminhar a conexão ao LiveKit; o `reverse_proxy` do Caddy suporta o upgrade WebSocket automaticamente.

## Segurança do deploy

- `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` são fornecidos somente aos containers `api`, `music-bot` e `livekit`.
- O frontend recebe da API apenas a URL pública do LiveKit e um token de participante curto, limitado à sala.
- A sessão usa cookie `HttpOnly`, `Secure`, `SameSite=Strict`, host-only e `Path=/`.
- Frontend e API usam o mesmo domínio. O CORS aceita somente `https://APP_DOMAIN`.
- O convite não é armazenado pelo frontend.

## NexMusic

O NexMusic vive em `apps/music-bot`, como um processo Node e um container
separados do cliente Electron. Ele não possui autenticação, cadastro de usuários,
servidores ou canais próprios. O fluxo de comando é:

```text
web/desktop -> API (sessão + canal + voice state) -> music-bot -> sala LiveKit
```

A API é a fronteira autenticada: resolve o usuário da sessão, valida o canal
compartilhado e confirma no LiveKit que ele está conectado à sala. Somente então
encaminha ao bot a identidade canônica do solicitante. Mensagens e áudio retornam
pelo mesmo data channel/WebRTC usado pelo restante do NexPlay.

Os contratos, identidades, tópico do canal de dados e parser de canais ficam em
`packages/shared`; o bot reutiliza esses artefatos e o protocolo LiveKit existente.
O endpoint HTTP do bot fica apenas na rede interna do Compose e possui `/health`
para monitoramento.

O player mantém uma sessão independente por room, com faixa atual, fila FIFO,
auto-next, posição e volume server-side. `/play-file` enfileira fixtures
determinísticos de seis segundos; também existem `pause`, `resume`, `skip`,
`stop`, `leave`, `volume 0-100`, `queue`, `nowplaying`/`np` e `clear`, sempre
com prefixo `/` ou `!`. Não há download externo ou player de áudio no cliente.
A auditoria detalhada do pipeline está em `docs/MUSIC_BOT_AUDIT.md`.
O roteiro de validação audível com dois clientes está em
`docs/MUSIC_BOT_E2E.md`.

## Verificações locais do código

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Cliente Windows

O cliente Electron reutiliza a aplicação React servida pelo NexPlay. Ele não
contém credenciais do LiveKit: autenticação, token de participante e configuração
de mídia continuam sendo fornecidos pela API do servidor.

Para desenvolvimento no Windows, mantenha no `.env` as mesmas variáveis usadas
pelo ambiente web e execute na raiz do projeto:

```powershell
npm install
npm run desktop:dev
```

O comando pressupõe que o LiveKit local existente esteja acessível em
`http://localhost:7880`; a conexão pública passa pelo proxy `/livekit` do Vite.
Resultado esperado: API, Vite e Electron iniciam juntos; uma única janela
NexPlay abre `http://localhost:5173`. Fechar a janela encerra os três processos.

Para gerar os executáveis de produção, a URL precisa ser uma origem HTTPS. O
empacotador lê `APP_DOMAIN` do `.env` da raiz ou, quando definido, usa
`NEXPLAY_APP_URL`:

```powershell
$env:NEXPLAY_APP_URL = 'https://DOMINIO_DO_NEXPLAY'
npm run desktop:build
Remove-Item Env:NEXPLAY_APP_URL
```

Resultado esperado:

- instalador: `apps/desktop/release/NexPlay-Setup.exe`;
- versão portátil: `apps/desktop/release/NexPlay.exe`.

O instalador cria atalhos na área de trabalho e no menu Iniciar. O cliente não
exige Node.js, Docker ou navegador externo no computador de destino. Nesta etapa
os executáveis não possuem assinatura de código; por isso, o Windows pode exibir
um aviso do SmartScreen.

## Identidade visual

O app inteiro (web, desktop, tela de abertura e seletor de compartilhamento) usa a paleta da logo: azul-marinho nos fundos e o gradiente ciano → azul (`#2ee6f0` → `#2f7bff`) como cor de marca.

- `apps/web/src/styles.css` começa com os tokens (`--app`, `--sidebar`, `--accent`, `--fs-*`, `--radius-*`, `--dur`...) e os cinco temas (Escuro, Ash, Onyx, Claro e Sistema). Toda cor da interface sai desses tokens, então trocar um tema troca tudo de uma vez.
- `apps/web/src/design.css` é a camada de componentes e movimento: botões com brilho, tela de entrada com fundo animado, barra de servidores e canais que respondem ao mouse, janelas que entram com transição, sliders e interruptores. Fica depois de `styles.css` e vale para todas as telas.
- A tipografia é a Inter (arquivo em `apps/web/public/fonts/`, licença OFL ao lado), numa escala única de 11 a 28 px (`--fs-2xs` a `--fs-3xl`).
- O **Modo leve** (Configurações > Aparência) e a opção "reduzir movimento" do Windows zeram todas as animações e transições.
- Cor de destaque escolhida pela pessoa (Configurações > Aparência > Cores) troca o azul de toda a interface, inclusive o gradiente dos botões.
- O seletor de compartilhamento de tela do app desktop tem CSS próprio (`apps/desktop/src/picker.css`) com a mesma paleta, porque roda numa janela separada.

## Tratamento de áudio do microfone

Tudo roda dentro do próprio app (Web Audio), em tempo real, e vale igual para a chamada e para o teste de microfone (Configurações > Voz e vídeo):

```text
microfone -> mono -> filtro de graves -> supressão de ruído por IA -> gate de sensibilidade -> compressor -> volume -> limitador -> chamada
```

- **Perfis**, como no Discord: Isolamento de voz (IA RNNoise, eco e ganho automático), Estúdio (áudio puro) e Personalizado (cada opção).
- **Supressão de ruído**: Nenhuma; Padrão (a do navegador); Alta (RNNoise, rede neural rápida); Máxima (GTCRN, a mais forte contra digitação, cliques e sopro no microfone, mas que em medições com fala real distorceu mais a voz e cortou mais sílabas baixas que o RNNoise — por isso não é o padrão do Isolamento, só uma escolha em Personalizado). Os modelos são WebAssembly (~150 a 200 KB), baixados só quando escolhidos, e rodam localmente. Medido no Chromium com fala real (TTS) misturada a teclado, sopro e ruído de ambiente: a Máxima derruba digitação em cerca de -50 dB, o sopro em cerca de -40 dB e o ambiente em cerca de -40 dB, com a voz preservada.
- **Sensibilidade de entrada** (só em Voz ativa): gate com atraso de 6 ms (não engole o começo da fala), tempo de espera e fechamento suave. No modo automático aprende o ruído do ambiente sozinho. O medidor das configurações mostra o nível já tratado e o limite.
- **Compressor de voz** (Leve, Médio, Forte), **volume de entrada** de 0 a 200% e **limitador** de segurança contra estouro.
- Cancelamento de eco e controle automático de ganho são os do navegador, aplicados ao vivo.
- Mudar qualquer opção vale na hora, na chamada e no teste, sem reconectar. "Ouvir a mim mesmo" toca o áudio tratado nos alto-falantes (use fones).
- O código está em `apps/web/src/audio/` (`processingConfig.ts` decide o que vale, `voice-dsp.worklet.js` é o gate, `voiceGraph.ts` monta o caminho do áudio) e tem testes (`voiceDsp.test.ts`), inclusive do gate alimentado com sinais sintéticos.

O motor anterior (`@livekit/krisp-noise-filter`) só funciona com o LiveKit Cloud, não com este servidor próprio, e foi removido.

## Operação: backup, vigia e deploy

Os scripts ficam em `scripts/` e são enviados à VPS junto com o código:

- `scripts/vps/backup.sh` (cron diário às 04:17, instalado por `scripts/vps/install.sh`): cópia consistente do banco (`VACUUM INTO`, com o app no ar), conferida com `PRAGMA integrity_check`, mais anexos e configuração, em `/opt/nexplay/backups/daily/nexplay-<data>.tar.zst`. Guarda 14 dias e 8 domingos.
- `scripts/vps/healthcheck.sh` (a cada minuto): confere `/api/health` pelo endereço público, reinicia a API e o site depois de 3 falhas seguidas e avisa se o disco passar de 90% ou se o último backup tiver mais de 36 h. Ele vive na mesma máquina que vigia — se a VPS inteira cair, ele não consegue avisar ninguém sozinho, por isso existe `scripts/watch-site.ps1` (ver abaixo). Sem serviço de terceiro (Discord, ntfy.sh etc.) de propósito — o NexPlay é independente.
- `scripts/pull-backup.ps1`: traz os últimos backups para este computador (uma cópia fora da VPS). Registrado como tarefa diária do Windows ("NexPlay backup", 12:00); para remover: `schtasks /Delete /TN "NexPlay backup"`.
- `scripts/watch-site.ps1`: roda neste computador (fora da VPS) e avisa por notificação nativa do Windows quando `/api/health` para de responder ou volta ao normal — cobre o caso em que a VPS inteira cai, sem depender de nenhum serviço externo. Registrado como tarefa do Windows a cada 5 min ("NexPlay watch"); para remover: `schtasks /Delete /TN "NexPlay watch"`.
- `scripts/deploy.sh <rótulo>`: publica web e API (backup antes, imagens de volta com o rótulo, envio sem secrets, build e conferência de saúde).
- Restaurar: `zstd -d nexplay-<data>.tar.zst -c | tar -x`, parar a API, colocar `nexplay.db` no volume `api_data` e subir de novo.

## Como usar o app: novidades do dia a dia

- **Status** (clique no seu nome, no canto): Online, Ausente, Não perturbe (sem sons) e Invisível (aparece offline). **"Digitando…"** nos canais e nas conversas diretas (quem está invisível não avisa). **Cor do cargo** nos nomes, no painel de membros e nas mensagens (o cargo mais alto com cor de verdade; os dois cinzas da paleta valem como sem cor). **@nome** destaca a mensagem e toca um som diferente.
- **Sons** (Configurações > Notificações): mensagem nova e menção, cada um com seu interruptor; respeitam o modo de notificação da categoria e o Não perturbe, e não tocam no canal que você está olhando.
- **Pastas de servidores**: arraste um servidor sobre outro para criar uma pasta, sobre uma pasta para colocar dentro, entre os itens para reordenar. O clique direito faz o mesmo sem arrastar (criar pasta, mover, tirar, editar nome e cor, desfazer). É por pessoa e igual em todos os aparelhos.
- **Esc** fecha uma camada por vez (menus, cartões, janelas e diálogos numa pilha só: `apps/web/src/escapeLayers.ts`).
- **Qualidade da transmissão** troca ao vivo, sem parar (setinha ao lado do botão de compartilhar tela, ou em Configurações): a captura muda de resolução e taxa de quadros e o codificador recebe o novo limite de bitrate.
- **Telas estreitas**: em janelas menores que 820 px os servidores e canais viram uma gaveta (botão de menu), as configurações ocupam a tela e o app pode ser instalado no celular (`manifest.webmanifest`).
- **Desktop** (Configurações > Aplicativo): fechar minimiza para a bandeja (ligado por padrão), iniciar com o Windows e iniciar minimizado.

## NexDex (captura de Pokémon nos canais de texto)

Qualquer pessoa de um servidor joga escrevendo comandos num canal de texto:

- `!pokemon` procura um Pokémon selvagem, que aparece só para quem procurou (espera de 20 s entre uma procura e outra; ele vai embora depois de 5 minutos);
- `!capturar` (ou o botão do cartão) joga uma Pokébola; quanto mais raro, mais difícil de capturar e mais fácil de fugir; `!fugir` deixa ele ir;
- `!diario` resgata 10 Pokébolas por dia (a data vira à meia-noite de Brasília); quem começa tem 10; `!bolas` mostra quantas tem;
- `!pokedex [página]` lista a coleção e `!time`, `!time adicionar <nº>`, `!time remover <nº>` e `!time limpar` montam um time de até 6;
- `!info [nº ou nome]` mostra a ficha de um Pokémon com tipos e atributos base (sem argumento, o último capturado; um número é da sua coleção; um nome, como `!info pikachu`, é de qualquer espécie);
- `!batalhar <nome>` desafia outra pessoa do servidor (os dois precisam ter time) e ela responde com `!aceitar` ou `!recusar` (ou os botões do cartão); o desafio vale 2 minutos, quem desafiou pode desistir com `!recusar`. Aceito, os dois times lutam sozinhos e o resultado sai na hora. Quem vence ganha 3 Pokébolas, nas 5 primeiras vitórias do dia.

As raridades são comum, incomum, raro e lendário (1,5% dos encontros); há também a chance de 1 em 512 de vir brilhante. A lista das 1025 espécies está em `apps/api/src/pokemonData.ts` e os tipos e atributos base em `apps/api/src/pokemonStats.ts` (ambos gerados da PokeAPI); as imagens são baixadas da PokeAPI na primeira vez que alguém as vê, guardadas em `pokemon-sprites/` ao lado do banco.

Na batalha não há níveis nem golpes escolhidos: cada Pokémon luta com os atributos base da espécie, com o melhor dos tipos dele contra os do adversário (tabela de tipos clássica, ataque físico ou especial conforme o maior dos dois, bônus de tipo próprio, sorteio de dano e chance de golpe crítico). Os times lutam na ordem, um contra um, e quem vence um duelo segue com a vida que sobrou. As regras estão em `apps/api/src/pokemonBattle.ts`. Pokémon é marca de Nintendo, Creatures e Game Freak; o jogo é para uso entre amigos.

## Deploy na VPS

Os comandos abaixo assumem Ubuntu 22.04, 24.04 ou 26.04 de 64 bits e um usuário com `sudo`.

### 1. Preparar DNS

Antes de iniciar o Caddy, crie um registro DNS `A` apontando o domínio para o IPv4 público da VPS. Crie `AAAA` somente se a VPS tiver IPv6 público funcional. Aguarde até:

```bash
getent ahosts DOMINIO_DO_NEXPLAY
```

Resultado esperado: o IP público da VPS aparece na saída.

### 2. Atualizar o Ubuntu

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git openssl ufw
```

Resultado esperado: sistema atualizado e comandos auxiliares instalados. Reinicie a VPS antes de continuar se o Ubuntu informar que um reboot é necessário.

### 3. Instalar Docker Engine e Compose plugin

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
docker compose version
```

Resultado esperado: `hello-world` termina com sucesso e `docker compose version` mostra Compose v2. O grupo `docker` concede privilégios equivalentes a root; mantenha nele apenas administradores da VPS.

### 4. Configurar UFW

Permita SSH antes de habilitar o firewall para não perder acesso:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp comment 'NexPlay HTTP ACME'
sudo ufw allow 443/tcp comment 'NexPlay HTTPS WSS'
sudo ufw allow 7881/tcp comment 'NexPlay LiveKit ICE TCP'
sudo ufw allow 7882/udp comment 'NexPlay LiveKit ICE UDP'
sudo ufw enable
sudo ufw status verbose
```

Resultado esperado: apenas SSH e as quatro portas do NexPlay aparecem como permitidas. Se o SSH usa uma porta personalizada, permita essa porta antes de `ufw enable`.

Docker pode encaminhar portas publicadas antes das regras normais do UFW. Por isso, replique as mesmas quatro permissões no firewall/security group do provedor da VPS. O Compose não publica nenhuma outra porta.

### 5. Copiar o projeto

Com repositório Git:

```bash
sudo install -d -o "$USER" -g "$USER" /opt/nexplay
git clone URL_DO_REPOSITORIO /opt/nexplay
cd /opt/nexplay
```

Ou, a partir do computador local, empacote e envie todos os arquivos, incluindo `.env.example`:

```bash
tar -C CAMINHO_LOCAL_DO_NEXPLAY -czf nexplay.tar.gz .
scp nexplay.tar.gz usuario@IP_DA_VPS:/tmp/nexplay.tar.gz
```

Então, na VPS:

```bash
ssh usuario@IP_DA_VPS
sudo install -d -o "$USER" -g "$USER" /opt/nexplay
tar -xzf /tmp/nexplay.tar.gz -C /opt/nexplay
cd /opt/nexplay
```

Resultado esperado:

```bash
test -f docker-compose.yml && test -f infra/Caddyfile && test -f infra/livekit.yaml && echo "Projeto OK"
```

### 6. Criar o `.env`

```bash
cd /opt/nexplay
cp .env.example .env

GC_INVITE_TOKEN="$(openssl rand -hex 24)"
GC_SESSION_SECRET="$(openssl rand -hex 32)"
GC_LIVEKIT_KEY="$(openssl rand -hex 16)"
GC_LIVEKIT_SECRET="$(openssl rand -hex 32)"

sed -i "s|^APP_DOMAIN=.*|APP_DOMAIN=DOMINIO_DO_NEXPLAY|" .env
sed -i "s|^INVITE_TOKEN=.*|INVITE_TOKEN=$GC_INVITE_TOKEN|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$GC_SESSION_SECRET|" .env
sed -i "s|^LIVEKIT_API_KEY=.*|LIVEKIT_API_KEY=$GC_LIVEKIT_KEY|" .env
sed -i "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=$GC_LIVEKIT_SECRET|" .env

unset GC_INVITE_TOKEN GC_SESSION_SECRET GC_LIVEKIT_KEY GC_LIVEKIT_SECRET
chmod 600 .env
nano .env
```

Substitua `DOMINIO_DO_NEXPLAY` pelo hostname real, sem `https://` e sem `/`. No editor, anote o `INVITE_TOKEN` para fornecer aos dois participantes e confirme os canais.

Resultado esperado:

```bash
grep -E '^(APP_DOMAIN|VOICE_CHANNELS)=' .env
stat -c '%a %n' .env
```

O domínio correto deve aparecer e a permissão deve ser `600`.

### 7. Validar e subir os containers

```bash
cd /opt/nexplay
docker compose config --quiet
docker compose pull
docker compose up -d --build
docker compose ps
```

Resultado esperado: `docker compose config --quiet` não imprime erros; depois do período inicial, `web`, `api`, `livekit` e `caddy` aparecem `Up` e `healthy`.

Se algum serviço ainda mostrar `health: starting`, aguarde alguns segundos:

```bash
watch -n 2 docker compose ps
```

Use `Ctrl+C` quando todos estiverem saudáveis.

### 8. Confirmar HTTPS e a API

```bash
curl -I https://DOMINIO_DO_NEXPLAY/
curl -fsS https://DOMINIO_DO_NEXPLAY/api/health
```

Resultado esperado: a primeira resposta é HTTP `200` e a segunda imprime `{"status":"ok"}`. O navegador deve mostrar certificado HTTPS válido.

## Diagnóstico do primeiro deploy

Estado e logs:

```bash
cd /opt/nexplay
docker compose ps
docker compose logs --tail=200
docker compose logs --tail=200 livekit
docker compose logs --tail=200 api
docker compose logs --tail=200 caddy
docker compose logs -f livekit api caddy
```

Portas TCP/UDP no host:

```bash
sudo ss -lntp | grep -E ':(80|443|7881)\b'
sudo ss -lunp | grep -E ':7882\b'
sudo ufw status verbose
docker compose port livekit 7881
docker compose port livekit 7882
```

Resultado esperado: listeners TCP em `80`, `443` e `7881`, e UDP em `7882`. A porta interna `7880` não deve aparecer publicada no host.

Para observar mídia UDP durante a chamada:

```bash
sudo apt install -y tcpdump
sudo tcpdump -ni any udp port 7882
```

Pacotes devem aparecer quando usuários estiverem falando ou compartilhando tela. Encerre com `Ctrl+C`.

Erros comuns:

- certificado não emitido: confirme DNS, portas 80/443 e logs do Caddy;
- interface abre, mas voz não conecta: confirme `7882/UDP`, `7881/TCP` e o IP externo informado nos logs do LiveKit;
- `401` ao entrar: confirme o `INVITE_TOKEN` usado;
- LiveKit reiniciando: confirme que API key/secret são iguais nos containers e que o secret tem pelo menos 32 caracteres.

## Teste com dois computadores e duas redes

1. Deixe estes comandos abertos na VPS:

   ```bash
   cd /opt/nexplay
   docker compose logs -f livekit api caddy
   ```

   Em outro terminal:

   ```bash
   sudo tcpdump -ni any udp port 7882
   ```

2. No computador A, conectado à rede residencial, abra `https://DOMINIO_DO_NEXPLAY` no Chrome/Edge, confirme o certificado, entre com um nome e o convite e selecione o canal **Geral**.
3. No computador B, use outra rede, por exemplo hotspot móvel. Abra a mesma URL, use outro nome e o mesmo convite e entre no mesmo canal.
4. Aceite a permissão de microfone nos dois computadores. Confirme que ambos aparecem na sala e que o indicador de fala reage.
5. Fale A -> B e B -> A. Teste mute, deafen e o volume individual.
6. No computador A, selecione 720p30 e compartilhe uma aba ou tela. Para áudio, marque **Compartilhar áudio da guia/sistema** quando o Chrome/Edge oferecer essa opção.
7. No computador B, confirme vídeo, áudio compartilhado e tela cheia. Repita com 720p60 e 1080p60 somente depois do teste básico.
8. Em `chrome://webrtc-internals`, abra a conexão ativa e confirme que o par ICE selecionado usa protocolo UDP e porta remota `7882`. O `tcpdump` da VPS também deve mostrar tráfego.
9. Para comprovar o fallback TCP, execute como administrador no PowerShell de apenas um dos computadores Windows:

   ```powershell
   New-NetFirewallRule -DisplayName "NexPlay UDP fallback test" -Direction Outbound -Protocol UDP -RemotePort 7882 -Action Block
   ```

   Saia e entre novamente no canal. Voz e tela devem continuar funcionando; `chrome://webrtc-internals` deve indicar TCP e a VPS deve receber conexão em `7881/TCP`.
10. Remova imediatamente a regra de teste:

   ```powershell
   Remove-NetFirewallRule -DisplayName "NexPlay UDP fallback test"
   ```

11. O teste está aprovado quando voz bidirecional, controles, tela e áudio de compartilhamento funcionam em UDP, e a reconexão funciona por TCP com UDP bloqueado no cliente.

TURN permanece desabilitado nesta etapa. Redes que bloqueiam tanto UDP direto quanto ICE/TCP em `7881` não conseguirão conectar até uma futura configuração de TURN.

## Referências operacionais

- [Instalação oficial do Docker Engine no Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Portas e firewall do LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/)
- [Deploy self-hosted do LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/)
- [Reverse proxy do Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
