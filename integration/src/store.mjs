import { validateDocument } from './schemas.mjs';
import { Buffer } from 'node:buffer';

export class IntegrationError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const areas = { todo: 'todo.json', plans: 'planos-de-acao.json', schedules: 'cronogramas.json' };
const maxBytes = 5 * 1024 * 1024;

export class GitHubStore {
  constructor({ repository, token, branch, workspaces = ['work'], fetcher = fetch }) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !token) {
      throw new IntegrationError('configuration', 'Configure o repositório privado e GITHUB_TOKEN no servidor.', 503);
    }
    if (!workspaces.length || workspaces.some(w => !['work', 'personal'].includes(w))) {
      throw new IntegrationError('configuration', 'PROJECTFLOW_WORKSPACES inválido.', 503);
    }
    Object.assign(this, { repository, token, branch, workspaces, fetcher });
  }
  path(area, workspace) {
    if (!this.workspaces.includes(workspace)) throw new IntegrationError('workspace_forbidden', 'Este ambiente não foi habilitado no servidor.', 403);
    if (!Object.hasOwn(areas, area)) throw new IntegrationError('invalid_area', 'Área inválida.');
    return `backups/${workspace === 'personal' ? 'pessoal/' : ''}${areas[area]}`;
  }
  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetcher(`https://api.github.com/repos/${this.repository}${path}`, {
        ...options, redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ProjectFlow-Integration/1.0',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
      });
    } catch {
      throw new IntegrationError('upstream_unavailable', 'Não foi possível confirmar a operação no GitHub. Consulte novamente antes de repetir a gravação.', 502);
    }
    // Workers supports manual/follow only. Never forward credentials to a redirect.
    if (response.status >= 300 && response.status < 400) {
      throw new IntegrationError('github_redirect', 'GitHub redirecionou a operação. Revise o repositório configurado antes de tentar novamente.', 502);
    }
    if (!response.ok) {
      const errors = {
        401: ['github_auth', 'Token do GitHub inválido ou expirado.', 502],
        403: ['github_denied', 'GitHub recusou a operação ou atingiu seu limite de uso.', 502],
        404: ['backup_missing', 'Repositório ou backup não encontrado. Conecte e salve essa área no aplicativo primeiro.', 404],
        409: ['version_conflict', 'Outra versão foi salva. Consulte os dados e revise a alteração antes de tentar novamente.', 409],
        422: ['github_rejected', 'GitHub recusou a gravação. Consulte a versão atual antes de tentar novamente.', 409]
      };
      throw new IntegrationError(...(errors[response.status] || ['upstream_error', 'Falha na resposta do GitHub.', 502]));
    }
    try { return await response.json(); }
    catch { throw new IntegrationError('invalid_response', 'Resposta inválida do GitHub.', 502); }
  }
  async connect() {
    if (this.connected) return;
    const repo = await this.request('');
    if (repo.private !== true || repo.has_pages === true) {
      throw new IntegrationError('unsafe_repository', 'Use um repositório privado, com GitHub Pages desativado, para os backups.', 403);
    }
    this.branch ||= repo.default_branch;
    if (!this.branch) throw new IntegrationError('configuration', 'Branch de backups não disponível.', 503);
    this.connected = true;
  }
  async read(area, workspace) {
    const path = this.path(area, workspace);
    await this.connect();
    const file = await this.request(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    if (file.encoding !== 'base64' || !/^[a-f0-9]{40}$/.test(file.sha || '') || !Number.isFinite(file.size)
        || file.size > maxBytes || typeof file.content !== 'string' || file.content.length > maxBytes * 1.5) {
      throw new IntegrationError('invalid_backup', 'Backup ausente, grande demais ou em formato incompatível.', 422);
    }
    let data;
    try { data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')); validateDocument(area, data); }
    catch { throw new IntegrationError('invalid_backup', 'Backup inválido; nenhum dado foi alterado.', 422); }
    return { data, version: file.sha, path, branch: this.branch };
  }
  async write(area, workspace, snapshot, data, message) {
    if (snapshot.path !== this.path(area, workspace)) throw new IntegrationError('workspace_mismatch', 'O backup pertence a outro ambiente.', 409);
    try { validateDocument(area, data); }
    catch { throw new IntegrationError('invalid_backup', 'A alteração gerou dados incompatíveis. Nenhum dado foi enviado.', 422); }
    const json = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
    if (Buffer.byteLength(json) > maxBytes) throw new IntegrationError('backup_too_large', 'O backup excedeu o limite de tamanho.', 422);
    const result = await this.request(`/contents/${snapshot.path}`, {
      method: 'PUT', body: JSON.stringify({ branch: snapshot.branch, sha: snapshot.version,
        message: `ProjectFlow (${workspace}): ${message}`, content: Buffer.from(json).toString('base64') })
    });
    if (!/^[a-f0-9]{40}$/.test(result.content?.sha || '') || !/^[a-f0-9]{40}$/.test(result.commit?.sha || '')) {
      throw new IntegrationError('save_unconfirmed', 'O GitHub não confirmou a versão salva. Consulte novamente antes de repetir.', 502);
    }
    return { saved: true, version: result.content.sha, commit: result.commit.sha };
  }
}

export function storeFromEnv(env = process.env) {
  return new GitHubStore({ repository: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, branch: env.GITHUB_BRANCH,
    workspaces: (env.PROJECTFLOW_WORKSPACES || 'work').split(',').map(s => s.trim()).filter(Boolean) });
}
