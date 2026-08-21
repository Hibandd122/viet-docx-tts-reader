export const config = { runtime: 'edge' };

export default async function handler(req) {
  return new Response(JSON.stringify({ status: 'ok', engine: 'edge-direct-ws', platform: 'vercel-edge' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
