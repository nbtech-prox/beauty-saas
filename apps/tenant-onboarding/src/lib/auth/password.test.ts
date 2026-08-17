/**
 * Testes do módulo de password.
 *
 * Cobre:
 *  - hashPassword é determinístico por input+mas com salts distintos
 *    → o mesmo input produz hashes diferentes em chamadas separadas
 *  - verifyPassword aceita hashes do mesmo input
 *  - verifyPassword rejeita passwords errados
 *  - passwordIsStrongEnough avalia os critérios:
 *    - min 12 chars
 *    - pelo menos 1 minúscula, 1 maiúscula, 1 dígito, 1 símbolo
 */
import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  passwordIsStrongEnough,
  verifyPassword,
} from './password';

describe('password module', () => {
  describe('hashPassword + verifyPassword', () => {
    it('produz hash com formato pbkdf2$iter$salt$digest', async () => {
      const hash = await hashPassword('CorrectHorseBattery!');
      const parts = hash.split('$');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('pbkdf2');
      expect(Number(parts[1])).toBeGreaterThan(0);
      expect(parts[2]!.length).toBeGreaterThan(0);
      expect(parts[3]!.length).toBeGreaterThan(0);
    });

    it('o mesmo input produz hashes diferentes (salt aleatório)', async () => {
      const a = await hashPassword('CorrectHorseBattery!');
      const b = await hashPassword('CorrectHorseBattery!');
      expect(a).not.toBe(b);
    });

    it('verifyPassword aceita o input correcto', async () => {
      const hash = await hashPassword('CorrectHorseBattery!');
      expect(await verifyPassword('CorrectHorseBattery!', hash)).toBe(true);
    });

    it('verifyPassword rejeita o input errado', async () => {
      const hash = await hashPassword('CorrectHorseBattery!');
      expect(await verifyPassword('WrongPassword12!', hash)).toBe(false);
    });

    it('verifyPassword rejeita hash mal-formado sem crash', async () => {
      expect(await verifyPassword('CorrectHorseBattery!', 'not-a-hash')).toBe(
        false,
      );
      expect(await verifyPassword('CorrectHorseBattery!', 'pbkdf2$bad')).toBe(
        false,
      );
      expect(
        await verifyPassword('CorrectHorseBattery!', 'pbkdf2$100000$short$xx'),
      ).toBe(false);
    });
  });

  describe('passwordIsStrongEnough', () => {
    it('aceita password que cumpre todos os critérios', () => {
      expect(passwordIsStrongEnough('Aa1!strongpass')).toBe(true);
      expect(passwordIsStrongEnough('MyP@ssw0rd123')).toBe(true);
    });

    it('rejeita passwords demasiado curtos (< 12 chars)', () => {
      expect(passwordIsStrongEnough('Aa1!short')).toBe(false); // 9 chars
      expect(passwordIsStrongEnough('Aa1!11chars')).toBe(false); // 11 chars
    });

    it('rejeita password sem minúscula', () => {
      expect(passwordIsStrongEnough('AA1!STRONGPASS')).toBe(false);
    });

    it('rejeita password sem maiúscula', () => {
      expect(passwordIsStrongEnough('aa1!strongpass')).toBe(false);
    });

    it('rejeita password sem dígito', () => {
      expect(passwordIsStrongEnough('AaA!strongpass')).toBe(false);
    });

    it('rejeita password sem símbolo (!@#$%^&*-_+=)', () => {
      expect(passwordIsStrongEnough('Aa1strongpass')).toBe(false);
      expect(passwordIsStrongEnough('Aa1strongpass.')).toBe(false);
      expect(passwordIsStrongEnough('Aa1strongpassá')).toBe(false);
    });

    it('aceita cada um dos símbolos do whitelist', () => {
      for (const sym of [
        '!',
        '@',
        '#',
        '$',
        '%',
        '^',
        '&',
        '*',
        '-',
        '_',
        '+',
        '=',
      ]) {
        expect(passwordIsStrongEnough(`Aa1strongpass${sym}`)).toBe(true);
      }
    });
  });
});
