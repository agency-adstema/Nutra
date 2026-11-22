/**
 * Lokalni lažni MonadLead server — SAMO za testiranje (ništa se ne šalje van računara).
 *  - telefon koji se završava na 0000000 → 400 (neispravno polje)
 *  - ime koje sadrži "Server" → 500
 *  - ostalo → 200 { order_id, click_id }
 * GET /__orders vraća primljene porudžbine (bez api_key).
 * Upotreba: node scripts/mock-monadlead.mjs [port]
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] || process.env.MOCK_PORT || 4545);
const orders = [];

export function startMock(p = port) {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/__orders') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(orders));
    }
    if (req.url !== '/api/v1/orders/create/') {
      res.writeHead(404);
      return res.end();
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end('{"detail":"Method not allowed"}');
    }
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      res.writeHead(406);
      return res.end('{"detail":"Not acceptable"}');
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        return res.end('{"detail":"Invalid JSON"}');
      }
      const missing = ['api_key', 'name', 'phone', 'offer_id', 'country_code'].filter((k) => !body[k]);
      if (missing.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(Object.fromEntries(missing.map((k) => [k, ['This field is required.']]))));
      }
      if (/0000000$/.test(body.phone)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end('{"phone":["Invalid phone number."]}');
      }
      if (/Server/.test(body.name)) {
        res.writeHead(500);
        return res.end('Internal Server Error');
      }
      const { api_key, ...rest } = body;
      const order_id = 100000 + orders.length + 1;
      orders.push({ ...rest, order_id, api_key_received: !!api_key });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ order_id, click_id: `mock-click-${order_id}` }));
    });
  });
  return new Promise((resolve) => server.listen(p, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startMock();
  console.log(`Mock MonadLead: http://127.0.0.1:${port}/api/v1/orders/create/`);
}
