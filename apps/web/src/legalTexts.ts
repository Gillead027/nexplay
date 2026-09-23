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
  updatedAt: '23/09/2026',
  intro:
    'O NexPlay é um servidor privado: roda no servidor de quem o administra e não usa serviços de análise nem de publicidade. Este texto explica o que fica guardado sobre você e quem pode ver — inclusive quando um serviço externo é usado (marcado abaixo, junto do momento exato em que isso acontece).',
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
      heading: 'Verificação de identidade',
      paragraphs: [
        'Se a instância pedir verificação de identidade pra liberar câmera e compartilhamento de tela, o caminho sem custo é revisão humana: você envia uma foto do documento e uma selfie, e uma pessoa da administração aprova ou recusa. As duas fotos ficam guardadas só enquanto a revisão está pendente e são apagadas de verdade do armazenamento no instante em que a decisão é registrada — depois disso, só fica o resultado (verificado ou não) associado à sua conta, nunca as imagens.',
        'Se a instância configurar um serviço pago de verificação (KYC) no lugar da revisão humana, o próprio serviço faz a checagem do documento e da prova de vida; o NexPlay não recebe nem guarda o documento ou dado biométrico nesse caso — só o resultado que o serviço devolve.',
      ],
    },
    {
      heading: 'Segurança do conteúdo (opcional, depende da instância)',
      paragraphs: [
        'A instância pode ativar uma checagem automática de risco de autolesão/suicídio no texto das mensagens de canal e diretas, usando um serviço externo (hoje: Azure AI Content Safety, da Microsoft) só pra essa finalidade — o texto da mensagem é enviado a esse serviço no momento do envio, além de ficar guardado normalmente no NexPlay como qualquer mensagem. Essa checagem nunca impede a mensagem de ser enviada nem pune a conta automaticamente: quando o risco é alto, ela só avisa a administração em uma fila de revisão e mostra, em privado, um recurso de apoio pra quem escreveu.',
        'Essa checagem fica desligada por padrão; se a instância que você usa não tiver configurado um serviço pra isso, nenhum texto seu sai do NexPlay por esse motivo.',
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
        'Quem administra o servidor tem acesso técnico ao banco de dados e, por isso, pode ler tudo, inclusive conversas diretas: não há criptografia de ponta a ponta. Quem administra também vê um painel com o número de contas, servidores, mensagens e o consumo do servidor, a lista de contas, e — só como medida de segurança contra abuso — pode visualizar (sem postar nem participar) os canais e mensagens de qualquer servidor da instância, mesmo sem ser membro dele.',
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
        'O NexPlay é mantido por quem o administra. Qualquer pessoa pode criar uma conta, mas cada pessoa só vê os servidores que criar ou em que entrar por convite. É oferecido como está, sem garantia de que estará sempre no ar, e pode mudar ou ser desligado.',
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
      paragraphs: [
        'Quem administra e quem tem cargo de moderação pode aplicar timeout, expulsar e banir, e contas podem ser removidas quando as regras não forem seguidas.',
        'Quem administra a instância pode visualizar o conteúdo de qualquer servidor, mesmo sem ser membro dele, só pra prevenir e responder a abuso (como conteúdo ilegal) — nunca pra participar ou postar nesses servidores.',
      ],
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
