/**
 * Regras puras de autorização/acesso, usadas pelo frontend.
 *
 * A fonte de verdade é o banco (tabela `user_access` com RLS); aqui só
 * derivamos o que a UI pode mostrar. Nunca confiar nestas funções para
 * segurança — a autorização real acontece no PostgreSQL/RLS e nas RPCs
 * administrativas.
 */

export const STATUS_ACESSO = {
  PENDING: 'pending',
  APPROVED: 'approved',
  BLOCKED: 'blocked',
};

export function statusAcesso(acesso) {
  return acesso?.status ?? null;
}

export function podeAcessar(acesso) {
  return acesso?.status === STATUS_ACESSO.APPROVED;
}

export function podeAdministrar(acesso) {
  return acesso?.status === STATUS_ACESSO.APPROVED && acesso?.is_admin === true;
}

/**
 * Decisão única do fluxo de acesso.
 *
 * Importante: `carregando` precisa ser verdadeiro enquanto a sessão ainda
 * não produziu o registro de acesso. Sem isso, um administrador logado é
 * redirecionado antes de a permissão ser carregada (regressão já corrigida).
 *
 * Retorna:
 * - 'aguardar'  → sessão/carregamento ainda em andamento (nenhuma decisão)
 * - 'login'     → sem sessão
 * - 'erro'      → falha ao consultar permissões (falha fechada, sem acesso)
 * - 'pending'   → registro ausente (falha fechada, tratado como pendente)
 * - 'approved'  → acesso liberado
 * - 'blocked'   → acesso suspenso
 */
export function estadoAcesso({ authLoading, user, acesso, erro, carregando } = {}) {
  if (authLoading) return 'aguardar';
  if (!user) return 'login';
  if (carregando) return 'aguardar';
  if (erro) return 'erro';
  if (!acesso || !acesso.status) return 'pending';
  return acesso.status;
}

/**
 * Decisão da área administrativa. Só entrega o painel quando a sessão foi
 * recuperada, o acesso foi carregado sem erro e é `approved` + `is_admin`.
 */
export function estadoAdmin({ authLoading, user, acesso, erro, carregando } = {}) {
  const estado = estadoAcesso({ authLoading, user, acesso, erro, carregando });
  if (estado !== STATUS_ACESSO.APPROVED) return estado;
  return acesso?.is_admin === true ? 'admin' : 'negar';
}

/**
 * Decisão da rota protegida.
 *
 * - `permitidas` são caminhos acessíveis mesmo sem aprovação (ex.: escolher
 *   apelido / aguardando aprovação).
 * - Falha na consulta ou registro ausente ⇒ 'erro' (falha fechada): nunca
 *   abrir o conteúdo sem confirmação.
 *
 * Retorna: 'aguardar' | 'login' | 'erro' | 'bloqueado' | 'pendente' | 'ok'
 */
export function estadoRota({
  verificando,
  user,
  acesso,
  erro,
  carregando,
  caminho,
  permitidas = [],
} = {}) {
  const estado = estadoAcesso({ authLoading: verificando, user, acesso, erro, carregando });
  if (estado === 'aguardar' || estado === 'login' || estado === 'erro') return estado;
  // Sem registro de acesso (estadoAcesso devolveria 'pending') ⇒ erro fechado.
  if (!acesso || !acesso.status) return 'erro';
  if (estado === STATUS_ACESSO.BLOCKED) return 'bloqueado';
  if (estado !== STATUS_ACESSO.APPROVED && !permitidas.includes(caminho)) return 'pendente';
  return 'ok';
}

/**
 * Próximo passo do cadastro, conforme o Supabase Auth:
 * - com sessão → tela de aguardando aprovação;
 * - sem sessão → e-mail de confirmação pendente (confirmação de e-mail ativa).
 */
export function proximoPassoCadastro(sessaoAtiva) {
  return sessaoAtiva ? '/aguardando-aprovacao' : 'confirmar-email';
}

export function rotuloStatus(status) {
  switch (status) {
    case STATUS_ACESSO.PENDING:
      return 'Aguardando aprovação';
    case STATUS_ACESSO.APPROVED:
      return 'Aprovado';
    case STATUS_ACESSO.BLOCKED:
      return 'Bloqueado';
    default:
      return 'Desconhecido';
  }
}

export function corStatus(status) {
  switch (status) {
    case STATUS_ACESSO.PENDING:
      return 'amber';
    case STATUS_ACESSO.APPROVED:
      return 'emerald';
    case STATUS_ACESSO.BLOCKED:
      return 'rose';
    default:
      return 'slate';
  }
}
