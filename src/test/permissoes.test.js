import { describe, expect, it } from 'vitest';
import {
  estadoAcesso,
  estadoAdmin,
  estadoRota,
  podeAcessar,
  podeAdministrar,
  proximoPassoCadastro,
  rotuloStatus,
  STATUS_ACESSO,
} from '../features/conta/permissoes.js';

describe('permissoes de acesso', () => {
  it('pendente não acessa', () => {
    expect(podeAcessar({ status: 'pending', is_admin: false })).toBe(false);
  });

  it('bloqueado não acessa', () => {
    expect(podeAcessar({ status: 'blocked', is_admin: false })).toBe(false);
  });

  it('aprovado acessa', () => {
    expect(podeAcessar({ status: 'approved', is_admin: false })).toBe(true);
  });

  it('null não acessa', () => {
    expect(podeAcessar(null)).toBe(false);
    expect(podeAcessar(undefined)).toBe(false);
  });

  it('admin não aprovado não administra', () => {
    expect(podeAdministrar({ status: 'pending', is_admin: true })).toBe(false);
    expect(podeAdministrar({ status: 'blocked', is_admin: true })).toBe(false);
  });

  it('aprovado + admin administra', () => {
    expect(podeAdministrar({ status: 'approved', is_admin: true })).toBe(true);
  });

  it('aprovado mas não admin não administra', () => {
    expect(podeAdministrar({ status: 'approved', is_admin: false })).toBe(false);
  });

  it('rótulos', () => {
    expect(rotuloStatus(STATUS_ACESSO.PENDING)).toBe('Aguardando aprovação');
    expect(rotuloStatus(STATUS_ACESSO.APPROVED)).toBe('Aprovado');
    expect(rotuloStatus(STATUS_ACESSO.BLOCKED)).toBe('Bloqueado');
    expect(rotuloStatus(null)).toBe('Desconhecido');
  });
});

describe('estadoAcesso (decisão única do fluxo)', () => {
  it('aguarda enquanto a sessão ainda carrega — nunca decide cedo', () => {
    expect(estadoAcesso({ authLoading: true, user: null })).toBe('aguardar');
    expect(estadoAcesso({ authLoading: true, user: null, acesso: null })).toBe('aguardar');
  });

  it('sem sessão vai para o login', () => {
    expect(estadoAcesso({ authLoading: false, user: null })).toBe('login');
  });

  it('aguarda o registro de acesso chegar (sessão ok, consulta em curso)', () => {
    expect(
      estadoAcesso({ authLoading: false, user: { id: 'u1' }, carregando: true })
    ).toBe('aguardar');
    expect(
      estadoAcesso({ authLoading: false, user: { id: 'u1' }, carregando: false, acesso: null })
    ).toBe('pending');
  });

  it('erro na consulta de permissões é falha fechada', () => {
    expect(
      estadoAcesso({ authLoading: false, user: { id: 'u1' }, carregando: false, erro: 'boom' })
    ).toBe('erro');
  });

  it('devolve o status quando o registro existe', () => {
    const base = { authLoading: false, user: { id: 'u1' }, carregando: false };
    expect(estadoAcesso({ ...base, acesso: { status: 'approved' } })).toBe('approved');
    expect(estadoAcesso({ ...base, acesso: { status: 'pending' } })).toBe('pending');
    expect(estadoAcesso({ ...base, acesso: { status: 'blocked' } })).toBe('blocked');
  });
});

describe('estadoAdmin (regressão do painel /admin)', () => {
  it('administrador não é redirecionado antes da sessão/carregamento resolver', () => {
    // cenário da correção: sessão ainda carregando, sem acesso na mão
    expect(
      estadoAdmin({ authLoading: true, user: null, acesso: null, carregando: true })
    ).toBe('aguardar');
    expect(
      estadoAdmin({ authLoading: false, user: { id: 'u1' }, carregando: true, acesso: null })
    ).toBe('aguardar');
  });

  it('administrador aprovado entra', () => {
    expect(
      estadoAdmin({
        authLoading: false,
        user: { id: 'u1' },
        carregando: false,
        acesso: { status: 'approved', is_admin: true },
      })
    ).toBe('admin');
  });

  it('conta comum aprovada é negada', () => {
    expect(
      estadoAdmin({
        authLoading: false,
        user: { id: 'u1' },
        carregando: false,
        acesso: { status: 'approved', is_admin: false },
      })
    ).toBe('negar');
  });

  it('pendente e bloqueado não administram', () => {
    const base = { authLoading: false, user: { id: 'u1' }, carregando: false };
    expect(estadoAdmin({ ...base, acesso: { status: 'pending', is_admin: true } })).toBe('pending');
    expect(estadoAdmin({ ...base, acesso: { status: 'blocked', is_admin: true } })).toBe('blocked');
  });

  it('erro de consulta bloqueia o painel', () => {
    expect(
      estadoAdmin({ authLoading: false, user: { id: 'u1' }, carregando: false, erro: 'x' })
    ).toBe('erro');
  });
});

describe('estadoRota (RotaProtegida)', () => {
  const caminho = '/simulados';

  it('verificando sessão aguarda (não redireciona para login)', () => {
    expect(estadoRota({ verificando: true, user: null, caminho })).toBe('aguardar');
  });

  it('sem sessão vai para o login', () => {
    expect(estadoRota({ verificando: false, user: null, caminho })).toBe('login');
  });

  it('falha na consulta de permissões fecha o acesso', () => {
    expect(
      estadoRota({ verificando: false, user: { id: 'u1' }, erro: 'boom', caminho })
    ).toBe('erro');
    // registro ausente também é tratado como erro (falha fechada)
    expect(
      estadoRota({ verificando: false, user: { id: 'u1' }, acesso: null, carregando: false, caminho })
    ).toBe('erro');
  });

  it('bloqueado não passa, mesmo em rota permitida', () => {
    expect(
      estadoRota({
        verificando: false,
        user: { id: 'u1' },
        acesso: { status: 'blocked' },
        carregando: false,
        caminho: '/escolher-apelido',
        permitidas: ['/escolher-apelido'],
      })
    ).toBe('bloqueado');
  });

  it('pendente só acessa as rotas permitidas', () => {
    const acesso = { status: 'pending' };
    expect(
      estadoRota({
        verificando: false, user: { id: 'u1' }, acesso, carregando: false,
        caminho, permitidas: ['/escolher-apelido', '/aguardando-aprovacao'],
      })
    ).toBe('pendente');
    expect(
      estadoRota({
        verificando: false, user: { id: 'u1' }, acesso, carregando: false,
        caminho: '/aguardando-aprovacao', permitidas: ['/escolher-apelido', '/aguardando-aprovacao'],
      })
    ).toBe('ok');
  });

  it('aprovado passa em qualquer rota', () => {
    expect(
      estadoRota({
        verificando: false,
        user: { id: 'u1' },
        acesso: { status: 'approved' },
        carregando: false,
        caminho,
      })
    ).toBe('ok');
  });
});

describe('proximoPassoCadastro (Supabase com/sem sessão)', () => {
  it('com sessão vai direto para a aprovação', () => {
    expect(proximoPassoCadastro(true)).toBe('/aguardando-aprovacao');
  });

  it('sem sessão pede confirmação de e-mail (navegação não acontece)', () => {
    expect(proximoPassoCadastro(false)).toBe('confirmar-email');
    expect(proximoPassoCadastro(undefined)).toBe('confirmar-email');
  });
});
