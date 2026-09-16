import { createServer } from 'node:http';
import { once } from 'node:events';
import { AudioTrackFeature, SignalRequest, TrackType } from '@livekit/protocol';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { MUSIC_BOT_TRACK_NAME } from '@nexplay/shared';

// rtc-node's Rust backend omits TF_STEREO, even for a two-channel AudioSource.
// Until upstream #1023 ships, annotate only this bot's music publication.
// RTP/audio stays on the normal LiveKit connection; this only relays signaling.
// https://github.com/livekit/rust-sdks/pull/1023
export function markMusicStereo(data: Uint8Array): Uint8Array {
  const request = SignalRequest.fromBinary(data);
  if (request.message.case !== 'addTrack') return data;
  const track = request.message.value;
  if (track.type !== TrackType.AUDIO || track.name !== MUSIC_BOT_TRACK_NAME) return data;
  track.stereo = true;
  if (!track.audioFeatures.includes(AudioTrackFeature.TF_STEREO)) {
    track.audioFeatures.push(AudioTrackFeature.TF_STEREO);
  }
  return request.toBinary();
}

function bytes(data: RawData): Buffer {
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
}

export async function createStereoSignaling(upstreamUrl: string): Promise<{ url: string; close: () => Promise<void> }> {
  const upstreamBase = new URL(upstreamUrl);
  const sockets = new Set<WebSocket>();
  const server = createServer((request, response) => {
    const target = new URL(request.url ?? '/', upstreamBase);
    if (target.host !== upstreamBase.host || request.method !== 'GET' || !/\/rtc(?:\/v1)?\/validate$/.test(target.pathname)) {
      response.writeHead(404).end();
      return;
    }
    target.protocol = upstreamBase.protocol === 'https:' || upstreamBase.protocol === 'wss:' ? 'https:' : 'http:';
    const headers = request.headers.authorization ? { authorization: request.headers.authorization } : {};
    void fetch(target, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' }).then(async (result) => {
      response.writeHead(result.status, { 'Content-Type': 'text/plain' }).end((await result.text()).slice(0, 8192));
    }).catch(() => response.writeHead(502).end('LiveKit unavailable'));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on('upgrade', (request, socket, head) => {
    const target = new URL(request.url ?? '/', upstreamBase);
    // Preserve the configured server's host; only the path/query come from the SDK.
    if (target.host !== upstreamBase.host || !/\/rtc(?:\/v1)?$/.test(target.pathname)) {
      socket.destroy();
      return;
    }
    target.protocol = upstreamBase.protocol === 'https:' || upstreamBase.protocol === 'wss:' ? 'wss:' : 'ws:';
    wss.handleUpgrade(request, socket, head, (client) => {
      const headers = request.headers.authorization ? { authorization: request.headers.authorization } : {};
      const upstream = new WebSocket(target, { headers, handshakeTimeout: 10000, maxPayload: 1024 * 1024 });
      sockets.add(client);
      sockets.add(upstream);
      let pending: Array<{ data: Uint8Array | Buffer; binary: boolean }> = [];
      let pendingBytes = 0;
      const finish = () => {
        pending = [];
        client.terminate();
        upstream.terminate();
        sockets.delete(client);
        sockets.delete(upstream);
      };
      client.on('error', finish);
      upstream.on('error', finish);
      client.on('close', finish);
      upstream.on('close', finish);
      client.on('message', (data, binary) => {
        try {
          const payload = binary ? markMusicStereo(bytes(data)) : bytes(data);
          if (upstream.readyState === WebSocket.OPEN) upstream.send(payload, { binary });
          else {
            pendingBytes += payload.byteLength;
            if (pendingBytes > 1024 * 1024) { finish(); return; }
            pending.push({ data: payload, binary });
          }
        } catch { finish(); }
      });
      upstream.on('open', () => {
        for (const message of pending) upstream.send(message.data, { binary: message.binary });
        pending = [];
        pendingBytes = 0;
      });
      upstream.on('message', (data, binary) => {
        if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
      });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  return {
    url: `ws://127.0.0.1:${port}${upstreamBase.pathname.replace(/\/$/, '')}`,
    close: async () => {
      for (const socket of sockets) socket.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
