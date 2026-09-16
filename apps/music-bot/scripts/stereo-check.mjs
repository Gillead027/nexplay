// Run inside the music-bot image: node /app/stereo-check.mjs
import assert from 'node:assert/strict';
import { Room, RoomEvent, AudioStream, dispose } from '@livekit/rtc-node';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { BotVoiceParticipant } from '/app/apps/music-bot/dist/botVoiceParticipant.js';
import { ensureDiagnosticAudioFile } from '/app/apps/music-bot/dist/ffmpegAudioSource.js';
import { MusicSessionManager } from '/app/apps/music-bot/dist/musicSession.js';
import { MusicProviderRegistry } from '/app/apps/music-bot/dist/musicProvider.js';
import { SpotifyProvider } from '/app/apps/music-bot/dist/spotifyProvider.js';
import { YouTubeProvider } from '/app/apps/music-bot/dist/youtubeProvider.js';
import { YtDlpClient } from '/app/apps/music-bot/dist/ytDlpClient.js';
import { parseMusicCommand } from '/app/packages/shared/dist/index.js';

const roomName = `stereo-check-${Date.now()}`;
// Optional real request: verifies /play through providers, session and two listeners.
const requestedInput = process.env.MUSIC_CHECK_INPUT;
const url = process.env.LIVEKIT_INTERNAL_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const service = new RoomServiceClient(url, apiKey, apiSecret);
const listeners = [new Room(), new Room()];
const measurements = listeners.map(() => ({ frames: 0, samples: 0, left: 0, right: 0, cross: 0 }));
const bot = new BotVoiceParticipant({ roomName, channelId: roomName, livekitUrl: url, apiKey, apiSecret,
  ffmpegPath: 'ffmpeg', ytdlpPath: 'yt-dlp', ytdlpPluginDir: '/app/.tools/yt-dlp-plugins',
  ytdlpCookiesPath: process.env.YTDLP_COOKIES_PATH ?? '',
  ytdlpPotBaseUrl: 'http://pot-provider:4416', log: (event, context) => console.log(event, context),
  lifecycle: { onHumansEmpty() {}, onDisconnected() {} } });
const youtube = new YouTubeProvider(new YtDlpClient('yt-dlp', process.env.YTDLP_COOKIES_PATH ?? ''));
const manager = new MusicSessionManager(() => bot, () => {},
  new MusicProviderRegistry([youtube, new SpotifyProvider(youtube)], 'youtube'));
let failure;
const readers = [];
const tasks = [];
try {
  await Promise.all(listeners.map(async (listener, index) => {
    listener.on(RoomEvent.TrackSubscribed, (track) => {
      const reader = new AudioStream(track, { sampleRate: 48000, numChannels: 2, frameSizeMs: 20 }).getReader();
      readers.push(reader);
      tasks.push((async () => {
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            const { data, channels } = result.value;
            assert.equal(channels, 2);
            assert.equal(data.length, 1920);
            const m = measurements[index];
            m.frames++;
            if (m.frames < 40) continue;
            for (let i = 0; i < data.length; i += 2) {
              m.left += data[i] ** 2;
              m.right += data[i + 1] ** 2;
              m.cross += data[i] * data[i + 1];
              m.samples++;
            }
          }
        } catch (error) { failure = error; }
      })());
    });
    const token = new AccessToken(apiKey, apiSecret, { identity: `stereo-listener-${index}`, ttl: '5m' });
    token.addGrant({ room: roomName, roomJoin: true, canPublish: false, canSubscribe: true });
    await listener.connect(url, await token.toJwt(), { autoSubscribe: true });
  }));
  if (requestedInput) {
    const parsed = parseMusicCommand(`/play ${requestedInput}`);
    assert.ok(parsed);
    const response = await manager.execute({ channelId: roomName, command: parsed.name, args: parsed.args,
      requestedBy: { id: 'stereo-listener-0', displayName: 'Music verification' } });
    assert.ok(response.nowPlaying, response.message);
    console.log(JSON.stringify({ command: 'play', title: response.nowPlaying.title, queued: manager.getSession(roomName)?.queue.length }));
  } else {
    await bot.connect();
    await bot.startLocalFileAudio(ensureDiagnosticAudioFile(), 100, { onFinished() {}, onError(error) { failure = error; } });
  }
  const deadline = Date.now() + 40000;
  while (measurements.some((m) => m.frames < 200) && !failure && Date.now() < deadline) {
    if (requestedInput && manager.getSession(roomName)?.state === 'ERROR') throw new Error('Real music playback failed before verification completed.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (failure) throw failure;
  for (const [index, m] of measurements.entries()) {
    assert.ok(m.frames >= 200, `listener ${index} receives continuous audio`);
    const correlation = m.cross / Math.sqrt(m.left * m.right);
    assert.ok(Math.sqrt(m.left / m.samples) > (requestedInput ? 10 : 1000), 'left is audible');
    assert.ok(Math.sqrt(m.right / m.samples) > (requestedInput ? 10 : 1000), 'right is audible');
    if (!requestedInput) assert.ok(Math.abs(correlation) < 0.25, `stereo is preserved: correlation=${correlation}`);
    console.log(JSON.stringify({ listener: index, frames: m.frames, correlation, leftRms: Math.sqrt(m.left / m.samples), rightRms: Math.sqrt(m.right / m.samples) }));
  }
  console.log(requestedInput ? 'REAL MUSIC COMMAND AND TWO LISTENERS PASS' : 'STEREO TRANSPORT PASS');
} finally {
  await manager.shutdown();
  await bot.disconnect();
  await Promise.all(readers.map((reader) => reader.cancel().catch(() => {})));
  await Promise.all(listeners.map((listener) => listener.disconnect()));
  await Promise.all(tasks);
  await service.deleteRoom(roomName).catch(() => {});
  dispose();
}
