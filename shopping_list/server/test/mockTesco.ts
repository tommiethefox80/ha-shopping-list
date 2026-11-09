import { createServer, type Server } from 'node:http';

/**
 * A stand-in for tesco.com that mirrors the real page structure (Nov 2026):
 * li[data-testid] search tiles, "add 1 <name>" buttons, a "Sign out" header link,
 * basket updates via POST /bff, and a redirect to /account/auth/... when signed out.
 */
export const CATALOGUE: Record<string, { name: string; price: string; available: boolean; offer?: string }> = {
  '288089822': { name: 'Pampers Baby-Dry Size 6 Nappies 33 Pack', price: '£11.00', available: true, offer: '£5.50 Half Price Clubcard Price' },
  '333333333': { name: 'Fred & Flo Ultra Dry Nappies Size 6 30 Pack', price: '£2.85', available: true },
  '275205504': { name: 'Branston Baked Beans In Tomato Sauce 410G', price: '£1.50', available: true },
  '251825089': { name: 'Tesco Italian Chopped Tomatoes 400G', price: '£0.47', available: true },
  '254656399': { name: 'Tesco British Whole Milk 2.272L, 4 Pints', price: '£1.75', available: true },
  '111111111': { name: 'Tesco Houmous 200G', price: '£0.95', available: true },
  '222222222': { name: 'Tesco Reduced Fat Houmous 200G', price: '£0.95', available: true },
  '999999999': { name: 'Tesco Green Beans 220G', price: '£0.89', available: false },
};

export interface MockTesco {
  url: string;
  basket: Map<string, number>;
  signOutEveryone(): void;
  close(): Promise<void>;
}

const page = (title: string, signedIn: boolean, body: string) => `<!doctype html><html><head><title>${title} - Tesco Groceries</title>
<meta property="og:image" content="https://example.test/img.jpg"></head><body>
<header><a href="/groceries/en-GB/trolley">Basket</a> ${signedIn ? '<a href="/logout">Sign out</a>' : '<a href="/account/auth/en-GB/login">Sign in</a>'}</header>
<main>${body}</main></body></html>`;

const addButton = (id: string, name: string) => `<button aria-label="add 1 ${name}" onclick="
  fetch('/bff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'mutation UpdateBasket',items:[{id:'${id}',adjust:1}]})})
  .then(r=>{ if(r.status===401){ location.href='/account/auth/en-GB/login'; return; } document.getElementById('q${id}').textContent=Number(document.getElementById('q${id}').textContent||0)+1; })">Add</button>
  <span id="q${id}"></span>`;

export function startMockTesco(): Promise<MockTesco> {
  const basket = new Map<string, number>();
  let epoch = 1;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const signedIn = (req.headers.cookie ?? '').includes(`signed=${epoch}`);
    const html = (s: string) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(s);
    const p = url.pathname.replace('/shop/', '/groceries/');

    if (p === '/account/auth/en-GB/login' && req.method === 'GET') {
      // Two steps like Tesco: email -> Next -> password -> Sign in. Nothing focused on load.
      return html(page('Sign in', false, `<form method="post" id="f" onsubmit="if(!document.getElementById('pw')){event.preventDefault();
          const p=document.createElement('input');p.type='password';p.name='password';p.id='pw';this.appendChild(p);document.getElementById('b').textContent='Sign in';}">
        <label>Email address <input name="email" type="email" autocomplete="username"></label>
        <button id="b">Next</button></form>`));
    }
    if (p === '/account/auth/en-GB/login' && req.method === 'POST') {
      return res.writeHead(302, { location: '/groceries/en-GB/trolley', 'set-cookie': `signed=${epoch}; Path=/` }).end();
    }
    if (p === '/groceries/en-GB/trolley') {
      if (!signedIn) return res.writeHead(302, { location: '/account/auth/en-GB/login' }).end();
      return html(page('Basket', true, [...basket].map(([id, q]) => `<p>${q} ${CATALOGUE[id]?.name}</p>`).join('')));
    }
    if (p === '/groceries/en-GB/search') {
      const q = (url.searchParams.get('query') ?? '').toLowerCase();
      const words = q.split(/\s+/).filter((w) => w.length > 2 && !['and', 'size', 'pack', 'the'].includes(w));
      const tiles = Object.entries(CATALOGUE)
        .filter(([, v]) => words.some((w) => v.name.toLowerCase().includes(w)))
        .sort(([, a], [, b]) => words.filter((w) => b.name.toLowerCase().includes(w)).length - words.filter((w) => a.name.toLowerCase().includes(w)).length)
        .map(([id, v]) => `<li data-testid="${id}" data-auto-available="${v.available}"><img src="https://example.test/${id}.jpg">
          <a href="/shop/en-GB/products/${id}">${v.name}</a>${v.offer ? `<p>${v.offer}</p><p>Offer valid for delivery from 10/10/2026 until 01/12/2026</p>` : ''}<p>${v.price}</p>${v.available ? addButton(id, v.name) : '<p>Unavailable</p>'}</li>`)
        .join('');
      return html(page('Results', signedIn, tiles ? `<ul>${tiles}</ul>` : '<p>Sorry, no results found</p>'));
    }
    const m = p.match(/^\/groceries\/en-GB\/products\/(\d+)$/);
    if (m) {
      const prod = CATALOGUE[m[1]];
      if (!prod) return html(page('Page not found', signedIn, '<h1>Sorry, page not found</h1>'));
      return html(page(prod.name, signedIn, `<h1>${prod.name}</h1><p>${prod.price}</p>${prod.available ? addButton(m[1], prod.name) : '<p>This product is currently unavailable</p>'}`));
    }
    if (p === '/bff' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (!signedIn) return res.writeHead(401).end('{}');
        for (const it of JSON.parse(body).items ?? []) basket.set(it.id, (basket.get(it.id) ?? 0) + it.adjust);
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":{"basket":"ok"}}');
      });
      return;
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        basket,
        signOutEveryone: () => void epoch++,
        close: () => new Promise((r) => server.close(() => r())),
      });
    }),
  );
}
