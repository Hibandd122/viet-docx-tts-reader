function handler(req, res) {
  if (res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req && req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ status: 'ok', engine: 'edge-direct-ws', platform: 'vercel' }));
    return;
  }

  return new Response(JSON.stringify({ status: 'ok', engine: 'edge-direct-ws', platform: 'vercel' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

module.exports = handler;
module.exports.default = handler;
