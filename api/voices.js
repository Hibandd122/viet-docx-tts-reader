import { MsEdgeTTS } from 'msedge-tts';

const tts = new MsEdgeTTS();
let cachedVoices = null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (!cachedVoices) {
      const voices = await tts.getVoices();
      cachedVoices = voices.filter(v => 
        (v.Locale && (v.Locale.startsWith('vi') || v.Locale.startsWith('en'))) ||
        /vietnamese|tiếng việt/i.test(v.FriendlyName || '')
      );
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.status(200).json({ ok: true, voices: cachedVoices });
  } catch (err) {
    console.error('Voices API error:', err);
    res.status(200).json({
      ok: true,
      voices: [
        { ShortName: 'vi-VN-HoaiMyNeural', FriendlyName: 'Microsoft Hoài My (Nữ - Tự nhiên)' },
        { ShortName: 'vi-VN-NamMinhNeural', FriendlyName: 'Microsoft Nam Minh (Nam - Tự nhiên)' }
      ]
    });
  }
}
