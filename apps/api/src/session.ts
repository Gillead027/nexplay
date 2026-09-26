import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from './config.js';

const COOKIE_NAME = 'nexplay_session';
// Login "permanente": o cookie vale 1 ano (o teto que os navegadores aceitam é ~400 dias) e é renovado enquanto
// a pessoa usa o app (ver sessionNeedsRenewal), então na prática só sai quem clica em "Sair da conta".
const SESSION_DURATION_SECONDS = 365 * 24 * 60 * 60;
// Renova no máximo uma vez por dia, para não reenviar o cookie em toda requisição.
const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;

export interface SessionIdentity {
  id: string;
  displayName: string;
}

export interface SessionDetails extends SessionIdentity {
  expiresAt: number;
  // Carimbo da senha no momento do login (ver credentialStamp). Ausente nas sessões antigas, de 12 h.
  stamp?: string;
}

type SessionPayload = SessionDetails;

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', config.SESSION_SECRET).update(encodedPayload).digest('base64url');
}

function readCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [];
      return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1))]];
    }),
  );
}

// Impressão digital da senha atual (derivada do hash guardado, com o segredo da sessão): vai dentro do cookie e
// é conferida a cada requisição. Como o login agora dura um ano, trocar a senha precisa derrubar as sessões que
// existiam — o cookie antigo carrega o carimbo da senha antiga e deixa de valer.
export function credentialStamp(passwordHash: string): string {
  return createHmac('sha256', config.SESSION_SECRET).update(`senha:${passwordHash}`).digest('base64url').slice(0, 16);
}

export function createSession(id: string, displayName: string, passwordHash?: string): SessionPayload {
  return {
    id,
    displayName,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    ...(passwordHash !== undefined ? { stamp: credentialStamp(passwordHash) } : {}),
  };
}

export function setSessionCookie(response: Response, session: SessionPayload): void {
  const encodedPayload = encode(JSON.stringify(session));
  response.cookie(COOKIE_NAME, `${encodedPayload}.${sign(encodedPayload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURE,
    maxAge: SESSION_DURATION_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURE,
    path: '/',
  });
}

// Extraída de getSession() pra ser reaproveitada pelo handshake do
// WebSocket (apps/api/src/realtime.ts), que recebe o upgrade HTTP antes de
// qualquer middleware do Express rodar e por isso não tem acesso a um
// objeto Request — só ao header bruto de cookie da requisição de upgrade.
export function getSessionDetailsFromCookieHeader(cookieHeader: string | undefined): SessionDetails | null {
  const raw = readCookies(cookieHeader)[COOKIE_NAME];
  if (!raw) return null;

  const [encodedPayload, providedSignature] = raw.split('.');
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const actualBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as SessionPayload;
    if (
      typeof payload.id !== 'string' ||
      typeof payload.displayName !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Date.now() / 1000 ||
      (payload.stamp !== undefined && typeof payload.stamp !== 'string')
    ) {
      return null;
    }
    return {
      id: payload.id,
      displayName: payload.displayName,
      expiresAt: payload.expiresAt,
      ...(payload.stamp !== undefined ? { stamp: payload.stamp } : {}),
    };
  } catch {
    return null;
  }
}

export function getSessionFromCookieHeader(cookieHeader: string | undefined): SessionIdentity | null {
  const details = getSessionDetailsFromCookieHeader(cookieHeader);
  return details ? { id: details.id, displayName: details.displayName } : null;
}

export function getSessionDetails(request: Request): SessionDetails | null {
  return getSessionDetailsFromCookieHeader(request.headers.cookie);
}

export function getSession(request: Request): SessionIdentity | null {
  return getSessionFromCookieHeader(request.headers.cookie);
}

// A sessão ainda vale para a senha atual da conta? Sessões antigas (sem carimbo, de antes do login
// permanente) continuam valendo até expirarem; a primeira requisição delas já as troca por uma com carimbo.
export function isSessionCurrent(details: SessionDetails, passwordHash: string): boolean {
  if (details.stamp === undefined) return true;
  const actual = Buffer.from(details.stamp);
  const expected = Buffer.from(credentialStamp(passwordHash));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Renova o cookie (mais um ano a partir de hoje) quando já passou um dia desde a emissão — inclusive nas
// sessões antigas de 12 h, que assim viram permanentes na primeira vez em que a pessoa abre o app.
export function sessionNeedsRenewal(details: SessionDetails): boolean {
  return details.expiresAt - Date.now() / 1000 < SESSION_DURATION_SECONDS - SESSION_RENEW_AFTER_SECONDS;
}

export function inviteMatches(provided: string): boolean {
  const actual = Buffer.from(provided);
  const expected = Buffer.from(config.INVITE_TOKEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
