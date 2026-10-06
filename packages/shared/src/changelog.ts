// Novidades do NexPlay. Cada atualização que chega aos usuários ganha UMA entrada aqui, escrita em
// português claro (o que mudou, do ponto de vista de quem usa). Na próxima subida da API, cada
// entrada nova vira uma mensagem no canal "atualizações" de TODOS os servidores (existentes e novos),
// publicada em nome do NexPlay — ver apps/api/src/updatesChannel.ts.
//
// Regras: o `id` é estável e único (nunca reutilize nem mude o de uma entrada já publicada, senão ela
// seria publicada de novo); a ordem do array é a ordem de publicação (mais antiga primeiro); não apague
// entradas antigas de propósito — servidor criado depois delas já nasce sem receber o histórico.

export interface ChangelogEntry {
  id: string;
  // AAAA-MM-DD, só para organização; a mensagem mostra a hora em que foi publicada.
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: '2026-09-23-chamadas-e-transmissao',
    date: '2026-09-23',
    title: 'Ligações, cronômetro e transmissão de tela',
    items: [
      'Ligações 1 a 1: agora dá para ligar para um amigo direto pela aba Amigos.',
      'Os canais de voz mostram há quanto tempo a chamada está rolando (cronômetro).',
      'Na transmissão de tela, o NexPlay mostra quantas pessoas estão assistindo (ícone de olho ao lado do nome) e toca um som quando alguém entra ou sai.',
      'Você pode excluir a própria conta em Configurações.',
    ],
  },
  {
    id: '2026-09-26-mover-membros-arquivos-dm-atualizacoes',
    date: '2026-09-26',
    title: 'Mover membros na voz, arquivos nas conversas privadas, o canal de atualizações e mais segurança na voz',
    items: [
      'Mover membros: moderadores e administradores podem mover alguém de um canal de voz para outro, é só segurar no nome da pessoa e arrastar até o outro canal de voz.',
      'Desconectar alguém de um canal de voz agora é só para moderadores e administradores (quem tem a permissão "Expulsar membros"); antes qualquer pessoa na chamada podia.',
      'Arquivos nas conversas privadas: agora dá para enviar documentos, ZIP, RAR e qualquer outro tipo de arquivo (até 15 MB, até 5 por mensagem).',
      'Canal atualizações: todo servidor passa a ter o canal atualizações, onde o NexPlay publica o que mudou a cada novidade, como esta mensagem.',
      'Webhooks de canal: um bot ou script pode postar mensagens num canal (Configurações do canal, aba Integrações).',
    ],
  },
  {
    id: '2026-09-26-correcoes-atualizacoes-e-mover',
    date: '2026-09-26',
    title: 'Correções: canal atualizações visível, aviso de novidade e mover membro com confirmação',
    items: [
      'Canais sem categoria voltaram a aparecer na barra lateral dos servidores que têm categorias (o canal atualizações, e também regras, bem-vindos e outros, estavam escondidos por causa disso).',
      'O canal atualizações mostra o aviso NOVO enquanto houver novidade que você ainda não leu.',
      'Ao mover alguém de canal de voz, o NexPlay agora confirma se a pessoa realmente saiu do canal; se o aplicativo dela estiver desatualizado, avisa para ela atualizar o NexPlay (a pessoa movida precisa estar com a versão mais nova).',
    ],
  },
  {
    id: '2026-09-26-login-permanente',
    date: '2026-09-26',
    title: 'Login permanente: você não precisa mais entrar de novo toda vez',
    items: [
      'Depois de entrar, o NexPlay lembra de você: pode desligar o computador ou fechar o aplicativo que, ao abrir de novo, você já está logado.',
      'Para sair da conta, use Configurações > Sair da conta.',
      'Por segurança, ao trocar a senha você continua logado neste aparelho e os outros aparelhos precisam entrar de novo com a senha nova.',
    ],
  },
  {
    id: '2026-09-26-atividade-na-lista-de-membros',
    date: '2026-09-26',
    title: 'Jogo e música direto na lista de membros',
    items: [
      'Agora dá para ver o que cada pessoa está jogando ou ouvindo embaixo do nome dela, na lista de membros, sem precisar clicar no perfil (como no Discord).',
      'Aparece para quem usa o aplicativo do NexPlay no computador, que percebe o jogo aberto ou a música tocando no Windows. Quem está com o status invisível não mostra a atividade.',
      'O perfil da pessoa também passa a mostrar o que ela está fazendo mesmo que ela não esteja na mesma chamada de voz que você.',
    ],
  },
  {
    id: '2026-09-26-nexmusic-youtube-retomado',
    date: '2026-09-26',
    title: 'NexMusic: busca e reprodução do YouTube atualizadas',
    items: [
      'O NexMusic recebeu uma atualização para manter a busca e a reprodução de músicas do YouTube compatíveis com as mudanças recentes da plataforma.',
    ],
  },
  {
    id: '2026-10-06-nexmusic-fila',
    date: '2026-10-06',
    title: 'NexMusic: remover, mover, pular e embaralhar a fila',
    items: [
      '/remove 2 tira a faixa da posição 2 da fila. /move 1 4 muda a faixa da posição 1 para a posição 4.',
      '/jump 3 toca a terceira faixa da fila agora, e as duas primeiras saem da fila.',
      '/shuffle embaralha a fila. A música que está tocando não muda.',
      'Esses comandos seguem a regra de DJs configurada no bot.',
    ],
  },
  {
    id: '2026-10-06-nexmusic-filtros',
    date: '2026-10-06',
    title: 'NexMusic: filtros de áudio',
    items: [
      '/filter <nome> muda o som das músicas: bassboost (graves), nightcore (mais rápido e agudo), 8d (o som gira), karaoke (tira a voz do centro) ou off (sem filtro).',
      'O filtro vale a partir da próxima música que começar. A música que já está tocando não muda.',
      'Os filtros valem para músicas do YouTube e do Spotify (que toca pelo YouTube). Arquivos enviados ainda não recebem filtro.',
    ],
  },
  {
    id: '2026-10-06-janela-lembra-e-copiar-no-desktop',
    date: '2026-10-06',
    title: 'A janela do computador lembra como você deixou',
    items: [
      'No app do computador, a janela reabre com o mesmo tamanho, posição e estado (maximizada ou não) da última vez, em vez de sempre abrir num tamanho fixo.',
      'Copiar textos e IDs no app do computador ficou mais confiável.',
    ],
  },
  {
    id: '2026-10-06-visual-novo-estilo-discord',
    date: '2026-10-06',
    title: 'Visual novo: o NexPlay agora segue o desenho do Discord',
    items: [
      'Cores, tamanhos e espaçamentos iguais aos do Discord: cinzas no lugar do azul-marinho, roxo como cor de destaque e colunas coladas, sem cartões flutuando.',
      'Canal de texto com a lista de membros do lado direito (o botão de pessoas no topo mostra ou esconde).',
      'Mensagens seguidas da mesma pessoa ficam juntas, com a foto e o nome só na primeira. A hora aparece como "Hoje às 10:21".',
      'O topo do canal ficou numa linha só, com nome, descrição e os botões de mensagens fixadas, membros e busca.',
      'A caixa de mensagem ficou mais limpa: Enter envia, e a contagem de caracteres só aparece perto do limite.',
    ],
  },
  {
    id: '2026-10-06-janelas-menus-perfil-estilo-discord',
    date: '2026-10-06',
    title: 'Janelas, menus e cartão de perfil no estilo do Discord',
    items: [
      'O cartão que abre ao clicar em alguém ficou como o do Discord: capa no topo, foto grande sobre a capa e botões logo abaixo.',
      'Os menus do botão direito ficaram escuros e compactos, com o item destacado em roxo ao passar o mouse.',
      'As janelas de criar canal, criar categoria e adicionar servidor ganharam o visual do Discord, com o rodapé escuro e os botões Cancelar e Criar.',
      'Ao criar um canal, o tipo (texto ou voz) é escolhido numa lista com bolinha de seleção.',
    ],
  },
  {
    id: '2026-10-06-amigos-e-conversas-estilo-discord',
    date: '2026-10-06',
    title: 'Amigos e conversas privadas no estilo do Discord',
    items: [
      'A página de Amigos ganhou o topo do Discord, com as abas Todos, Pendentes, Bloqueados e o botão verde Adicionar amigo.',
      'Na aba Todos há uma busca para achar um amigo pelo nome, e os pedidos pendentes aparecem com um número vermelho na aba.',
      'No topo da lista de conversas tem o campo "Encontre ou comece uma conversa" para filtrar suas conversas pelo nome.',
      'Nas conversas privadas, mensagens seguidas da mesma pessoa ficam juntas e a hora aparece como "Hoje às 10:21", igual aos canais.',
    ],
  },
];

export const UPDATES_CHANNEL_NAME = 'atualizações';
export const UPDATES_CHANNEL_DESCRIPTION = 'Novidades do NexPlay: o que mudou a cada atualização';

// Quem "assina" as mensagens de novidade (não é uma conta de verdade).
export const NEXPLAY_ANNOUNCER_IDENTITY = 'nexplay-updates';
export const NEXPLAY_ANNOUNCER_NAME = 'NexPlay';
// Arquivo da pasta public do site (mesma origem, então a política de imagens do site aceita).
export const NEXPLAY_ANNOUNCER_AVATAR_URL = '/logo-320.png';

export function formatChangelogMessage(entry: ChangelogEntry): string {
  return `**${entry.title}**\n\n${entry.items.map((item) => `• ${item}`).join('\n')}`;
}
