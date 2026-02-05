export default async function handler(req, res) {
  try {
    const backend = process.env.BACKEND_URL || 'http://localhost:8000';
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path || '');
    const url = `${backend.replace(/\/$/, '')}/${path}`;

    const headers = { ...req.headers };
    delete headers.host;

    const method = req.method || 'GET';
    let body = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await getRawBody(req);
    }

    const fetchRes = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
    });

    // Copy status and headers
    res.statusCode = fetchRes.status;
    fetchRes.headers.forEach((value, key) => {
      // Avoid overriding Vercel-specific headers
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    const arrayBuffer = await fetchRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    res.statusCode = 500;
    res.end('Proxy error: ' + String(err));
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
