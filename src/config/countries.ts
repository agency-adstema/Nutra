/**
 * Podešavanja po tržištu (GEO). Prva verzija: Srbija.
 * BA / HR / ME / XK imaju GEO podešavanja. Aktivacija poručivanja je zasebna.
 *
 * phone.nsnPattern = "national significant number" (broj BEZ vodeće nule i BEZ pozivnog broja).
 */
export type MarketCode = 'RS' | 'BA' | 'HR' | 'ME' | 'XK';

export interface CrmConfig {
  /** 'monadlead' (implementirano) ili 'webhook' (generički JSON POST ka sopstvenom CRM-u/call centru) */
  provider: 'monadlead' | 'webhook';
  /** Ime env varijable sa API ključem za ovo tržište (fallback: MONADLEAD_API_KEY) */
  apiKeyEnv: string;
  /** Format telefona koji šaljemo u CRM */
  phoneFormat: 'e164' | 'e164_no_plus' | 'national';
}

export interface MarketConfig {
  code: MarketCode;
  name: string;
  active: boolean;
  locale: string;
  currency: string;
  currencyLabel: string;
  phone: {
    dialCode: string;
    nsnPattern: string;
    example: string;
  };
  crm: CrmConfig;
}

export const markets: Record<MarketCode, MarketConfig> = {
  RS: {
    code: 'RS',
    name: 'Srbija',
    active: true,
    locale: 'sr-Latn-RS',
    currency: 'RSD',
    currencyLabel: 'RSD',
    phone: {
      dialCode: '381',
      // mobilni 6x (8–9 cifara) i fiksni 1x–3x (8–9 cifara)
      nsnPattern: '^(?:6\\d{7,8}|[1-3]\\d{7,8})$',
      example: '060 123 45 67',
    },
    crm: { provider: 'monadlead', apiKeyEnv: 'MONADLEAD_API_KEY_RS', phoneFormat: 'national' },
  },
  BA: {
    code: 'BA',
    name: 'Bosna i Hercegovina',
    active: false,
    locale: 'bs-BA',
    currency: 'BAM',
    currencyLabel: 'KM',
    phone: { dialCode: '387', nsnPattern: '^(?:6\\d{7,8}|[3-5]\\d{7})$', example: '061 123 456' },
    crm: { provider: 'monadlead', apiKeyEnv: 'MONADLEAD_API_KEY_BA', phoneFormat: 'national' },
  },
  HR: {
    code: 'HR',
    name: 'Hrvatska',
    active: false,
    locale: 'hr-HR',
    currency: 'EUR',
    currencyLabel: '€',
    phone: { dialCode: '385', nsnPattern: '^(?:9\\d{7,8})$', example: '091 234 5678' },
    crm: { provider: 'monadlead', apiKeyEnv: 'MONADLEAD_API_KEY_HR', phoneFormat: 'national' },
  },
  ME: {
    code: 'ME',
    name: 'Crna Gora',
    active: false,
    locale: 'sr-Latn-ME',
    currency: 'EUR',
    currencyLabel: '€',
    phone: { dialCode: '382', nsnPattern: '^(?:6\\d{7}|[2-5]\\d{7})$', example: '067 123 456' },
    crm: { provider: 'monadlead', apiKeyEnv: 'MONADLEAD_API_KEY_ME', phoneFormat: 'national' },
  },
  XK: {
    code: 'XK',
    name: 'Kosovo',
    active: false,
    locale: 'sq-XK',
    currency: 'EUR',
    currencyLabel: '€',
    phone: { dialCode: '383', nsnPattern: '^(?:4\\d{7}|[2-3]\\d{7})$', example: '044 123 456' },
    crm: { provider: 'monadlead', apiKeyEnv: 'MONADLEAD_API_KEY_XK', phoneFormat: 'national' },
  },
};

export function getMarket(code: string | undefined): MarketConfig {
  return markets[(code as MarketCode) ?? 'RS'] ?? markets.RS;
}
