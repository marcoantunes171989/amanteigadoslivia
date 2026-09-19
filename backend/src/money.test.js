import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminError } from './admin-errors.js';
import { formatCentavosToReais, parseReaisToCentavos, slugFromName } from './money.js';

test('converts Brazilian reais strings to integer centavos', () => {
  assert.equal(parseReaisToCentavos('24,90'), 2490);
  assert.equal(parseReaisToCentavos('24.90'), 2490);
  assert.equal(parseReaisToCentavos('24'), 2400);
  assert.equal(parseReaisToCentavos('R$ 24,90'), 2490);
  assert.equal(parseReaisToCentavos('1.234,56'), 123456);
  assert.equal(parseReaisToCentavos('1,234.56'), 123456);
});

test('does not use floating-point multiplication for money', () => {
  assert.equal(parseReaisToCentavos('19,99'), 1999);
  assert.equal(parseReaisToCentavos('0,01'), 1);
  assert.notEqual(parseReaisToCentavos('19,99'), Math.trunc(19.99 * 100));
});

test('rejects empty, zero and invalid prices', () => {
  assert.equal(parseReaisToCentavos(''), null);
  assert.equal(parseReaisToCentavos(null), null);
  assert.throws(() => parseReaisToCentavos('0'), AdminError);
  assert.throws(() => parseReaisToCentavos('abc'), AdminError);
  assert.throws(() => parseReaisToCentavos('-10,00'), AdminError);
});

test('formats centavos back to Brazilian reais input', () => {
  assert.equal(formatCentavosToReais(2490), '24,90');
  assert.equal(formatCentavosToReais(1999), '19,99');
  assert.equal(formatCentavosToReais(100), '1,00');
});

test('generates slugs from Portuguese names', () => {
  assert.equal(slugFromName('TESTE HOMOLOG ADMIN'), 'teste-homolog-admin');
  assert.equal(slugFromName('Clássicos'), 'classicos');
});
