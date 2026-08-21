export const config = { runtime: 'edge' };

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const FALLBACK_VOICES = [
  {
    ShortName: 'vi-VN-HoaiMyNeural',
    FriendlyName: 'Microsoft Hoài My (Nữ - Tự nhiên)',
    Gender: 'Female',
    Locale: 'vi-VN'
  },
  {
    ShortName: 'vi-VN-NamMinhNeural',
    FriendlyName: 'Microsoft Nam Minh (Nam - Tự nhiên)',
    Gender: 'Male',
    Locale: 'vi-VN'
  }
];

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  let voices = FALLBACK_VOICES;
  try {
    const res = await fetch(
      `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_TOKEN}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const list = await res.json();
      const vi = list.filter(v =>
        (v.Locale && (v.Locale.startsWith('vi') || v.Locale.startsWith('en'))) ||
        /vietnamese|tiếng việt/i.test(v.FriendlyName || '')
      );
      if (vi && vi.length) voices = vi;
    }
  } catch (err) {
    console.warn('Fetch voices error:', err);
  }

  return new Response(JSON.stringify({ ok: true, voices }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
