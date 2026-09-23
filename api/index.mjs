import worker from '../riskpulse/dist/server/index.mjs';

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    }

    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      body = Buffer.concat(buffers);
    }

    const webReq = new Request(url, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined
    });

    const webRes = await worker.fetch(webReq);

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Server Error: ' + err.message);
  }
}
