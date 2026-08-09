import { describe, expect, it } from 'vitest';
import { ApiError, InvalidJsonError, NetworkError, ValidationError } from './errors.js';

describe('errors', () => {
  describe('ValidationError', () => {
    it('expõe schema, issues e message', () => {
      const issues = [
        { path: 'name', message: 'required' },
        { path: 'address.city', message: 'invalid' },
      ];
      const err = new ValidationError('User', issues, 'msg custom');

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.name).toBe('ValidationError');
      expect(err.schema).toBe('User');
      expect(err.issues).toEqual(issues);
      expect(err.message).toBe('msg custom');
    });

    it('gera message por defeito quando não fornecida', () => {
      const err = new ValidationError('Service', [
        { path: 'price', message: 'must be number' },
        { path: 'name', message: 'required' },
      ]);
      expect(err.message).toContain('Service');
      expect(err.message).toContain('2 issue(s)');
    });

    it('issues é readonly', () => {
      const err = new ValidationError('X', [{ path: 'a', message: 'b' }]);
      // @ts-expect-error — readonly em runtime pode ser mutado mas a tipagem protege
      err.issues.push({ path: 'c', message: 'd' });
      // Confirmar que o push em runtime não causa erro (a defesa é em compile-time)
      expect(err.issues.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ApiError', () => {
    it('expõe status, url, method, body e message', () => {
      const err = new ApiError(422, 'https://api/x', 'POST', {
        message: 'Validation failed',
        errors: { email: ['invalid'] },
      });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.name).toBe('ApiError');
      expect(err.status).toBe(422);
      expect(err.url).toBe('https://api/x');
      expect(err.method).toBe('POST');
      expect(err.body).toEqual({
        message: 'Validation failed',
        errors: { email: ['invalid'] },
      });
    });

    it('message inclui body.message quando existe', () => {
      const err = new ApiError(401, 'https://api/auth/login', 'POST', {
        message: 'Credenciais inválidas',
      });
      expect(err.message).toContain('POST https://api/auth/login');
      expect(err.message).toContain('401');
      expect(err.message).toContain('Credenciais inválidas');
    });

    it('message omite body quando body é null ou não tem message', () => {
      const errNull = new ApiError(500, 'https://api/x', 'GET', null);
      expect(errNull.message).not.toContain(': null');

      const errNoMsg = new ApiError(500, 'https://api/x', 'GET', { foo: 'bar' });
      expect(errNoMsg.message).toContain('500');
      expect(errNoMsg.message).not.toContain('foo');
    });

    it('aceita message customizada que sobrepõe a gerada', () => {
      const err = new ApiError(500, 'https://api/x', 'GET', { message: 'auto' }, 'custom');
      expect(err.message).toBe('custom');
    });
  });

  describe('NetworkError', () => {
    it('preserva cause e gera message do cause', () => {
      const cause = new TypeError('fetch failed');
      const err = new NetworkError(cause);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(NetworkError);
      expect(err.name).toBe('NetworkError');
      expect(err.cause).toBe(cause);
      expect(err.message).toBe('fetch failed');
    });

    it('aceita message customizada', () => {
      const err = new NetworkError(new Error('whatever'), 'Timeout em GET /x');
      expect(err.message).toBe('Timeout em GET /x');
    });

    it('lida com cause não-Erro', () => {
      const err = new NetworkError('string cause');
      expect(err.message).toBe('Falha de rede');
    });
  });

  describe('InvalidJsonError', () => {
    it('usa message por defeito', () => {
      const err = new InvalidJsonError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(InvalidJsonError);
      expect(err.name).toBe('InvalidJsonError');
      expect(err.message).toBe('Resposta não é JSON válido');
    });

    it('aceita message customizada', () => {
      const err = new InvalidJsonError('parse falhou em /v1/x');
      expect(err.message).toBe('parse falhou em /v1/x');
    });
  });
});
