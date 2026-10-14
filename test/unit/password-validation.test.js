/**
 * Tests password strength rules, including the bcrypt 72-byte ceiling.
 */
const AuthService = require('../../src/services/auth-service');

describe('AuthService.validatePassword', () => {
  test('accepts a password meeting every rule', () => {
    expect(AuthService.validatePassword('Correct-Horse-9').valid).toBe(true);
  });

  test('accepts exactly 72 bytes', () => {
    expect(AuthService.validatePassword('Aa1!' + 'x'.repeat(68)).valid).toBe(true);
  });

  test('rejects more than 72 bytes, which bcrypt would silently truncate', () => {
    const result = AuthService.validatePassword('Aa1!' + 'x'.repeat(69));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at most 72 bytes long');
  });

  test('counts bytes, not characters', () => {
    // 39 characters, but each "é" is two bytes in UTF-8: 74 bytes in total
    expect(AuthService.validatePassword('Aa1!' + 'é'.repeat(35)).valid).toBe(false);
  });

  test('lists every failed rule', () => {
    expect(AuthService.validatePassword('short').errors).toHaveLength(4);
  });
});
