import { useEffect, useRef, useState } from 'react';
import {
  COMPRESSOR_LEVELS,
  NOISE_SUPPRESSION_LEVELS,
  sensitivityToThresholdDb,
  type CompressorLevel,
  type MicProfile,
  type NoiseSuppressionLevel,
} from '../audio/processingConfig';
import { startMicPreview, type MicPreview } from '../audio/micPreview';
import { levelToFraction, METER_STALE_MS, subscribeVoiceMeter, type VoiceMeterReport } from '../audio/voiceMeter';
import { useVoiceSettings, voiceSettingsStore } from '../audio/voiceSettingsStore';
import { MicIcon, SettingsIcon, SpeakerIcon } from './Icons';

const NOISE_LABELS: Record<NoiseSuppressionLevel, { title: string; hint: string }> = {
  off: { title: 'Nenhuma', hint: 'O microfone passa como está, com todo o ruído do ambiente.' },
  standard: { title: 'Padrão', hint: 'A supressão do navegador: boa contra ventilador e ruído constante, mais fraca contra teclado.' },
  high: { title: 'Alta (IA)', hint: 'Rede neural (RNNoise) rodando aqui no seu computador: tira ruído de fundo, ventilador e a maior parte do teclado.' },
  max: { title: 'Máxima (IA)', hint: 'A rede neural mais forte (GTCRN): também derruba digitação, cliques, respiração e sopro. Em contrapartida pode abafar vozes baixas e cortar o fim das palavras; use só em lugar muito barulhento.' },
};

const COMPRESSOR_LABELS: Record<CompressorLevel, { title: string; hint: string }> = {
  off: { title: 'Desligado', hint: 'Sem compressor: a voz sai com toda a variação de volume.' },
  light: { title: 'Leve', hint: 'Suaviza os picos: quem fala baixo e alto ao mesmo tempo fica mais uniforme.' },
  medium: { title: 'Médio', hint: 'Voz mais firme e presente, boa para rádio e streaming.' },
  strong: { title: 'Forte', hint: 'Volume bem nivelado: sussurro e grito saem quase iguais. Pode realçar ruído de fundo se a supressão estiver desligada.' },
};

const PROFILE_CARDS: Array<{ profile: MicProfile; title: string; text: string; icon: 'mic' | 'speaker' | 'settings' }> = [
  { profile: 'isolamento', title: 'Isolamento de voz', text: 'Só a sua voz: supressão de ruído por IA (mantém a voz natural), cancelamento de eco e controle automático de ganho.', icon: 'mic' },
  { profile: 'estudio', title: 'Estúdio', text: 'Áudio puro: o microfone sem nenhum tratamento (só a sensibilidade de entrada continua valendo).', icon: 'speaker' },
  { profile: 'personalizado', title: 'Personalizado', text: 'Escolha cada tratamento: supressão de ruído, eco, ganho, compressor de voz e volume de entrada.', icon: 'settings' },
];

