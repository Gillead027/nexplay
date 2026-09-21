export type MediaAccessKind = 'camera' | 'microphone' | 'screen';

function baseMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permissão de mídia negada.';
    if (error.name === 'NotFoundError') return 'Nenhum dispositivo compatível foi encontrado.';
    if (error.name === 'NotReadableError') return 'O dispositivo está sendo usado por outro aplicativo.';
    if (error.name === 'OverconstrainedError') return 'O dispositivo selecionado não aceita essa configuração.';
  }
  return error instanceof Error ? error.message : 'Não foi possível acessar a mídia.';
}

export function isPermissionDenied(error: unknown): boolean {
  const errorName = error instanceof Error ? error.name : '';
  const errorMessage = error instanceof Error ? error.message : '';
  return (
    errorName === 'NotAllowedError' ||
    errorName === 'PermissionDeniedError' ||
    /permission denied|notallowederror/i.test(errorMessage)
  );
}

export async function describeMediaError(error: unknown, mediaType?: MediaAccessKind): Promise<string> {
  if (!isPermissionDenied(error) || !mediaType) {
    return baseMediaError(error);
  }

  // Sem permissão pra capturar a tela nenhuma transmissão é criada: só o aviso e o caminho.
  if (mediaType === 'screen') {
    return 'O sistema não deixou capturar a tela, então nenhuma transmissão foi iniciada. No Windows, confira em Configurações > Privacidade e segurança e tente de novo.';
  }

  const target = mediaType === 'camera' ? { to: 'à câmera', of: 'da câmera' } : { to: 'ao microfone', of: 'do microfone' };
  try {
    const status = await window.desktop?.getMediaAccessStatus?.(mediaType);
    if (status === 'denied' || status === 'restricted') {
      return `O Windows bloqueou o acesso ${target.to}. Abra Privacidade e permita o acesso para aplicativos da área de trabalho.`;
    }
  } catch {
    // Se o diagnóstico nativo falhar, preserva a mensagem do navegador.
  }

  return `Permissão ${target.of} negada. Confira as permissões de privacidade do Windows e tente novamente.`;
}
