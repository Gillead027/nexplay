// AudioWorklet "np-voice-dsp": o gate de voz (sensibilidade de entrada) e o medidor de nível do NexPlay. Roda na thread de áudio.
//
// - Mede o nível da voz (RMS em dBFS) e abre ou fecha o gate: abre na hora que a voz passa do limite, segura aberto por um tempo
//   depois que ela para (para não cortar o fim das palavras) e fecha suavemente. Um pequeno atraso (lookahead) deixa o gate
//   abrir ANTES da primeira sílaba passar, então o começo da fala não é engolido.
// - Modo automático: acompanha o ruído de fundo (o piso do nível) e coloca o limite um pouco acima dele, sozinho.
// - Manda o nível, o limite e o estado do gate para a tela (medidor em tempo real) ~19 vezes por segundo.
//
// Mensagens recebidas: { config: { enabled, auto, thresholdDb } }. Sem dependências: é carregado por audioWorklet.addModule().

const LOOKAHEAD_MS = 6;
const HOLD_MS = 280;
const ATTACK_MS = 2.5;
const RELEASE_MS = 30;
const HYSTERESIS_DB = 4;
const REPORT_EVERY_BLOCKS = 7;
const MIN_DB = -100;
const FLOOR_BUCKETS = 8;
const FLOOR_BUCKET_BLOCKS = 110;
// Abaixo disto é silêncio digital (ainda não chegou áudio, ou o microfone está mudo): não diz nada sobre o ruído do ambiente.
const SILENCE_DB = -90;

class VoiceDspProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.config = { enabled: false, auto: true, thresholdDb: -50 };
    this.lookahead = Math.max(1, Math.round((sampleRate * LOOKAHEAD_MS) / 1000));
    this.delayBuffers = [];
    this.writeIndex = 0;
    this.holdSamples = Math.round((sampleRate * HOLD_MS) / 1000);
    this.attackCoef = 1 - Math.exp(-1 / ((sampleRate * ATTACK_MS) / 1000));
    this.releaseCoef = 1 - Math.exp(-1 / ((sampleRate * RELEASE_MS) / 1000));
    this.gain = 1;
    this.open = true;
    this.sinceLoud = 0;
    this.smoothedPower = 0;
    this.levelDb = MIN_DB;
    // Acompanhamento do ruído de fundo (modo automático): o piso é o nível mais baixo dos últimos ~2,3 s, guardado em
    // 8 janelas de ~0,3 s (assim sobe sozinho quando o ambiente fica mais barulhento e cai na hora quando fica mais quieto).
    this.floorDb = -60;
    this.speechDb = -25;
    this.calibrationBlocks = 0;
    this.bucketMins = new Float32Array(FLOOR_BUCKETS).fill(Infinity);
    this.bucketPos = 0;
    this.bucketBlocks = 0;
    this.blocks = 0;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && data.config) this.config = { ...this.config, ...data.config };
    };
  }

  autoThresholdDb() {
    // Nos primeiros ~0,4 s ainda não se conhece o ruído: limite discreto para não engolir a fala.
    if (this.calibrationBlocks < 150) return -58;
    let limit = this.floorDb + 11;
    // Quem fala baixo não pode ficar com o limite acima da própria voz: só vale quando há folga real acima do ruído.
    if (this.speechDb - 14 > this.floorDb + 6) limit = Math.min(limit, this.speechDb - 14);
    // Fala contínua, sem pausas, puxa o piso para cima: o limite nunca passa da própria voz.
    limit = Math.min(limit, this.speechDb - 6);
    return Math.min(-30, Math.max(-66, limit));
  }

  updateFloor(levelDb) {
    if (levelDb <= SILENCE_DB) return;
    this.calibrationBlocks += 1;
    const position = this.bucketPos;
    if (levelDb < this.bucketMins[position]) this.bucketMins[position] = levelDb;
    this.bucketBlocks += 1;
    if (this.bucketBlocks >= FLOOR_BUCKET_BLOCKS) {
      this.bucketBlocks = 0;
      this.bucketPos = (position + 1) % FLOOR_BUCKETS;
      this.bucketMins[this.bucketPos] = Infinity;
    }
    let lowest = Infinity;
    for (let i = 0; i < FLOOR_BUCKETS; i++) if (this.bucketMins[i] < lowest) lowest = this.bucketMins[i];
    if (lowest !== Infinity) this.floorDb = lowest;
    // A voz mais alta recente (cai devagar) impede o limite de ficar acima da própria fala.
    if (levelDb > this.speechDb) this.speechDb = levelDb;
    else this.speechDb -= 0.0009;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    const frames = input[0].length;
    const channels = Math.min(input.length, output.length);

    while (this.delayBuffers.length < channels) this.delayBuffers.push(new Float32Array(this.lookahead));

    // Nível do bloco: o canal mais alto, suavizado por ~10 ms para não oscilar com cada onda.
    let blockPower = 0;
    for (let channel = 0; channel < channels; channel++) {
      const samples = input[channel];
      let sum = 0;
      for (let i = 0; i < frames; i++) sum += samples[i] * samples[i];
      blockPower = Math.max(blockPower, sum / frames);
    }
    this.smoothedPower = this.smoothedPower * 0.55 + blockPower * 0.45;
    this.levelDb = this.smoothedPower > 1e-10 ? 10 * Math.log10(this.smoothedPower) : MIN_DB;

    const config = this.config;
    if (config.auto) this.updateFloor(this.levelDb);
    const threshold = config.auto ? this.autoThresholdDb() : config.thresholdDb;

    if (!config.enabled) {
      this.open = true;
      this.sinceLoud = 0;
    } else if (this.levelDb > threshold) {
      this.open = true;
      this.sinceLoud = 0;
    } else if (this.open) {
      this.sinceLoud += frames;
      if (this.sinceLoud >= this.holdSamples && this.levelDb < threshold - HYSTERESIS_DB) this.open = false;
    }

    // Aplica o ganho do gate, amostra a amostra, sobre o sinal atrasado pelo lookahead.
    const target = this.open ? 1 : 0;
    const coef = target > this.gain ? this.attackCoef : this.releaseCoef;
    let writeIndex = this.writeIndex;
    let gain = this.gain;
    for (let i = 0; i < frames; i++) {
      gain += (target - gain) * coef;
      for (let channel = 0; channel < channels; channel++) {
        const buffer = this.delayBuffers[channel];
        const delayed = buffer[writeIndex];
        buffer[writeIndex] = input[channel][i];
        output[channel][i] = delayed * gain;
      }
      writeIndex = writeIndex + 1 === this.lookahead ? 0 : writeIndex + 1;
    }
    this.writeIndex = writeIndex;
    this.gain = gain;
    for (let channel = channels; channel < output.length; channel++) output[channel].set(output[0]);

    this.blocks += 1;
    if (this.blocks % REPORT_EVERY_BLOCKS === 0) {
      this.port.postMessage({ level: this.levelDb, open: this.open, threshold, floor: this.floorDb, gate: config.enabled });
    }
    return true;
  }
}

registerProcessor('np-voice-dsp', VoiceDspProcessor);
