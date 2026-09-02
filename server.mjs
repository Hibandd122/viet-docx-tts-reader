import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import WebSocket from 'ws';
import crypto from 'node:crypto';

const root = resolve('D:/Extension/Vol9_WebReader');
const PORT = 8765;
const HOST = '127.0.0.1';
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg'
};

const NO_CACHE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.webmanifest']);

// In-memory Audio Cache for instant playback
const audioCache = new Map();
const pendingAudioCache = new Map();
const MAX_CACHE_ITEMS = 200;

function getCacheKey(voice, text, rate, pitch) {
  return `${voice}::${rate}::${pitch}::${text.trim()}`;
}

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

async function getAvailableVoices() {
  if (cachedVoices) return cachedVoices;
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
      return cachedVoices;
    }
  } catch (err) {
    console.warn('Error fetching Edge voices:', err);
  }
  return FALLBACK_VOICES;
}

function synthesizeEdgeTTS(text, voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz') {
  return new Promise((resolveTTS, rejectTTS) => {
    const ticks = Math.floor(Date.now() / 1000) + 11644473600;
    const rounded = ticks - (ticks % 300);
    const windowsTicks = rounded * 10000000;
    const data = new TextEncoder().encode(`${windowsTicks}${TRUSTED_TOKEN}`);
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
      rejectTTS(new Error('Edge TTS WebSocket timeout after 15s'));
    }, 15000);

    ws.on('open', () => {
      const date = new Date().toISOString();
      const configMsg = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg, (err) => {
        if (err) {
          clearTimeout(timer);
          isFinished = true;
          try { ws.close(); } catch {}
          return rejectTTS(err);
        }
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}">${escaped}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });
    });

    ws.on('message', (msg, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(msg);
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
            return rejectTTS(new Error('Received empty audio from Edge TTS'));
          }
          resolveTTS(fullAudio);
        }
      }
    });

    ws.on('error', err => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      rejectTTS(err);
    });

    ws.on('close', () => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      if (audioChunks.length > 0) {
        resolveTTS(Buffer.concat(audioChunks));
      } else {
        rejectTTS(new Error('Edge TTS WebSocket closed prematurely'));
      }
    });
  });
}

const server = createServer(async (req, res) => {
  // Enable CORS for extension or web client
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // Endpoint: /api/status
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', engine: 'edge-direct-ws', uptime: process.uptime() }));
      return;
    }

    // Endpoint: /api/voices
    if (pathname === '/api/voices') {
      const voices = await getAvailableVoices();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, voices }));
      return;
    }

    // Endpoint: /tts hoặc /api/tts
    if (pathname === '/tts' || pathname === '/api/tts') {
      const text = (url.searchParams.get('text') || '').trim();
      const rawVoice = url.searchParams.get('voice') || 'vi-VN-HoaiMyNeural';
      const rateParam = url.searchParams.get('rate') || '1.0';
      const pitchParam = url.searchParams.get('pitch') || '1.0';

      if (!text) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Missing text parameter');
        return;
      }

      // Sanitize voice ShortName
      let voice = 'vi-VN-HoaiMyNeural';
      if (/NamMinh|Nam Minh|Male|Nam/i.test(rawVoice)) voice = 'vi-VN-NamMinhNeural';
      else if (/HoaiMy|Hoài My|Female|Nữ/i.test(rawVoice)) voice = 'vi-VN-HoaiMyNeural';
      else if (rawVoice.includes('Neural')) voice = rawVoice;

      // Robust Rate & Pitch Parsing (Supports "+0%", "1.0", "1.25", "+50Hz")
      let ratePercent = '+0%';
      if (typeof rateParam === 'string' && rateParam.includes('%')) {
        ratePercent = rateParam;
      } else {
        const rateNum = Math.max(0.5, Math.min(2.5, parseFloat(rateParam) || 1.0));
        ratePercent = `${rateNum >= 1 ? '+' : ''}${Math.round((rateNum - 1) * 100)}%`;
      }

      let pitchPercent = '+0Hz';
      if (typeof pitchParam === 'string' && pitchParam.includes('Hz')) {
        pitchPercent = pitchParam;
      } else {
        const pitchNum = Math.max(0.5, Math.min(1.5, parseFloat(pitchParam) || 1.0));
        pitchPercent = `${pitchNum >= 1 ? '+' : ''}${Math.round((pitchNum - 1) * 50)}Hz`;
      }

      const cacheKey = getCacheKey(voice, text, ratePercent, pitchPercent);

      if (audioCache.has(cacheKey)) {
        const cachedBuffer = audioCache.get(cacheKey);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': cachedBuffer.length,
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(cachedBuffer);
        return;
      }

      try {
        if (!pendingAudioCache.has(cacheKey)) {
          pendingAudioCache.set(
            cacheKey,
            synthesizeEdgeTTS(text, voice, ratePercent, pitchPercent).finally(() => pendingAudioCache.delete(cacheKey))
          );
        }

        const fullBuffer = await pendingAudioCache.get(cacheKey);
        if (!fullBuffer || !fullBuffer.length) {
          console.error('Edge TTS returned empty audio');
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('TTS returned empty audio');
          return;
        }

        if (audioCache.size >= MAX_CACHE_ITEMS) {
          const firstKey = audioCache.keys().next().value;
          audioCache.delete(firstKey);
        }
        audioCache.set(cacheKey, fullBuffer);

        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': fullBuffer.length,
          'X-Cache': 'MISS',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(fullBuffer);
      } catch (streamErr) {
        console.error('Edge TTS init error:', streamErr);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('TTS generation error: ' + streamErr.message);
      }
      return;
    }

    // Static file serving (check public/ then root)
    let safePath = pathname === '/' ? '/index.html' : pathname;
    let filePath = resolve(root, 'public', `.${safePath}`);
    let fileStat = await stat(filePath).catch(() => null);

    if (!fileStat || !fileStat.isFile()) {
      filePath = resolve(root, `.${safePath}`);
      fileStat = await stat(filePath).catch(() => null);
    }

    if (!filePath.startsWith(root)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (!fileStat || !fileStat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await readFile(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': NO_CACHE_EXTENSIONS.has(ext) || filePath.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`  VOL 9 WEB READER SERVER RUNNING AT:`);
  console.log(`  -> http://${HOST}:${PORT}`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`  Edge TTS Ready (vi-VN-HoaiMyNeural, vi-VN-NamMinhNeural)`);
  console.log(`====================================================`);
});
