# SausiMusic: áudio e fontes

Status: versão validada publicada em produção por solicitação do usuário,
mesmo com a autenticação do YouTube pendente. O serviço respondeu HTTP 200
e está saudável. Falta renovar os cookies e confirmar a reprodução musical real.
Imagem anterior preservada como `sausixudos-music-bot:before-quality`.

Atualização de comandos publicada: `/play` também importa playlists e álbuns
Spotify. O estado permanece `CONNECTING` até o primeiro frame entregue ao
LiveKit; só então passa a `PLAYING` e inclui a faixa no histórico. A ausência
de áudio por 25 segundos encerra a tentativa com uma mensagem de erro.
Rollback desta atualização: `sausixudos-music-bot:before-play-collections`.
Validação: 76 testes, typecheck e imagem de produção com dois ouvintes
recebendo 203 frames do WAV estéreo de diagnóstico. Isso não comprova
reprodução de músicas externas; autenticação continua pendente.

## Caminho do áudio

YouTube → melhor formato de áudio disponível → FFmpeg PCM 16 bits,
48 kHz, **dois canais** → LiveKit Opus, limite de **256 kbit/s** → ouvintes.
DTX e RED desativados conforme a configuração de música de alta qualidade do
[LiveKit](https://docs.livekit.io/transport/media/advanced/).
O limite de transmissão não aumenta a qualidade original do arquivo.

Antes: FFmpeg e os frames de PCM reduziam qualquer música a mono; o publicador
não definia bitrate. Produção também forçava a substituição de YouTube por
SoundCloud. O Spotify buscava a faixa no SoundCloud.

Além disso, a versão instalada do SDK nativo não anuncia `TF_STEREO`, e o
servidor negocia mono mesmo recebendo frames com dois canais. Enquanto a
[correção upstream](https://github.com/livekit/rust-sdks/pull/1023) não estiver
disponível, `stereoSignaling.ts` retransmite a sinalização em loopback e marca
somente a publicação musical como estéreo. Autenticação e mensagens restantes
são preservadas; a mídia continua no transporte normal do LiveKit.

Teste na VPS com FFmpeg e dois ouvintes: antes da correção, correlação entre
L/R = 1 (mono duplicado); depois, aproximadamente 0,0002 em ambos os ouvintes,
com mais de 200 frames recebidos por ouvinte. O fixture tem sinais diferentes
em cada canal. Isso confirma a preservação dos canais até o receptor.

Agora: o registro de produção contém YouTube e Spotify, sem SoundCloud.
Spotify fornece metadados e links públicos de faixas, álbuns e playlists.
O áudio correspondente vem do YouTube; título, artista, versão e duração
ajudam a rejeitar resultados incompatíveis. Não usamos as prévias de 30 segundos.
O Spotify não oferece retransmissão de suas faixas completas por este bot.

## Comandos

- `/play Matuê nome da música`
- `/play https://www.youtube.com/watch?v=...`
- `/play https://open.spotify.com/track/...`
- `/play https://open.spotify.com/playlist/...`
- `/play https://open.spotify.com/album/...`
- `/playlist https://open.spotify.com/playlist/...`
- `/playlist https://open.spotify.com/album/...`
- `/playlist https://www.youtube.com/playlist?list=...`

A importação mantém o limite existente de 50 faixas por comando. A página
pública incorporada do Spotify pode expor apenas parte de uma coleção ou não
expor suas faixas; nesse caso não prometemos importar a coleção completa.
Playlists privadas não são suportadas por esta integração pública.

## Autenticação do YouTube

A VPS retornou `Sign in to confirm you're not a bot`; os cookies existentes
retornaram `cookies are no longer valid`. Portanto, o teste de reprodução de
músicas reais exige autenticação renovada. Não trocar silenciosamente a fonte
por SoundCloud quando o YouTube recusar acesso.

1. Renovar a sessão usando o procedimento de
   [exportação de cookies documentado pelo yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies).
2. Substituir `secrets/youtube-cookies.txt` no host por um arquivo Netscape válido.
   Não enviar seu conteúdo para chat, logs ou Git.
3. No `.env` do host, definir
   `YTDLP_COOKIES_PATH=/run/music-secrets/youtube-cookies.txt`.
4. Validar o acesso com os cookies atualizados. Só depois construir e aplicar
   com `docker compose build music-bot` e `docker compose up -d --no-deps music-bot`.

O diretório de segredos é montado somente para leitura. Cada execução do
yt-dlp utiliza uma cópia temporária privada, removida ao terminar. Renovar o
arquivo original quando a autenticação expirar. Cookies válidos não garantem
acesso a qualquer faixa: região, disponibilidade e limitações do provedor
continuam se aplicando.

## Verificação

- `npm run test -w @sausixudos/music-bot`: PCM estéreo, ganho, buffer de frames,
  filas, identificação das faixas e metadados de playlists.
- `npm run typecheck -w @sausixudos/music-bot`.
- `scripts/stereo-check.mjs`: publica o WAV de diagnóstico pelo mesmo FFmpeg
  e publicador do bot, recebe em dois ouvintes isolados e mede energia e
  correlação entre os canais. Correlação baixa distingue estéreo real de
  mono duplicado. Não prova, por si só, que a fonte musical externa é boa.

Executar o diagnóstico dentro da imagem de produção, montando o script em
`/app/stereo-check.mjs`. Ele cria e remove sua própria sala LiveKit.

Depois de autenticar a fonte, definir `MUSIC_CHECK_INPUT` ao executar esse
script para verificar o comando real com dois ouvintes. Testar separadamente
`Matuê Kenny G`, um link Spotify de faixa e um link de playlist. Nesse modo,
o script exige frames com energia em ambos os ouvintes; metadados e conexão
sem áudio não passam. Ele mostra também o título e o tamanho da fila.

Validação de metadados na VPS: o link Spotify de **Kenny G / Matuê** retornou
189600 ms e foi associado ao YouTube. A playlist pública de Matuê da Sony
expôs 60 faixas, incluindo Kenny G; o comando mantém o limite de 50 faixas.
Isso valida a importação e a correspondência, não o download/reprodução do áudio.
