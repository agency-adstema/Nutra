import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/lib/phone';
import { markets } from '../src/config/countries';
import { validateOrderFields } from '../src/lib/order/validate';

const RS = markets.RS;

describe('normalizePhone (Srbija)', () => {
  it.each([
    ['060 123 45 67', '+381601234567'],
    ['0601234567', '+381601234567'],
    ['060/123-4567', '+381601234567'],
    ['+381 60 123 4567', '+381601234567'],
    ['+381 060 123 4567', '+381601234567'],
    ['00381601234567', '+381601234567'],
    ['381601234567', '+381601234567'],
    ['064 123 456', '+38164123456'],
    ['011 123 4567', '+381111234567'],
    ['(021) 456-789', '+38121456789'],
  ])('%s → %s', (input, expected) => {
    const r = normalizePhone(input, RS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'invalid_chars'],
    ['060 12a 45', 'invalid_chars'],
    ['+43 660 1234567', 'wrong_country'],
    ['+387 61 123 456', 'wrong_country'],
    ['060 12', 'invalid_length'],
    ['060 1234 56789 1', 'invalid_length'],
    ['0901234567', 'invalid'],
  ])('odbija %j (%s)', (input, error) => {
    const r = normalizePhone(input, RS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it('dužina lokalnog broja (sa nulom) je 8–10 cifara', () => {
    const r = normalizePhone('060 123 45 67', RS);
    expect(r.ok && r.national.length).toBe(10);
  });
});

describe('validateOrderFields', () => {
  const opts = { market: RS, packageIds: ['1-komad', '2-komada'], requireConsent: true };

  it('prihvata ispravan unos i normalizuje telefon', () => {
    const r = validateOrderFields({ firstName: ' Marko ', lastName: 'Marković', phone: '060 123 45 67', packageId: '2-komada', consent: true }, opts);
    expect(r).toEqual({
      ok: true,
      value: { firstName: 'Marko', lastName: 'Marković', phoneE164: '+381601234567', phoneNational: '0601234567', packageId: '2-komada' },
    });
  });

  it('prihvata dijakritike, crticu i apostrof u imenu', () => {
    const r = validateOrderFields({ firstName: 'Đorđe-Ćiril', lastName: "O'Šćepanović", phone: '0641234567', packageId: '1-komad', consent: true }, opts);
    expect(r.ok).toBe(true);
  });

  it('vraća greške po polju', () => {
    const r = validateOrderFields({ firstName: '', lastName: '123', phone: '12', packageId: 'x', consent: false }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['consent', 'firstName', 'lastName', 'packageId', 'phone']);
  });

  it('jedno pakovanje se bira automatski', () => {
    const r = validateOrderFields({ firstName: 'Ana', lastName: 'Anić', phone: '0601234567', consent: true }, { ...opts, packageIds: ['1-komad'] });
    expect(r.ok && r.value.packageId).toBe('1-komad');
  });
});


describe('Order form phone formats for BA and HR', () => {
  it('normalizuje hrvatski mobilni telefon', () => {
    const number = normalizePhone('091 234 5678', markets.HR);
    expect(number).toMatchObject({ ok: true, e164: '+385912345678' });
  });
  it('normalizuje bosanski mobilni telefon', () => {
    const number = normalizePhone('061 123 456', markets.BA);
    expect(number).toMatchObject({ ok: true, e164: '+38761123456' });
  });
  it('odbija pogrešan GEO telefona u hrvatskoj formi', () => {
    const result = normalizePhone('+381 60 123 4567', markets.HR);
    expect(result).toMatchObject({ ok: false, error: 'wrong_country' });
  });
  it('prihvata lokalni hrvatski format u validaciji order forme', () => {
    const result = validateOrderFields(
      { firstName: 'Ana', lastName: 'Horvat', phone: '091 234 5678', consent: true },
      { market: markets.HR, packageIds: ['1-komad'], requireConsent: true },
    );
    expect(result).toMatchObject({
      ok: true,
      value: { phoneE164: '+385912345678', packageId: '1-komad' },
    });
  });
});
