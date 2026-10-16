import { createRemoteJWKSet, jwtVerify } from 'jose';
import { IntegrationError } from './store.mjs';

function httpsUrl(value, label, allowLocal = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Configure ${label}.`); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:'
      && !(allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error(`${label} exige HTTPS, sem credenciais, query ou fragmento.`);
  }
  return url;
}
export function httpConfig(env = process.env) {
  const url = httpsUrl(env.PUBLIC_URL, 'PUBLIC_URL', true);
  if (url.pathname !== '/') throw new Error('PUBLIC_URL deve conter somente a origem, sem caminho.');
  httpsUrl(env.OAUTH_ISSUER, 'OAUTH_ISSUER');
  // Keep the issuer's original trailing-slash semantics; JWT issuer equality is exact.
  const issuerValue = env.OAUTH_ISSUER;
  const jwksUrl = httpsUrl(env.OAUTH_JWKS_URL, 'OAUTH_JWKS_URL');
  const subjects = (env.OAUTH_SUBJECTS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!subjects.length) throw new Error('Configure OAUTH_SUBJECTS com os usuários autorizados.');
  const audience = env.OAUTH_AUDIENCE || `${url.origin}/mcp`;
  if (audience !== `${url.origin}/mcp`) throw new Error('OAUTH_AUDIENCE deve ser PUBLIC_URL/mcp.');
  const origins = (env.ALLOWED_ORIGINS || url.origin).split(',').map(s => httpsUrl(s.trim(), 'ALLOWED_ORIGINS', true).origin);
  return { publicUrl: url.origin, issuer: issuerValue, jwksUrl, audience, subjects, origins,
    host: env.HOST || '127.0.0.1', port: Number(env.PORT || 8787) };
}
export function createAuthenticator(config, keySet = createRemoteJWKSet(config.jwksUrl)) {
  return async authorization => {
    if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) throw new IntegrationError('unauthorized', 'Autenticação necessária.', 401);
    let payload;
    try {
      ({ payload } = await jwtVerify(authorization.slice(7), keySet, {
        issuer: config.issuer, audience: config.audience, algorithms: ['RS256', 'ES256', 'PS256'],
        requiredClaims: ['iss', 'aud', 'sub', 'exp'], clockTolerance: 5
      }));
    } catch { throw new IntegrationError('unauthorized', 'Token de acesso inválido ou expirado.', 401); }
    if (!config.subjects.includes(payload.sub)) throw new IntegrationError('forbidden', 'Usuário não autorizado para este ProjectFlow.', 403);
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/)
      : Array.isArray(payload.scp) ? payload.scp.filter(s => typeof s === 'string') : [];
    if (!scopes.some(s => ['projectflow:read', 'projectflow:write'].includes(s))) {
      throw new IntegrationError('insufficient_scope', 'Token sem permissão para o ProjectFlow.', 403);
    }
    return { subject: payload.sub, scopes };
  };
}
