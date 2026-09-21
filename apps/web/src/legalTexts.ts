export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
}

// Descreve o que o programa faz de verdade na versão atual (cada afirmação abaixo pode ser
// conferida no código). Se o comportamento mudar, este texto precisa mudar junto.
export const PRIVACY_POLICY: LegalDocument = {
  title: 'Política de privacidade',
  updatedAt: '21/09/2026',
  intro:
    'O NexPlay é um servidor privado: roda no servidor de quem o administra e não usa serviços de análise, de publicidade nem cookies de terceiros. Este texto explica o que fica guardado sobre você e quem pode ver.',
  sections: [
    {
      heading: 'O que fica guardado',
      paragraphs: [
        'Sua conta: nome de usuário, senha (guardada só como hash bcrypt, nunca em texto), cor de destaque, status, bio, pronomes, avatar, banner e a data em que a conta foi criada.',
        'O que você escreve e envia: mensagens em canais e em conversas diretas (com edições, reações e fixações), arquivos anexados (até 15 MB e 5 por mensagem) e os servidores, cargos e convites que você cria.',
        'Relações e moderação: amizades, bloqueios, e os banimentos e timeouts aplicados à sua conta.',
      ],
    },
    {
      heading: 'O que não fica guardado',
      paragraphs: [
        'O áudio e o vídeo das calls e das transmissões de tela não são gravados: passam pelo servidor de mídia (LiveKit) só enquanto a call acontece.',
        'Quem está online fica só na memória do servidor e some quando você fecha o app.',
      ],
    },
    {
      heading: 'Quem pode ver',
      paragraphs: [
        'Mensagens de um canal são vistas por quem tem acesso ao canal. Conversas diretas são vistas pelas duas pessoas.',
        'Quem administra o servidor tem acesso técnico ao banco de dados e, por isso, pode ler tudo, inclusive conversas diretas: não há criptografia de ponta a ponta. Quem administra também vê um painel com o número de contas, servidores, mensagens e o consumo do servidor, e a lista de contas com nome de usuário, data de criação, quantidade de servidores e de mensagens.',
      ],
    },
    {
      heading: 'Música',
      paragraphs: [
        'Quando você pede uma música ao bot, o servidor consulta o YouTube e o Spotify (por meio de um serviço de proxy) com o título ou o link que você mandou. Faixas do Spotify são tocadas a partir de uma busca no YouTube.',
      ],
    },
    {
      heading: 'Cookies e armazenamento no seu aparelho',
      paragraphs: [
        'Um cookie de sessão mantém você conectado (só o servidor lê, não é enviado a outros sites, dura 12 horas).',
        'As suas preferências ficam no próprio aparelho: tema, volumes, aparelhos de áudio e vídeo, modo de entrada da voz e teclas. Elas não vão para o servidor.',
      ],
    },
    {
      heading: 'Cópias de segurança e exclusão',
      paragraphs: [
        'Quem administra faz cópias de segurança do banco. Apagar uma mensagem a remove do servidor, mas ela pode continuar em cópias antigas.',
        'Você pode editar o perfil, editar e apagar as suas mensagens, trocar a senha e bloquear pessoas. Não existe exclusão de conta pela tela: para apagar a conta, peça a quem administra.',
      ],
    },
    {
      heading: 'Mudanças',
      paragraphs: ['Este texto descreve a versão atual do NexPlay e pode mudar quando o programa mudar. A data da última revisão está no topo.'],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: 'Termos de uso',
  updatedAt: '21/09/2026',
  intro: 'Regras simples para usar este servidor privado. Ao criar a conta e usar o NexPlay, você concorda com elas.',
  sections: [
    {
      heading: 'O serviço',
      paragraphs: [
        'O NexPlay é um servidor privado, mantido por quem o administra, para um grupo de pessoas que receberam o código de cadastro. É oferecido como está, sem garantia de que estará sempre no ar, e pode mudar ou ser desligado.',
      ],
    },
    {
      heading: 'Sua conta',
      paragraphs: ['Você cuida da sua senha e é responsável pelo que acontece na sua conta. Avise quem administra se achar que alguém entrou nela.'],
    },
    {
      heading: 'Como usar',
      paragraphs: [
        'Trate as pessoas com respeito. Não envie conteúdo ilegal, de assédio, spam ou programas maliciosos, e não tente burlar limites, permissões ou a segurança do servidor.',
        'Você é responsável pelo que escreve e envia. Quem administra e quem modera podem apagar conteúdo que vá contra estas regras.',
      ],
    },
    {
      heading: 'Moderação',
      paragraphs: ['Quem administra e quem tem cargo de moderação pode aplicar timeout, expulsar e banir, e contas podem ser removidas quando as regras não forem seguidas.'],
    },
    {
      heading: 'Música',
      paragraphs: ['O bot toca conteúdo de serviços públicos, como o YouTube. O uso precisa respeitar os termos desses serviços, e a responsabilidade pelo que é pedido ao bot é de quem pede.'],
    },
    {
      heading: 'Responsabilidade',
      paragraphs: ['Quem administra não se responsabiliza por perdas causadas por falhas, indisponibilidade ou mau uso do serviço. Faça cópia do que for importante para você.'],
    },
    {
      heading: 'Mudanças',
      paragraphs: ['Estes termos podem mudar. A data da última revisão está no topo; continuar usando o NexPlay depois de uma mudança significa aceitar a nova versão.'],
    },
  ],
};
