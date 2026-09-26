import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import {
  createSession,
  credentialStamp,
  getSessionDetailsFromCookieHeader,
  getSessionFromCookieHeader,
  isSessionCurrent,
  sessionNeedsRenewal,
  setSessionCookie,
} from './session.js';

const DAY_SECONDS = 24 * 60 * 60;

// getSessionFromCookieHeader é o que autentica o handshake do WebSocket (ver
// apps/api/src/realtime.ts), que não passa pelo middleware do Express e por
// isso não tem um objeto Request pronto — só o header bruto de cookie.
function cookieFor(session: ReturnType<typeof createSession>): { header: string; maxAge: number } {
  let cookieValue = '';
  let maxAge = 0;
  const fakeResponse = {
    cookie: (_name: string, value: string, options: { maxAge: number }) => {
      cookieValue = value;
      maxAge = options.maxAge;
    },
  } as unknown as Response;
  setSessionCookie(fakeResponse, session);
  return { header: `nexplay_session=${cookieValue}`, maxAge };
}

function cookieHeaderFor(id: string, displayName: string): string {
  return cookieFor(createSession(id, displayName)).header;
}

describe('getSessionFromCookieHeader', () => {
  it('aceita um cookie de sessão recém-criado', () => {
    const header = cookieHeaderFor('user-1', 'Alice');
    assert.deepEqual(getSessionFromCookieHeader(header), { id: 'user-1', displayName: 'Alice' });
  });

  it('rejeita quando não há header de cookie', () => {
    assert.equal(getSessionFromCookieHeader(undefined), null);
  });

  it('rejeita quando o cookie de sessão está ausente entre outros cookies', () => {
    assert.equal(getSessionFromCookieHeader('outro=valor; tema=escuro'), null);
  });

  it('rejeita uma assinatura adulterada', () => {
    const header = cookieHeaderFor('user-1', 'Alice');
    const [name, value] = header.split('=');
    const [payload] = value?.split('.') ?? [];
    assert.equal(getSessionFromCookieHeader(`${name}=${payload}.assinatura-forjada`), null);
  });

  it('rejeita um payload corrompido mesmo com o formato certo', () => {
    assert.equal(getSessionFromCookieHeader('nexplay_session=YQ.YQ'), null);
  });
});

describe('login permanente', () => {
  it('a sessão dura um ano (o cookie também, e o navegador guarda mesmo depois de fechar o app)', () => {
    const { header, maxAge } = cookieFor(createSession('user-1', 'Alice', 'hash-da-senha'));
    assert.equal(maxAge, 365 * DAY_SECONDS * 1000);
    const details = getSessionDetailsFromCookieHeader(header);
    assert.ok(details);
    const remaining = details.expiresAt - Date.now() / 1000;
    assert.ok(remaining > 364 * DAY_SECONDS && remaining <= 365 * DAY_SECONDS, 'expira daqui a ~1 ano');
  });

  it('o carimbo da senha vai no cookie e só vale para a senha que o gerou', () => {
    const { header } = cookieFor(createSession('user-1', 'Alice', 'hash-antigo'));
    const details = getSessionDetailsFromCookieHeader(header)!;
    assert.equal(details.stamp, credentialStamp('hash-antigo'));
    assert.equal(isSessionCurrent(details, 'hash-antigo'), true);
    assert.equal(isSessionCurrent(details, 'hash-novo'), false, 'trocar a senha derruba o cookie antigo');
  });

  it('sessão antiga, sem carimbo (12 h), continua valendo e é candidata a renovação', () => {
    const { header } = cookieFor(createSession('user-1', 'Alice'));
    const details = getSessionDetailsFromCookieHeader(header)!;
    assert.equal(details.stamp, undefined);
    assert.equal(isSessionCurrent(details, 'qualquer-hash'), true);
  });

  it('só renova quando já passou um dia desde a emissão', () => {
    const now = Math.floor(Date.now() / 1000);
    const base = { id: 'user-1', displayName: 'Alice' };
    assert.equal(sessionNeedsRenewal({ ...base, expiresAt: now + 365 * DAY_SECONDS }), false, 'recém-emitida');
    assert.equal(sessionNeedsRenewal({ ...base, expiresAt: now + 365 * DAY_SECONDS - 60 * 60 }), false, 'emitida há 1 hora');
    assert.equal(sessionNeedsRenewal({ ...base, expiresAt: now + 364 * DAY_SECONDS - 60 }), true, 'emitida há mais de 1 dia');
    assert.equal(sessionNeedsRenewal({ ...base, expiresAt: now + 30 * DAY_SECONDS }), true, 'perto de vencer');
  });
});
