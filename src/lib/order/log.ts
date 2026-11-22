/**
 * Bezbedno logovanje: strukturisani JSON bez ličnih podataka.
 * Imena, telefoni i IP adrese se NE loguju; nizovi od 6+ cifara se maskiraju.
 */
export type LogLevel = 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, event: string, data?: Record<string, unknown>) => void;

const BLOCKED_KEYS = /^(name|first_?name|last_?name|phone|tel|user_ip|ip|email|api_key|apikey|token|secret)$/i;

export function scrub(text: string): string {
  return String(text ?? '')
    .replace(/\+?\d[\d\s\-()]{5,}\d/g, '[broj]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
}

export function redact(data: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (BLOCKED_KEYS.test(k)) continue;
    if (typeof v === 'string') out[k] = scrub(v).slice(0, 500);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = redact(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

export const consoleLogger: Logger = (level, event, data) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redact(data) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};
