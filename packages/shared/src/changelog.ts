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
