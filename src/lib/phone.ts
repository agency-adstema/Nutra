import type { MarketConfig } from '../config/countries';

export type PhoneError = 'empty' | 'invalid_chars' | 'wrong_country' | 'invalid_length' | 'invalid';

export type PhoneResult =
  | { ok: true; e164: string; nsn: string; national: string }
  | { ok: false; error: PhoneError };

type PhoneMarket = Pick<MarketConfig, 'phone'>;

/**
 * Validira i normalizuje broj telefona za dato tržište.
 * Prihvata: "060 123 45 67", "060/123-4567", "+381 60 1234567", "00381601234567", "381601234567".
 * Vraća E.164 (+381601234567) koji se šalje u CRM.
 */
export function normalizePhone(raw: string | null | undefined, market: PhoneMarket): PhoneResult {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'empty' };
  if (input.length > 30 || !/^[+\d\s().\-/]+$/.test(input)) return { ok: false, error: 'invalid_chars' };

  const compact = input.replace(/[^\d+]/g, '');
  if (compact.lastIndexOf('+') > 0) return { ok: false, error: 'invalid_chars' };

  const dial = market.phone.dialCode;
  let nsn: string;

  if (compact.startsWith('+') || compact.startsWith('00')) {
    const international = compact.startsWith('+') ? compact.slice(1) : compact.slice(2);
    if (!international.startsWith(dial)) return { ok: false, error: 'wrong_country' };
    nsn = international.slice(dial.length);
  } else if (compact.startsWith(dial) && compact.length >= dial.length + 8) {
    nsn = compact.slice(dial.length);
  } else if (compact.startsWith('0')) {
    nsn = compact.slice(1);
  } else {
    nsn = compact;
  }

  // Česta greška: "+381 060 ..." — uklanjamo vodeću nulu posle pozivnog broja
  if (nsn.startsWith('0')) nsn = nsn.slice(1);

  if (!/^\d+$/.test(nsn)) return { ok: false, error: 'invalid' };
  if (nsn.length < 7 || nsn.length > 10) return { ok: false, error: 'invalid_length' };
  if (!new RegExp(market.phone.nsnPattern).test(nsn)) return { ok: false, error: 'invalid' };

  return { ok: true, e164: `+${dial}${nsn}`, nsn, national: `0${nsn}` };
}

export function formatPhoneForCrm(
  result: Extract<PhoneResult, { ok: true }>,
  format: 'e164' | 'e164_no_plus' | 'national',
): string {
  if (format === 'national') return result.national;
  if (format === 'e164_no_plus') return result.e164.slice(1);
  return result.e164;
}
