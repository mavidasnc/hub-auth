/**
 * Validatori fiscali del checkout (src/core/fiscal.ts): stessi vettori di hub
 * (tests/test_billing_fiscal.py), così i due lati non possono divergere.
 */
import { describe, expect, it } from 'vitest';
import {
  PROVINCES, cleanText, isValidEmail, isValidPersonTaxCode, isValidProvince, isValidSdi,
  isValidTaxCode, isValidVat, isValidZip, normalizeTaxCode, normalizeVat,
} from '../src/core/fiscal.js';

describe('partita IVA', () => {
  it.each(['12345678903', '01234567897', 'IT12345678903', 'it 12345678903', '123.456.789-03', ' 12345678903 '])(
    'valida: %s', (v) => expect(isValidVat(v)).toBe(true));

  it.each(['01234567890', '1234567890', '123456789012', '1234567890A', '', null, '00000000000'])(
    'non valida: %s', (v) => expect(isValidVat(v as string)).toBe(false));

  it('normalizza togliendo prefisso e separatori', () => {
    expect(normalizeVat(' it 123.456.789-03 ')).toBe('12345678903');
    expect(normalizeVat(null)).toBe('');
  });
});

describe('codice fiscale', () => {
  it('di persona, anche con minuscole e spazi', () => {
    expect(isValidTaxCode('RSSMRA85T10A562S')).toBe(true);
    expect(isValidTaxCode(' rssmra85t10a562s ')).toBe(true);
    expect(normalizeTaxCode(' rssmra 85t10-a562s')).toBe('RSSMRA85T10A562S');
  });

  it('controllo errato', () => {
    expect(isValidTaxCode('RSSMRA85T10A562X')).toBe(false);
  });

  it('omocodia', () => {
    expect(isValidTaxCode('RSSMRA85T10A56NH')).toBe(true);
    expect(isValidTaxCode('RSSMRA85T10A56NS')).toBe(false);
  });

  it('di società (11 cifre) vale per le aziende ma non è personale', () => {
    expect(isValidTaxCode('12345678903')).toBe(true);
    expect(isValidTaxCode('01234567890')).toBe(true);
    expect(isValidPersonTaxCode('12345678903')).toBe(false);
    expect(isValidPersonTaxCode('RSSMRA85T10A562S')).toBe(true);
  });

  it.each(['', null, 'ABC', 'RSSMRA85T10A562', '1234567890', 'RSSMRA85X10A562S'])('non valido: %s', (v) => {
    expect(isValidTaxCode(v as string)).toBe(false);
  });
});

describe('indirizzo, SDI, PEC', () => {
  it('CAP', () => {
    expect(isValidZip('20121')).toBe(true);
    expect(isValidZip(' 10100 ')).toBe(true);
    expect(['2012', '201211', 'ABCDE', '', null].some((v) => isValidZip(v as string))).toBe(false);
  });

  it('province: 107 sigle', () => {
    expect(PROVINCES).toHaveLength(107);
    expect(['MI', 'mi', 'SU', 'AO', 'BT', ' RM '].every((s) => isValidProvince(s))).toBe(true);
    expect(['XX', 'M', 'MIL', '', null].some((s) => isValidProvince(s as string))).toBe(false);
  });

  it('SDI e PEC', () => {
    expect(['0000000', 'ABC1234', 'abc1234'].every((c) => isValidSdi(c))).toBe(true);
    expect(['000000', '00000000', 'AB-1234', ''].some((c) => isValidSdi(c))).toBe(false);
    expect(isValidEmail('azienda@pec.it')).toBe(true);
    expect(isValidEmail('azienda@pec')).toBe(false);
    expect(isValidEmail('azienda pec.it')).toBe(false);
  });

  it('cleanText toglie gli spazi doppi', () => {
    expect(cleanText('  Via   Roma  1 ')).toBe('Via Roma 1');
    expect(cleanText(null)).toBe('');
  });
});
