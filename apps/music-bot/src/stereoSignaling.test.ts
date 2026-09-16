import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { AudioTrackFeature, SignalRequest, TrackType } from '@livekit/protocol';
import { MUSIC_BOT_TRACK_NAME } from '@nexplay/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { createStereoSignaling, markMusicStereo } from './stereoSignaling.js';

test('marks only the music audio track as stereo without dropping other fields', () => {
  const request = new SignalRequest({ message: { case: 'addTrack', value: {
    cid: 'track-1', name: MUSIC_BOT_TRACK_NAME, type: TrackType.AUDIO, muted: false,
    audioFeatures: [AudioTrackFeature.TF_NO_DTX],
  } } });
  const parsed = SignalRequest.fromBinary(markMusicStereo(request.toBinary()));
  assert.equal(parsed.message.case, 'addTrack');
  if (parsed.message.case !== 'addTrack') throw new Error('missing track');
  assert.equal(parsed.message.value.stereo, true);
  assert.equal(parsed.message.value.cid, 'track-1');
  assert.ok(parsed.message.value.audioFeatures.includes(AudioTrackFeature.TF_STEREO));
  assert.ok(parsed.message.value.audioFeatures.includes(AudioTrackFeature.TF_NO_DTX));
  assert.deepEqual(markMusicStereo(parsed.toBinary()), parsed.toBinary());
  if (request.message.case !== 'addTrack') throw new Error('missing track');
  request.message.value.name = 'different-track';
  assert.deepEqual(markMusicStereo(request.toBinary()), request.toBinary());
});

test('relays signaling and authentication query while annotating stereo', async () => {
  const upstream = createServer();
  const wss = new WebSocketServer({ server: upstream });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const proxy = await createStereoSignaling(`http://127.0.0.1:${(upstream.address() as { port: number }).port}`);
  const connection = once(wss, 'connection');
  const client = new WebSocket(`${proxy.url}/rtc/v1?protocol=16`, { headers: { authorization: 'Bearer test-token' } });
  try {
    const [socket, request] = await connection;
    assert.equal(request.url, '/rtc/v1?protocol=16');
    assert.equal(request.headers.authorization, 'Bearer test-token');
    const received = once(socket, 'message');
    if (client.readyState !== WebSocket.OPEN) await once(client, 'open');
    client.send(new SignalRequest({ message: { case: 'addTrack', value: { name: MUSIC_BOT_TRACK_NAME, type: TrackType.AUDIO } } }).toBinary());
    const [data] = await received;
    const signal = SignalRequest.fromBinary(data);
    assert.equal(signal.message.case, 'addTrack');
    if (signal.message.case === 'addTrack') assert.equal(signal.message.value.stereo, true);
    const response = once(client, 'message');
    socket.send(Buffer.from([1, 2, 3]));
    assert.deepEqual((await response)[0], Buffer.from([1, 2, 3]));
  } finally {
    client.terminate();
    await proxy.close();
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
