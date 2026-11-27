/**
 * Regras puras de autorização/acesso, usadas pelo frontend.
 * A fonte de verdade é o banco (user_access via RLS); aqui só derivamos
 * o que a UI pode mostrar. Nunca confiar nestas funções para segurança.
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
