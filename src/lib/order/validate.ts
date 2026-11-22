import type { MarketConfig } from '../../config/countries';
import { normalizePhone } from '../phone';
import { orderMessages } from './messages';

export interface OrderFormFields {
  firstName: string;
  lastName: string;
  phone: string;
  packageId?: string;
  consent?: boolean;
}

export interface ValidatedFields {
  firstName: string;
  lastName: string;
  phoneE164: string;
  phoneNational: string;
  packageId: string;
}

// slova (uključujući č ć š ž đ i druga latinična/ćirilična), razmak, crtica, apostrof, tačka
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .\-]{0,59}$/u;

export function cleanName(v: unknown): string {
  return String(v ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateOrderFields(
  input: Partial<OrderFormFields>,
  opts: {
    market: Pick<MarketConfig, 'phone'>;
    packageIds: string[];
    requireConsent: boolean;
  },
): { ok: true; value: ValidatedFields } | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  if (!firstName) errors.firstName = orderMessages.required_firstName;
  else if (!NAME_RE.test(firstName)) errors.firstName = orderMessages.invalid_name;
  if (!lastName) errors.lastName = orderMessages.required_lastName;
  else if (!NAME_RE.test(lastName)) errors.lastName = orderMessages.invalid_name;

  const phone = normalizePhone(input.phone, opts.market);
  if (!phone.ok) errors.phone = orderMessages[`phone_${phone.error}`];

  let packageId = String(input.packageId ?? '').trim();
  if (!packageId && opts.packageIds.length === 1) packageId = opts.packageIds[0];
  if (!opts.packageIds.includes(packageId)) errors.packageId = orderMessages.package_invalid;

  if (opts.requireConsent && input.consent !== true) errors.consent = orderMessages.consent_required;

  if (Object.keys(errors).length > 0 || !phone.ok) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: { firstName, lastName, phoneE164: phone.e164, phoneNational: phone.national, packageId },
  };
}
