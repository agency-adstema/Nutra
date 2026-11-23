/** Čiste pomoćne funkcije (bez Astro zavisnosti) — testirane u tests/ */

export function formatPrice(value: number, currencyLabel = 'RSD'): string {
  const n = Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n} ${currencyLabel}`;
}

/** 23.11.2026 */
export function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ThemeInput {
  themePrimary?: string;
  themeSecondary?: string;
  themeBackground?: string;
  themeAccent?: string;
}

/** CSS promenljive teme proizvoda (validirane šemom kao #RRGGBB) */
export function themeStyle(t: ThemeInput): string {
  const vars: string[] = [];
  if (t.themePrimary) vars.push(`--c-primary:${t.themePrimary}`);
  if (t.themeSecondary) vars.push(`--c-secondary:${t.themeSecondary}`);
  if (t.themeBackground) vars.push(`--c-bg:${t.themeBackground}`);
  if (t.themeAccent) vars.push(`--c-accent:${t.themeAccent}`);
  return vars.join(';');
}

/** WCAG kontrast između dve #RRGGBB boje */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export interface PriceablePackage {
  id: string;
  label: string;
  quantity: number;
  price?: number;
  default?: boolean;
}

export type PriceStatus = 'verified' | 'demo' | 'unknown';

/** Kupcu se prikazuje samo potvrđena cena; testne i nepoznate cene ostaju skrivene. */
export function priceView(status: PriceStatus, packages: PriceablePackage[]) {
  const priced = packages.filter((p) => typeof p.price === 'number');
  const show = status === 'verified' && priced.length > 0;
  const min = show ? Math.min(...priced.map((p) => p.price!)) : undefined;
  const max = show ? Math.max(...priced.map((p) => p.price!)) : undefined;
  return { show, isDemo: status === 'demo', isVerified: status === 'verified', min, max, priced };
}

/** Normalizacija za pretragu: bez dijakritika, đ → dj */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
