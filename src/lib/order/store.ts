/**
 * Key-value skladište za rate limiting i zaštitu od duplih porudžbina.
 * - Bez podešavanja: memorija procesa (radi lokalno i na jednoj instanci).
 * - Za produkciju na serverless platformi: Upstash Redis (UPSTASH_REDIS_REST_URL + TOKEN),
 *   da bi limit važio za sve instance.
 * Ključevi su heširani — u skladištu nema telefona ni IP adresa u čistom obliku.
 */
export interface KvStore {
  setNX(key: string, value: string, ttlSec: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
}

export class MemoryStore implements KvStore {
  private map = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }
  private sweep() {
    if (this.map.size < 5000) return;
    const t = this.now();
    for (const [k, e] of this.map) if (e.exp <= t) this.map.delete(k);
  }
  async setNX(key: string, value: string, ttlSec: number) {
    if (this.live(key)) return false;
    this.sweep();
    this.map.set(key, { v: value, exp: this.now() + ttlSec * 1000 });
    return true;
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.map.set(key, { v: value, exp: this.now() + ttlSec * 1000 });
  }
  async del(key: string) {
    this.map.delete(key);
  }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.map.set(key, { v: String(n), exp: e?.exp ?? this.now() + ttlSec * 1000 });
    return n;
  }
}

export class UpstashStore implements KvStore {
  constructor(
    private url: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}
  private async cmd(args: (string | number)[]): Promise<any> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) throw new Error(`Upstash: ${json.error}`);
    return json.result;
  }
  async setNX(key: string, value: string, ttlSec: number) {
    return (await this.cmd(['SET', key, value, 'NX', 'EX', ttlSec])) === 'OK';
  }
  async get(key: string) {
    return ((await this.cmd(['GET', key])) as string | null) ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.cmd(['SET', key, value, 'EX', ttlSec]);
  }
  async del(key: string) {
    await this.cmd(['DEL', key]);
  }
  async incr(key: string, ttlSec: number) {
    const n = Number(await this.cmd(['INCR', key]));
    if (n === 1) await this.cmd(['EXPIRE', key, ttlSec]);
    return n;
  }
}

const g = globalThis as unknown as { __bkMemoryStore?: MemoryStore };

export function createStore(env: (k: string) => string | undefined, fetchImpl?: typeof fetch): KvStore {
  const url = env('UPSTASH_REDIS_REST_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN');
  if (url && token) return new UpstashStore(url, token, fetchImpl);
  g.__bkMemoryStore ??= new MemoryStore();
  return g.__bkMemoryStore;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
