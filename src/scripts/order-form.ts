/**
 * Forma za poručivanje: validacija, zaštita od duplog slanja, loading, poruke i GA4 događaji.
 * Lični podaci se NE čuvaju u browseru i NE šalju u analitiku.
 */
import { validateOrderFields } from '../lib/order/validate';
import { orderMessages, type OrderApiResponse } from '../lib/order/messages';
import { getAttribution } from './attribution';
import { track } from './analytics';

interface FormConfig {
  slug: string;
  name: string;
  category: string;
  currency: string;
  priceStatus: 'verified' | 'demo' | 'unknown';
  prices: Record<string, number | null>;
  packageIds: string[];
  phone: { dialCode: string; nsnPattern: string; example: string };
  requireConsent: boolean;
  endpoint: string;
  staticPreview: boolean;
}

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

const STATUS_STYLES: Record<string, string> = {
  success: 'border-brand/30 bg-white text-ink',
  test: 'border-warn/30 bg-warn-bg text-ink',
  info: 'border-sky-300 bg-sky-50 text-ink',
  error: 'border-danger/30 bg-danger-bg text-ink',
};
const ICON_COLORS: Record<string, string> = { success: 'text-brand', test: 'text-warn', info: 'text-sky-700', error: 'text-danger' };
const STATUS_ICONS: Record<string, string> = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  test: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
};

