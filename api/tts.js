import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const audioCache = new Map();
const pendingAudioCache = new Map();
const MAX_CACHE_ITEMS = 100;

function getParam(value, fallback = '') {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function sanitizeEdgeVoice(rawVoice) {
  const voiceText = String(rawVoice || '');
  if (/NamMinh|Nam Minh|Male|Nam/i.test(voiceText)) return 'vi-VN-NamMinhNeural';
  if (/HoaiMy|Hoai My|Female|Nu|N\u1eef/i.test(voiceText)) return 'vi-VN-HoaiMyNeural';
  if (voiceText.includes('Neural')) return voiceText;
  return 'vi-VN-HoaiMyNeural';
}

function normalizeRate(rateParam) {
  const rateNum = Math.max(0.5, Math.min(2.0, parseFloat(rateParam) || 1.0));
  return `${rateNum >= 1 ? '+' : ''}${Math.round((rateNum - 1) * 100)}%`;
}

function normalizePitch(pitchParam) {
  const pitchNum = Math.max(0.5, Math.min(1.5, parseFloat(pitchParam) || 1.0));
  return `${pitchNum >= 1 ? '+' : ''}${Math.round((pitchNum - 1) * 50)}Hz`;
}

function getCacheKey(voice, text, rate, pitch) {
  return `${voice}::${rate}::${pitch}::${text.trim()}`;
}

async function synthesizeEdgeTTS(text, voice, rate, pitch) {
  const requestTts = new MsEdgeTTS();
  let selectedVoice = voice;

  try {
    await requestTts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  } catch {
    selectedVoice = 'vi-VN-HoaiMyNeural';
    await requestTts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  }

  const { audioStream } = requestTts.toStream(text, { rate, pitch });
  const chunks = [];

  return await new Promise((resolve, reject) => {
    audioStream.on('data', chunk => chunks.push(chunk));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const text = String(getParam(req.query?.text)).trim();
    const voice = sanitizeEdgeVoice(getParam(req.query?.voice, 'vi-VN-HoaiMyNeural'));
    const rate = normalizeRate(getParam(req.query?.rate, '1.0'));
    const pitch = normalizePitch(getParam(req.query?.pitch, '1.0'));

    if (!text) {
      res.status(400).send('Missing text parameter');
      return;
    }

    const cacheKey = getCacheKey(voice, text, rate, pitch);

    if (audioCache.has(cacheKey)) {
      const cachedBuffer = audioCache.get(cacheKey);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', cachedBuffer.length);
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      res.status(200).send(cachedBuffer);
      return;
    }

    if (!pendingAudioCache.has(cacheKey)) {
      pendingAudioCache.set(
        cacheKey,
        synthesizeEdgeTTS(text, voice, rate, pitch).finally(() => pendingAudioCache.delete(cacheKey))
      );
    }

    const audioBuffer = await pendingAudioCache.get(cacheKey);
    if (!audioBuffer.length) {
      res.status(502).send('TTS returned empty audio');
      return;
    }

    if (audioCache.size >= MAX_CACHE_ITEMS) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, audioBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(audioBuffer);
  } catch (err) {
    console.error('Vercel TTS error:', err);
    if (!res.headersSent) {
      res.status(500).send('TTS error: ' + err.message);
    } else {
      res.end();
    }
  }
}
