import WebSocket from 'ws';
import crypto from 'node:crypto';

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const audioCache = new Map();
const pendingAudioCache = new Map();
const MAX_CACHE_ITEMS = 200;

// Valid silent MP3 frame (~26ms MPEG-1 Layer 3)
const SILENT_MP3 = Buffer.from([
  0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

const DECORATIVE_SYMBOLS_REGEX = /[✧✦₊★☆♡♥♪♫✿❀❁❃❄❅❆❇❈❉❊❋▲▼◀▶◆◇■□●○◎✪✫✬✭✮✯✰※†‡~～〰=_*^#§•·\\/|<>🔖]/gu;

export function isSceneBreakDivider(text) {
  if (text === null || text === undefined || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const stripped = trimmed.replace(DECORATIVE_SYMBOLS_REGEX, '').replace(/[\s\-\.\,\:\;\"\'\(\)\[\]\{\}\/\\—–]/g, '');
  return stripped.length === 0;
}

export function cleanTextForTTS(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText
    .replace(/🔖/g, '')
    .replace(DECORATIVE_SYMBOLS_REGEX, ' ')
    .replace(/[\—\–]{2,}/g, ', ')
    .replace(/~{2,}/g, ', ')
    .replace(/\.{4,}/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
  return text.replace(/^[\,\:\;\-\–\—\s]+/, '').replace(/[\-\–\—\s]+$/, '');
}

export function isSpeakableText(text) {
  if (!text || typeof text !== 'string') return false;
  const cleaned = cleanTextForTTS(text);
  return /[\p{L}\p{N}]/u.test(cleaned);
}

function generateSecMsGec() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = BigInt(rounded) * 10000000n;
  const data = Buffer.from(`${windowsTicks.toString()}${TRUSTED_TOKEN}`, 'utf-8');
  return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
}

export function sanitizeEdgeVoice(rawVoice) {
  const voiceText = String(rawVoice || '');
  if (/NamMinh|Nam Minh|Male|Nam/i.test(voiceText)) return 'vi-VN-NamMinhNeural';
  if (/HoaiMy|Hoai My|Female|Nu|N\u1eef/i.test(voiceText)) return 'vi-VN-HoaiMyNeural';
  if (voiceText.includes('Neural')) return voiceText;
  return 'vi-VN-HoaiMyNeural';
}

export function normalizeRate(rateParam) {
  if (typeof rateParam === 'string' && rateParam.includes('%')) {
    return rateParam;
  }
  const rateNum = Math.max(0.5, Math.min(2.5, parseFloat(rateParam) || 1.0));
  return `${rateNum >= 1 ? '+' : ''}${Math.round((rateNum - 1) * 100)}%`;
}

export function normalizePitch(pitchParam) {
  if (typeof pitchParam === 'string' && pitchParam.includes('Hz')) {
    return pitchParam;
  }
  const pitchNum = Math.max(0.5, Math.min(1.5, parseFloat(pitchParam) || 1.0));
  return `${pitchNum >= 1 ? '+' : ''}${Math.round((pitchNum - 1) * 50)}Hz`;
}

function getCacheKey(voice, text, rate, pitch) {
  return `${voice}::${rate}::${pitch}::${text.trim()}`;
}

export function synthesizeEdgeTTS(text, voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz') {
  return new Promise((resolve, reject) => {
    const cleaned = cleanTextForTTS(text);
    if (!isSpeakableText(cleaned)) {
      return resolve(SILENT_MP3);
    }

    const reqId = crypto.randomUUID().replace(/-/g, '');
    const connId = crypto.randomUUID().replace(/-/g, '');
    const hash = generateSecMsGec();
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${hash}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`;

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
      }
    });

    const audioChunks = [];
    let isFinished = false;

    const timer = setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      try { ws.close(); } catch {}
      reject(new Error('Edge TTS WebSocket timeout after 15s'));
    }, 15000);

    ws.on('open', () => {
      const date = new Date().toISOString();
      const configMsg = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg, (err) => {
        if (err) {
          clearTimeout(timer);
          isFinished = true;
          try { ws.close(); } catch {}
          return reject(err);
        }
        const escaped = cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}'>${escaped}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });
    });

    ws.on('message', (msg) => {
      const buf = Buffer.from(msg);
      if (buf.length >= 2) {
        const headLen = buf.readUInt16BE(0);
        if (headLen > 0 && headLen + 2 <= buf.length) {
          const headStr = buf.subarray(2, 2 + headLen).toString('utf-8');
          if (headStr.includes('Path:audio')) {
            const audio = buf.subarray(2 + headLen);
            if (audio.length > 0) {
              audioChunks.push(audio);
            }
            return;
          }
        }
      }

      const str = buf.toString('utf-8');
      if (str.includes('Path:turn.end')) {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(timer);
        try { ws.close(); } catch {}
        const total = Buffer.concat(audioChunks);
        if (!total.length) {
          return resolve(SILENT_MP3);
        }
        resolve(total);
      }
    });

    ws.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      reject(err);
    });

    ws.on('close', () => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      } else {
        resolve(SILENT_MP3);
      }
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const textParam = (req.query && req.query.text) || '';
    const voiceParam = (req.query && req.query.voice) || 'vi-VN-HoaiMyNeural';
    const rateParam = (req.query && req.query.rate) || '1.0';
    const pitchParam = (req.query && req.query.pitch) || '1.0';

    const rawText = String(textParam).trim();
    if (!rawText) {
      return res.status(400).send('Missing text parameter');
    }

    const voice = sanitizeEdgeVoice(voiceParam);
    const rate = normalizeRate(rateParam);
    const pitch = normalizePitch(pitchParam);

    // If text contains only decorative symbols (✧ ₊ ✦ ₊ ✧, ◆, etc.), return silent frame immediately
    if (!isSpeakableText(rawText)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', SILENT_MP3.length);
      res.setHeader('X-Cache', 'STATIC-SILENT');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(SILENT_MP3);
    }

    const text = cleanTextForTTS(rawText);
    const cacheKey = getCacheKey(voice, text, rate, pitch);

    if (audioCache.has(cacheKey)) {
      const cachedBuffer = audioCache.get(cacheKey);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', cachedBuffer.length);
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(cachedBuffer);
    }

    if (!pendingAudioCache.has(cacheKey)) {
      pendingAudioCache.set(
        cacheKey,
        synthesizeEdgeTTS(text, voice, rate, pitch).finally(() => pendingAudioCache.delete(cacheKey))
      );
    }

    const fullBuffer = await pendingAudioCache.get(cacheKey);
    if (!fullBuffer || !fullBuffer.length) {
      return res.status(200).send(SILENT_MP3);
    }

    if (audioCache.size >= MAX_CACHE_ITEMS) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, fullBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', fullBuffer.length);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(fullBuffer);
  } catch (err) {
    console.error('Serverless TTS Error:', err);
    return res.status(500).send(`TTS Error: ${err.message}`);
  }
}
