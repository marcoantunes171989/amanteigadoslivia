import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { normalizeLoginKey } from './admin-users.js';

// Limitador em memória do processo. Em serverless cada instância tem o seu
// próprio mapa: NÃO é proteção global. Para HML/PROD é necessário armazenamento
// compartilhado (ainda não implementado; ver relatório de hardening).

const WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_IDENTITY_MAX_ATTEMPTS = 10;
export const LOGIN_ORIGIN_MAX_ATTEMPTS = 50;
const PUBLIC_FORM_MAX_ATTEMPTS = 8;
const MAX_TRACKED_BUCKETS = 10_000;

const buckets = new Map();

function rateLimitError() {
  const error = new Error('rate_limited');
  error.status = 429;
  error.code = 'rate_limited';
  return error;
}

function sweepExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Incrementa o contador do bucket e lança 429 quando passa do máximo.
// Bucket novo com o mapa cheio (após limpeza) falha fechado: evita crescer
// sem limite sob inundação com identidades aleatórias.
function consume(key, { max, now }) {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && buckets.size >= MAX_TRACKED_BUCKETS) {
      sweepExpired(now);
      if (buckets.size >= MAX_TRACKED_BUCKETS) throw rateLimitError();
    }
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) throw rateLimitError();
}

// Origem confiável. O header do cliente NUNCA é usado diretamente:
// - Na Vercel, x-vercel-forwarded-for é preenchido pela plataforma (documentado
//   como o IP público do cliente; XFF enviado pelo cliente é sobrescrito, exceto
//   quando há proxy customizado à frente, o que não é o caso do projeto).
// - Fora da Vercel (dev local), usa o IP do socket. Não há header de cliente confiável.
// Valor ausente ou malformado resulta em null (o chamador usa um bucket comum).
export function trustedClientIp(request) {
  if (process.env.VERCEL) {
    const platform = request?.headers?.['x-vercel-forwarded-for'];
    const candidate = typeof platform === 'string' ? platform.trim() : '';
    return isIP(candidate) ? candidate : null;
  }
  const socketIp = request?.socket?.remoteAddress;
  return typeof socketIp === 'string' && isIP(socketIp) ? socketIp : null;
}

// Mesma normalização do cadastro/login (trim + minúsculas): variantes de case e
// espaço do mesmo usuário caem no mesmo bucket.
function identityKey(usuario) {
  const normalized = normalizeLoginKey(usuario);
  // Hash evita guardar o usuário em claro e limita o tamanho da chave.
  return `login-id:${crypto.createHash('sha256').update(normalized).digest('hex')}`;
}

// Login: duas camadas independentes, ambas sempre verificadas.
// - identidade (usuário normalizado): não depende de IP, então trocar headers não zera a conta.
// - origem (IP confiável): limita quem tenta muitos usuários diferentes.
// Sucesso NÃO zera nenhum contador: a janela fixa é a única forma de liberar.
export function assertLoginRateLimit(request, usuario, { now = Date.now() } = {}) {
  const ip = trustedClientIp(request) || 'unknown';
  consume(`login-ip:${ip}`, { max: LOGIN_ORIGIN_MAX_ATTEMPTS, now });
  if (normalizeLoginKey(usuario)) {
    consume(identityKey(usuario), { max: LOGIN_IDENTITY_MAX_ATTEMPTS, now });
  }
}

export function assertPublicFormRateLimit(request, extra = 'encomenda', { now = Date.now() } = {}) {
  const ip = trustedClientIp(request) || 'unknown';
  consume(`form:${ip}|${extra}`, { max: PUBLIC_FORM_MAX_ATTEMPTS, now });
}

export function resetLoginRateLimitForTests() {
  buckets.clear();
}