function initForm(form: HTMLFormElement) {
  const cfg = JSON.parse(form.dataset.config || '{}') as FormConfig;
  const startedAt = Date.now();
  let idempotencyKey = newKey();
  let submitting = false;
  let began = false;

  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const label = form.querySelector<HTMLElement>('[data-submit-label]')!;
  const iconIdle = form.querySelector<SVGElement>('[data-icon-idle]');
  const iconLoading = form.querySelector<SVGElement>('[data-icon-loading]');
  const statusBox = form.querySelector<HTMLElement>('[data-order-status]')!;

  const fieldEl = (name: string) => form.elements.namedItem(name) as HTMLInputElement | RadioNodeList | null;
  const priceTotal = form.querySelector<HTMLElement>('[data-order-total]');
  const formatSelectedPrice = (amount: number) => {
    const isRS = cfg.currency === 'RSD';
    const locale = isRS ? 'sr-RS' : cfg.currency === 'BAM' ? 'bs-BA' : 'hr-HR';
    const text = new Intl.NumberFormat(locale, {
      minimumFractionDigits: isRS ? 0 : 2,
      maximumFractionDigits: isRS ? 0 : 2,
    }).format(amount);
    return cfg.currency === 'RSD' ? `${text} RSD` : cfg.currency === 'BAM' ? `${text} KM` : `${text} €`;
  };
  const selectedPackagePrice = (): number | null => {
    const selected = form.querySelector<HTMLInputElement>('input[name="packageId"]:checked') ||
      form.querySelector<HTMLInputElement>('input[name="packageId"][type="hidden"]');
    const v = selected ? cfg.prices[selected.value] : null;
    return typeof v === 'number' ? v : null;
  };
  const resetButtonLabel = () => {
    const price = selectedPackagePrice();
    label.textContent = cfg.staticPreview ? 'Proveri formu'
      : price != null ? `NARUČI POUZEĆEM — ${formatSelectedPrice(price)}`
      : 'Pošalji porudžbinu';
    if (priceTotal) priceTotal.textContent = price != null ? formatSelectedPrice(price) : 'Cena nije navedena';
  };
  form.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name === 'packageId') resetButtonLabel();
  });
  resetButtonLabel();

  // Pozivni broj zemlje (+381 / +387 / +385) je unapred upisan; kupac kuca ostatak broja.
  const phonePrefix = `+${cfg.phone.dialCode} `;
  const phoneValue = () => {
    const v = (fieldEl('phone') as HTMLInputElement)?.value ?? '';
    return v.trim() === phonePrefix.trim() ? '' : v;
  };
  const phoneInput = fieldEl('phone') as HTMLInputElement | null;
  if (phoneInput) {
    if (!phoneInput.value) phoneInput.value = phonePrefix;
    // Broj se sam formatira dok se kuca: +381 61 293 8152 (grupe 2 · 3 · ostatak).
    const formatLocal = (digits: string) =>
      [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5)].filter(Boolean).join(' ');
    phoneInput.addEventListener('input', () => {
      const v = phoneInput.value;
      const dial = phonePrefix.trim(); // +381
      const dialDigits = dial.slice(1); // 381
      let digits = (v.startsWith(dial) ? v.slice(dial.length) : v).replace(/\D/g, '');
      // zalepljen ceo broj sa pozivnim brojem (+381…, 00381…, 381…) — pozivni broj se ne ponavlja
      if (digits.startsWith('00' + dialDigits)) digits = digits.slice(2 + dialDigits.length);
      else if (digits.startsWith(dialDigits) && digits.length >= dialDigits.length + 8) digits = digits.slice(dialDigits.length);
      digits = digits.replace(/^0+/, '').slice(0, 10); // „060…“ → „60…“
      const next = phonePrefix + formatLocal(digits);
      if (next === v) return;
      phoneInput.value = next;
      const end = next.length;
      phoneInput.setSelectionRange(end, end);
    });
    phoneInput.addEventListener('focus', () => {
      if (phoneInput.value.trim() === phonePrefix.trim()) {
        phoneInput.value = phonePrefix;
        requestAnimationFrame(() => phoneInput.setSelectionRange(phonePrefix.length, phonePrefix.length));
      }
    });
  }

  const read = () => {
    const pkg = fieldEl('packageId');
    return {
      firstName: (fieldEl('firstName') as HTMLInputElement)?.value ?? '',
      lastName: (fieldEl('lastName') as HTMLInputElement)?.value ?? '',
      phone: phoneValue(),
      packageId: pkg ? (pkg as HTMLInputElement).value : '',
      consent: (form.querySelector<HTMLInputElement>('input[name="consent"]')?.checked ?? false) as boolean,
      website: (fieldEl('website') as HTMLInputElement)?.value ?? '',
    };
  };

  const setError = (name: string, msg?: string) => {
    const errEl = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (errEl) {
      errEl.textContent = msg ?? '';
      errEl.hidden = !msg;
    }
    if (input && input.type !== 'radio' && input.type !== 'hidden') input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  const clearErrors = () => ['firstName', 'lastName', 'phone', 'packageId', 'consent'].forEach((n) => setError(n));

  const validate = () =>
    validateOrderFields(read(), { market: { phone: cfg.phone }, packageIds: cfg.packageIds, requireConsent: cfg.requireConsent });

  const showStatus = (kind: 'success' | 'test' | 'info' | 'error', message: string, extra?: string) => {
    statusBox.hidden = false;
    statusBox.className = `rounded-xl border px-4 py-3 text-[15px] ${STATUS_STYLES[kind]}`;
    statusBox.dataset.kind = kind;
    statusBox.innerHTML = `<div class="flex items-start gap-2.5"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0 ${ICON_COLORS[kind]}" aria-hidden="true">${STATUS_ICONS[kind]}</svg><div class="min-w-0 flex-1"><p class="font-medium" data-status-message></p>${extra ?? ''}</div></div>`;
    statusBox.querySelector('[data-status-message]')!.textContent = message;
  };

  const setLoading = (on: boolean) => {
    submitting = on;
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
    if (on) label.textContent = 'Šaljem porudžbinu…';
    else resetButtonLabel();
    iconIdle?.classList.toggle('hidden', on);
    iconLoading?.classList.toggle('hidden', !on);
  };

  // begin_checkout pri prvoj interakciji
  form.addEventListener('focusin', () => {
    if (began) return;
    began = true;
    track('begin_checkout', { currency: cfg.currency, items: [{ item_id: cfg.slug, item_name: cfg.name, item_category: cfg.category }] });
  });

  // validacija pri napuštanju polja
  form.addEventListener('focusout', (e) => {
    const name = (e.target as HTMLInputElement).name;
    if (!['firstName', 'lastName', 'phone'].includes(name)) return;
    const value = name === 'phone' ? phoneValue() : (e.target as HTMLInputElement).value;
    if (!value) return; // ne prikazujemo grešku za prazno polje dok korisnik ne pokuša slanje
    const r = validate();
    setError(name, r.ok ? undefined : r.fieldErrors[name]);
  });
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.getAttribute('aria-invalid') === 'true' || t.name === 'consent') setError(t.name);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return; // zaštita od duplog klika

    clearErrors();
    const r = validate();
    if (!r.ok) {
      Object.entries(r.fieldErrors).forEach(([k, v]) => setError(k, v));
      const first = Object.keys(r.fieldErrors)[0];
      form.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      showStatus('error', 'Proverite označena polja.');
      track('form_error', { error_type: 'validation', field: first, item_id: cfg.slug });
      return;
    }

    if (cfg.staticPreview) {
      showStatus('test', orderMessages.static_preview);
      return;
    }

    setLoading(true);
    statusBox.hidden = true;
    const data = read();
    const turnstileToken = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value;
    const body = {
      productSlug: cfg.slug,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      packageId: r.value.packageId,
      consent: data.consent,
      website: data.website,
      startedAt,
      idempotencyKey,
      turnstileToken,
      attribution: getAttribution(),
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    let res: Response | undefined;
    let json: OrderApiResponse | undefined;
    try {
      res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        credentials: 'same-origin',
      });
      json = (await res.json().catch(() => undefined)) as OrderApiResponse | undefined;
    } catch {
      json = undefined;
    } finally {
      clearTimeout(timer);
    }

    if (!json) {
      setLoading(false);
      showStatus('error', orderMessages.network_error);
      track('form_error', { error_type: 'network', item_id: cfg.slug });
      return;
    }

    switch (json.status) {
      case 'created': {
        const price = cfg.priceStatus === 'verified' ? cfg.prices[r.value.packageId] : null;
        track('generate_lead', {
          currency: cfg.currency,
          value: price ?? undefined,
          lead_source: 'order_form',
          item_id: cfg.slug,
          package_id: r.value.packageId,
          transaction_id: json.orderId,
        });
        idempotencyKey = newKey();
        setLoading(false);
        // Polja se sklanjaju i ostaje samo potvrda — nema ponovnog slanja istih podataka
        const fields = form.querySelector<HTMLElement>('[data-form-fields]');
        if (fields) fields.hidden = true;
        submitting = true; // forma je završena
        showStatus('success', json.message, '<p class="mt-1 text-sm text-muted">Plaćanje pouzećem. Držite telefon pri ruci — poziv može doći sa nepoznatog broja.</p>');
        statusBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      case 'test_mode': {
        const preview = json.preview
          ? `<details class="mt-2 text-sm"><summary class="cursor-pointer font-medium text-warn">Šta bi bilo poslato u CRM (bez API ključa)</summary><pre class="mt-2 max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs" data-preview></pre></details>`
          : '';
        showStatus('test', json.message, preview);
        const pre = statusBox.querySelector('[data-preview]');
        if (pre) pre.textContent = JSON.stringify(json.preview, null, 2);
        setLoading(false);
        return;
      }
      case 'duplicate':
        showStatus('info', json.message);
        setLoading(false);
        idempotencyKey = newKey();
        return;
      case 'in_progress':
        showStatus('info', json.message);
        setTimeout(() => setLoading(false), 3000);
        return;
      case 'invalid':
        Object.entries(json.fieldErrors ?? {}).forEach(([k, v]) => setError(k, v));
        showStatus('error', json.message);
        track('form_error', { error_type: json.code ?? 'validation_server', item_id: cfg.slug });
        setLoading(false);
        return;
      default:
        showStatus('error', json.message || orderMessages.server_error);
        track('form_error', { error_type: json.code ?? json.status, item_id: cfg.slug });
        setLoading(false);
    }
  });
}

export function initOrderForms(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-order-form]').forEach(initForm);
}
