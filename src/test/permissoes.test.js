import { describe, expect, it } from 'vitest';
import {
  podeAcessar,
  podeAdministrar,
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
