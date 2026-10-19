import { IntegrationError } from './store.mjs';
import { chatModels, defaultChatModel } from './chat-models.mjs';

export function chatConfig(env, config) {
  return { enabled: !!env.OPENROUTER_API_KEY && !!env.CHAT_CLIENT_ID, clientId: env.CHAT_CLIENT_ID || '', issuer: config.issuer,
    audience: config.audience, redirectUri: config.publicUrl + '/chat/callback', repository: env.GITHUB_REPOSITORY,
    branch: env.GITHUB_BRANCH || 'main', workspaces: (env.PROJECTFLOW_WORKSPACES || 'work').split(',').map(s => s.trim()),
    model: defaultChatModel(env), models: chatModels(env), features:{notesEdit:{version:1,maxOperations:20,maxPageBytes:60000},vision:{version:1,maxImages:2,maxBytes:900000}} };
}
export function chatCallback(config) {
  const origins = JSON.stringify(config.origins).replace(/</g, '\\u003c');
  const script = `const q=new URLSearchParams(location.search);history.replaceState(null,'','/chat/callback');const data={type:'projectflow-chat-auth',code:q.get('code'),state:q.get('state'),error:q.has('error')?'Não foi possível concluir o login.':null};if(window.opener){for(const origin of ${origins})window.opener.postMessage(data,origin);document.getElementById('status').textContent='Login recebido. Volte ao ProjectFlow.';}else{document.getElementById('status').textContent='Volte ao ProjectFlow e abra o login pelo botão Entrar.';}`;
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProjectFlow · Login</title><p id="status">Concluindo login…</p><script>${script}</script></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' }
  });
}
export async function exchangeChatCode(env, config, body, authenticate, fetcher = (url, options) => fetch(url, options)) {
  if (!env.CHAT_CLIENT_ID) throw new IntegrationError('chat_configuration', 'Login do chat não configurado.', 503);
  if (!body || Object.keys(body).some(k => !['code', 'verifier'].includes(k)) || typeof body.code !== 'string' || body.code.length > 2000
      || typeof body.verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.verifier)) throw new IntegrationError('invalid_input', 'Código de login inválido.');
  let response;
  try {
    response = await fetcher(new URL('/oauth/token', config.issuer).href, { method: 'POST', redirect: 'manual',
      signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', client_id: env.CHAT_CLIENT_ID, code: body.code,
        code_verifier: body.verifier, redirect_uri: config.publicUrl + '/chat/callback' }) });
  } catch { throw new IntegrationError('login_unavailable', 'O serviço de login não respondeu. Tente novamente.', 502); }
  if (!response.ok) throw new IntegrationError('login_failed', 'O login expirou ou foi recusado. Entre novamente.', 401);
  const value = await response.json();
  if (typeof value.access_token !== 'string') throw new IntegrationError('login_failed', 'Resposta de login inválida.', 401);
  await authenticate('Bearer ' + value.access_token);
  return { access_token: value.access_token, expires_in: Math.min(Number(value.expires_in) || 3600, 86400), token_type: 'Bearer' };
}
