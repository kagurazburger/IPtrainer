const CLOUD_STORAGE_URL = process.env.CLOUD_STORAGE_URL || 'https://kvdb.io/A8vjB6vN5n9z2z2z2z2z2z/';

function buildCloudUrl(syncKey) {
  const key = String(syncKey || '').trim().replace(/^\/+|\/+$/g, '');
  const base = CLOUD_STORAGE_URL.replace(/\/+$/, '');
  return `${base}/${key}`;
}

async function getRawBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const syncKey = req.query?.syncKey;
  if (!syncKey) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Missing syncKey' }));
    return;
  }

  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, POST');
      res.end('Method Not Allowed');
      return;
    }

    const url = buildCloudUrl(syncKey);
    const headers = { 'Content-Type': 'application/json' };
    const init = { method, headers };
    if (method === 'POST') {
      init.body = await getRawBody(req);
    }

    const upstream = await fetch(url, init);

    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');

    const body = await upstream.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: `Cloud proxy failed: ${String(error)}` }));
  }
}
