const OWNER_EMAILS = ['bhuvanjakkula@gmail.com', 'bhuvajakkula@gmail.com'];

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    if (pathname === '/api/auth/me') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        user: {
          id: 'owner',
          email: 'bhuvanjakkula@gmail.com',
          plan: 'enterprise',
          localOwner: true
        }
      }));
      return;
    }

    if (pathname === '/api/auth/signin' || pathname === '/api/auth/signup') {
      let body = {};
      if (req.method === 'POST') {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        try {
          body = JSON.parse(Buffer.concat(buffers).toString() || '{}');
        } catch {}
      }
      const email = (body.email || 'bhuvanjakkula@gmail.com').trim().toLowerCase();
      const isOwner = OWNER_EMAILS.includes(email);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', `riskpulse_session=${Date.now()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      res.end(JSON.stringify({
        user: {
          id: isOwner ? 'owner' : 'user_' + Date.now(),
          email: email,
          plan: isOwner ? 'enterprise' : 'pending',
          localOwner: isOwner
        }
      }));
      return;
    }

    if (pathname === '/api/auth/signout') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'riskpulse_session=; Path=/; HttpOnly; Max-Age=0');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/api/plan') {
      let body = {};
      if (req.method === 'POST') {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        try {
          body = JSON.parse(Buffer.concat(buffers).toString() || '{}');
        } catch {}
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ plan: body.plan || 'professional', subscriptionActive: true }));
      return;
    }

    if (pathname === '/api/status') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        bloomberg: { available: false, state: 'Desktop BLPAPI not connected' },
        lseg: { available: false, state: 'LSEG Data Library not connected' },
        timestamp: new Date().toISOString()
      }));
      return;
    }

    if (pathname === '/api/workspace') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        accounts: [{
          id: 'primary-trading',
          name: 'Primary Trading Account',
          cash: 100000000,
          limitPct: 20,
          holdings: {},
          trades: [],
          fees: 0,
          realized: 0,
          guard: { enabled: true, paused: false, maxAge: 60, duplicate: 0, withdrawal: 0, cancelRate: 0, maxCancelRate: 50, shockPct: 15 }
        }],
        portfolios: [],
        message: 'Cloud workspace ready'
      }));
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}
