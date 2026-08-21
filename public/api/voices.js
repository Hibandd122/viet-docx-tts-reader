const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
let cachedVoices = null;

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

async function handler(req, res) {
  if (res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req && req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
  }

  let voices = FALLBACK_VOICES;
  try {
    if (!cachedVoices) {
      try {
        const response = await fetch(
          `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_TOKEN}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (response.ok) {
          const list = await response.json();
          cachedVoices = list.filter(v =>
            (v.Locale && (v.Locale.startsWith('vi') || v.Locale.startsWith('en'))) ||
            /vietnamese|tiếng việt/i.test(v.FriendlyName || '')
          );
        }
      } catch (fetchErr) {
        console.warn('Fetch voices error, using fallback:', fetchErr);
      }
    }
    voices = cachedVoices && cachedVoices.length ? cachedVoices : FALLBACK_VOICES;
  } catch (err) {
    console.error('Voices API error:', err);
  }

  const jsonBody = JSON.stringify({ ok: true, voices });

  if (res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.statusCode = 200;
    res.end(jsonBody);
    return;
  }

  return new Response(jsonBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

module.exports = handler;
module.exports.default = handler;
