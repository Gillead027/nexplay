import { ConnectionQuality, ConnectionState } from 'livekit-client';

export type SignalLevel = 'good' | 'fair' | 'bad' | 'pending';

export interface ConnectionSignalInfo {
  level: SignalLevel;
  // Barras acesas do ícone de sinal (de 0 a 3).
  bars: 0 | 1 | 2 | 3;
  label: string;
}

// Traduz o estado da chamada e a qualidade que o LiveKit mede (perda de pacotes, atraso e oscilação) para o
// ícone de sinal do painel do usuário: verde = boa, amarelo = mais ou menos, vermelho = ruim. Fora de uma
// chamada não há o que medir, então não há ícone (retorna null).
export function describeConnectionSignal(state: ConnectionState, quality: ConnectionQuality): ConnectionSignalInfo | null {
  switch (state) {
    case ConnectionState.Disconnected:
      return null;
    case ConnectionState.Connecting:
      return { level: 'pending', bars: 0, label: 'Conectando à chamada de voz…' };
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return { level: 'bad', bars: 1, label: 'Sem conexão com a chamada. Reconectando…' };
    default:
      break;
  }
  switch (quality) {
    case ConnectionQuality.Excellent:
      return { level: 'good', bars: 3, label: 'Conexão excelente' };
    case ConnectionQuality.Good:
      return { level: 'good', bars: 3, label: 'Conexão boa' };
    case ConnectionQuality.Poor:
      return { level: 'fair', bars: 2, label: 'Conexão instável: a voz pode falhar' };
    case ConnectionQuality.Lost:
      return { level: 'bad', bars: 1, label: 'Conexão ruim: o áudio está sendo perdido' };
    default:
      return { level: 'pending', bars: 0, label: 'Medindo a conexão…' };
  }
}