// O medidor: barra com o nível da voz já tratada e o marcador do limite da sensibilidade (a barra acende quando o gate está aberto).
function InputMeter({ testing }: { testing: boolean }) {
  const [report, setReport] = useState<VoiceMeterReport | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => subscribeVoiceMeter(setReport), []);
  // Sem relatórios novos (ninguém falando na chamada, teste parado) a barra volta a zero sozinha.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, []);

  const fresh = report && Date.now() - report.at < METER_STALE_MS ? report : null;
  const level = fresh?.level ?? -100;
  const open = fresh ? (fresh.gate ? fresh.open : true) : false;
  const thresholdFraction = fresh && fresh.gate ? levelToFraction(fresh.threshold) : null;
  const label = !fresh
    ? testing ? 'Aguardando o áudio…' : 'Abra o teste (ou entre numa chamada) para ver o nível da sua voz.'
    : fresh.gate
      ? open ? 'Microfone aberto: a voz está passando' : 'Microfone fechado: abaixo da sensibilidade'
      : 'Sem sensibilidade (push-to-talk): a voz sempre passa';

  return (
    <div className="voice-meter" role="img" aria-label={`Nível de entrada ${Math.round(level)} decibéis. ${label}`}>
      <div className="voice-meter-track">
        <div className={`voice-meter-fill ${open ? 'open' : 'closed'}`} style={{ width: `${levelToFraction(level) * 100}%` }} />
        {thresholdFraction !== null && <div className="voice-meter-threshold" style={{ left: `${thresholdFraction * 100}%` }} title="Limite da sensibilidade" />}
      </div>
      <div className="voice-meter-legend">
        <span>{label}</span>
        {fresh && fresh.reduction > 0.5 && <span className="voice-meter-chip">Compressor −{fresh.reduction.toFixed(0)} dB</span>}
        {fresh && <span className="voice-meter-db">{level > -99 ? `${Math.round(level)} dB` : '—'}</span>}
      </div>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  describe,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  describe: Record<T, { title: string; hint: string }>;
}) {
  return (
    <div className="voice-choice">
      <div className="voice-choice-buttons" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={value === option ? 'active' : ''}
            onClick={() => onChange(option)}
          >
            {describe[option].title}
          </button>
        ))}
      </div>
      <p className="settings-hint">{describe[value].hint}</p>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="settings-toggle-row voice-processing-toggle">
      <div>
        <span className="settings-label">{label}</span>
        <p className="settings-hint">{hint}</p>
      </div>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`settings-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} />
    </div>
  );
}

/**
 * Tudo do tratamento de áudio do microfone, como nas configurações de voz do Discord, mas com efeito de verdade: o medidor mostra
 * a voz já tratada, o teste passa o som pelo mesmo caminho da chamada e qualquer mudança vale na hora, na chamada e no teste.
 */
export function VoiceProcessingPane({ micDeviceId, search }: { micDeviceId: string; search: (text: string) => boolean }) {
  const { settings, inputMode, config } = useVoiceSettings();
  const [testing, setTesting] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [testError, setTestError] = useState('');
  const [neuralWarning, setNeuralWarning] = useState(false);
  const previewRef = useRef<MicPreview | null>(null);

  function stopTest() {
    previewRef.current?.stop();
    previewRef.current = null;
    setTesting(false);
    setMonitoring(false);
  }

  // Trocar de microfone ou fechar a tela encerra o teste (ele abre o dispositivo escolhido).
  useEffect(() => stopTest, [micDeviceId]);

  async function startTest() {
    setTestError('');
    setNeuralWarning(false);
    try {
      const preview = await startMicPreview(micDeviceId);
      previewRef.current = preview;
      setTesting(true);
      // O modelo de IA pode demorar alguns instantes na primeira vez; se falhar, o teste avisa.
      window.setTimeout(() => setNeuralWarning(preview.neuralFailed()), 4000);
    } catch {
      setTestError('Não foi possível abrir o microfone. Confira a permissão e o dispositivo escolhido.');
    }
  }

  function toggleMonitor() {
    const next = !monitoring;
    previewRef.current?.setMonitor(next);
    setMonitoring(next);
  }

  const custom = settings.profile === 'personalizado';
  const thresholdDb = sensitivityToThresholdDb(settings.inputSensitivity);

  return (
    <>
      {search('teste de microfone nível medidor') && (
        <>
          <span className="settings-label">Teste de microfone</span>
          <div className="voice-test">
            <div className="voice-test-actions">
              <button type="button" className="test-toggle-button" onClick={() => (testing ? stopTest() : void startTest())}>
                {testing ? 'Parar teste' : 'Testar microfone'}
              </button>
              {testing && (
                <button type="button" className={`test-toggle-button ${monitoring ? 'active' : ''}`} aria-pressed={monitoring} onClick={toggleMonitor}>
                  {monitoring ? 'Parar de me ouvir' : 'Ouvir a mim mesmo'}
                </button>
              )}
            </div>
            <InputMeter testing={testing} />
            {monitoring && <p className="settings-hint">Você está ouvindo o áudio já tratado, do jeito que os outros vão ouvir. Use fones de ouvido para não gerar microfonia.</p>}
            {testError && <p className="settings-hint voice-test-error" role="alert">{testError}</p>}
            {neuralWarning && (
              <p className="settings-hint voice-test-error" role="alert">
                Não foi possível carregar a supressão de ruído por IA agora; o áudio segue só com a supressão do navegador.
              </p>
            )}
          </div>
        </>
      )}

      {search('perfil de entrada isolamento de voz estúdio personalizado') && (
        <>
          <span className="settings-label">Perfil de entrada</span>
          <div className="input-mode-cards mic-profile-cards" role="group" aria-label="Perfil de entrada de microfone">
            {PROFILE_CARDS.map((card) => (
              <button
                key={card.profile}
                type="button"
                className={`input-mode-card ${settings.profile === card.profile ? 'active' : ''}`}
                onClick={() => voiceSettingsStore.update({ profile: card.profile })}
              >
                {card.icon === 'mic' ? <MicIcon size={18} /> : card.icon === 'speaker' ? <SpeakerIcon size={18} /> : <SettingsIcon size={18} />}
                <strong>{card.title}</strong>
                <span>{card.text}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {custom && search('supressão de ruído cancelamento de eco ganho automático compressor volume de entrada') && (
        <div className="mic-profile-advanced">
          <span className="settings-label">Supressão de ruído</span>
          <ChoiceGroup
            label="Supressão de ruído"
            options={NOISE_SUPPRESSION_LEVELS}
            value={settings.noiseLevel}
            onChange={(noiseLevel) => voiceSettingsStore.update({ noiseLevel })}
            describe={NOISE_LABELS}
          />
          <ToggleRow
            label="Cancelamento de eco"
            hint="Evita que o som dos seus alto-falantes volte pelo microfone."
            checked={settings.echoCancellation}
            onChange={(echoCancellation) => voiceSettingsStore.update({ echoCancellation })}
          />
          <ToggleRow
            label="Controle automático de ganho"
            hint="Ajusta o volume de entrada sozinho para manter a fala num nível constante."
            checked={settings.autoGain}
            onChange={(autoGain) => voiceSettingsStore.update({ autoGain })}
          />
          <span className="settings-label">Compressor de voz</span>
          <ChoiceGroup
            label="Compressor de voz"
            options={COMPRESSOR_LEVELS}
            value={settings.compressor}
            onChange={(compressor) => voiceSettingsStore.update({ compressor })}
            describe={COMPRESSOR_LABELS}
          />
          <div>
            <label htmlFor="input-volume">Volume de entrada</label>
            <div className="pref-slider-row">
              <input
                id="input-volume"
                type="range"
                min={0}
                max={200}
                value={settings.inputVolume}
                onChange={(event) => voiceSettingsStore.update({ inputVolume: Number(event.target.value) })}
              />
              <output>{settings.inputVolume}%</output>
            </div>
            <p className="settings-hint">100% é o volume original do microfone. Acima disso a voz sobe (com um limitador para não estourar).</p>
          </div>
        </div>
      )}

      {!custom && search('perfil de entrada') && (
        <p className="settings-hint voice-active-summary">
          Em uso: supressão {NOISE_LABELS[config.noiseLevel].title.toLowerCase()}
          {config.echoCancellation ? ', cancelamento de eco' : ''}
          {config.autoGain ? ', controle automático de ganho' : ''}
          {config.compressor !== 'off' ? `, compressor ${COMPRESSOR_LABELS[config.compressor].title.toLowerCase()}` : ''}.
        </p>
      )}

      {search('sensibilidade de entrada limite gate') && (
        <div className="mic-sensitivity">
          <span className="settings-label">Sensibilidade de entrada</span>
          <ToggleRow
            label="Ajustar automaticamente a sensibilidade"
            hint="Em modo Voz ativa o microfone só transmite quando você fala de verdade. No automático ele aprende o ruído do ambiente sozinho e se adapta."
            checked={settings.autoSensitivity}
            onChange={(autoSensitivity) => voiceSettingsStore.update({ autoSensitivity })}
          />
          {!settings.autoSensitivity && (
            <div>
              <label htmlFor="input-sensitivity">Limite de sensibilidade</label>
              <div className="pref-slider-row">
                <input
                  id="input-sensitivity"
                  type="range"
                  min={0}
                  max={100}
                  value={settings.inputSensitivity}
                  onChange={(event) => voiceSettingsStore.update({ inputSensitivity: Number(event.target.value) })}
                />
                <output>{thresholdDb} dB</output>
              </div>
              <p className="settings-hint">Acompanhe o medidor acima: fale normalmente e coloque o marcador abaixo da barra da sua voz e acima do ruído do ambiente.</p>
            </div>
          )}
          {inputMode !== 'voice' && <p className="settings-hint">A sensibilidade só se aplica no modo Voz ativa. No push-to-talk a tecla já controla quando o microfone fala.</p>}
        </div>
      )}
    </>
  );
}
