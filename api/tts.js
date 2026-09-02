const WebSocket = require('ws');
const crypto = require('crypto');

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const audioCache = new Map();
const pendingAudioCache = new Map();
const MAX_CACHE_ITEMS = 200;

function sanitizeEdgeVoice(rawVoice) {
  const voiceText = String(rawVoice || '');
  if (/NamMinh|Nam Minh|Male|Nam/i.test(voiceText)) return 'vi-VN-NamMinhNeural';
  if (/HoaiMy|Hoai My|Female|Nu|N\u1eef/i.test(voiceText)) return 'vi-VN-HoaiMyNeural';
  if (voiceText.includes('Neural')) return voiceText;
  return 'vi-VN-HoaiMyNeural';
}

function normalizeRate(rateParam) {
  if (typeof rateParam === 'string' && rateParam.includes('%')) {
    return rateParam;
  }
  const rateNum = Math.max(0.5, Math.min(2.5, parseFloat(rateParam) || 1.0));
  return `${rateNum >= 1 ? '+' : ''}${Math.round((rateNum - 1) * 100)}%`;
}

function normalizePitch(pitchParam) {
  if (typeof pitchParam === 'string' && pitchParam.includes('Hz')) {
    return pitchParam;
  }
  const pitchNum = Math.max(0.5, Math.min(1.5, parseFloat(pitchParam) || 1.0));
  return `${pitchNum >= 1 ? '+' : ''}${Math.round((pitchNum - 1) * 50)}Hz`;
}

function getCacheKey(voice, text, rate, pitch) {
  return `${voice}::${rate}::${pitch}::${text.trim()}`;
}

function synthesizeEdgeTTS(text, voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz') {
  return new Promise((resolve, reject) => {
    const ticks = Math.floor(Date.now() / 1000) + 11644473600;
    const rounded = ticks - (ticks % 300);
    const windowsTicks = rounded * 10000000;
    const data = Buffer.from(`${windowsTicks}${TRUSTED_TOKEN}`, 'utf-8');
    const hash = crypto.createHash('sha256').update(data).digest('hex').toUpperCase();

    const reqId = crypto.randomUUID().replace(/-/g, '');
    const connId = crypto.randomUUID().replace(/-/g, '');
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
      reject(new Error('Edge TTS WebSocket timeout after 12s'));
    }, 12000);

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
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}">${escaped}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });
    });

    ws.on('message', (msg, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
        if (buf.length >= 2) {
          const headerLen = buf.readUInt16BE(0);
          if (buf.length > headerLen + 2) {
            audioChunks.push(buf.subarray(headerLen + 2));
          }
        }
      } else {
        const textMsg = msg.toString();
        if (textMsg.includes('Path:turn.end')) {
          if (isFinished) return;
          isFinished = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          const fullAudio = Buffer.concat(audioChunks);
          if (!fullAudio.length) {
            return reject(new Error('Received empty audio from Edge TTS'));
          }
          resolve(fullAudio);
        }
      }
    });

    ws.on('error', err => {
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
        reject(new Error('Edge TTS WebSocket closed prematurely'));
      }
    });
  });
}

module.exports = async (req, res) => {
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

    const text = String(textParam).trim();
    const voice = sanitizeEdgeVoice(voiceParam);
    const rate = normalizeRate(rateParam);
    const pitch = normalizePitch(pitchParam);

    if (!text) {
      return res.status(400).send('Missing text parameter');
    }

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
      return res.status(502).send('TTS returned empty audio');
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
};
