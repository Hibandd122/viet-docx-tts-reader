import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const root = resolve('D:/Extension/Vol9_WebReader');
const PORT = 8765;
const HOST = '127.0.0.1';

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

// In-memory Audio Cache for instant playback
const audioCache = new Map();
const MAX_CACHE_ITEMS = 200;

function getCacheKey(voice, text, rate, pitch) {
  return `${voice}::${rate}::${pitch}::${text.trim()}`;
}

const tts = new MsEdgeTTS();
let cachedVoices = null;

async function getAvailableVoices() {
  if (cachedVoices) return cachedVoices;
  try {
    const voices = await tts.getVoices();
    cachedVoices = voices.filter(v => 
      (v.Locale && (v.Locale.startsWith('vi') || v.Locale.startsWith('en'))) ||
      /vietnamese|tiếng việt/i.test(v.FriendlyName || '')
    );
    return cachedVoices;
  } catch (err) {
    console.error('Error fetching Edge voices:', err);
    return [
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
  }
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
      res.end(JSON.stringify({ status: 'ok', engine: 'msedge-tts', uptime: process.uptime() }));
      return;
    }

    // Endpoint: /api/voices
    if (pathname === '/api/voices') {
      const voices = await getAvailableVoices();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, voices }));
      return;
    }

    // Endpoint: /tts
    if (pathname === '/tts') {
      const text = (url.searchParams.get('text') || '').trim();
      const voice = url.searchParams.get('voice') || 'vi-VN-HoaiMyNeural';
      const rateParam = url.searchParams.get('rate') || '1.0';
      const pitchParam = url.searchParams.get('pitch') || '1.0';

      if (!text) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Missing text parameter');
        return;
      }

      // Convert rate (e.g. 1.15) to percentage string (e.g. "+15%")
      const rateNum = Math.max(0.5, Math.min(2.0, parseFloat(rateParam) || 1.0));
      const ratePercent = `${rateNum >= 1 ? '+' : ''}${Math.round((rateNum - 1) * 100)}%`;

      // Convert pitch (e.g. 1.05) to Hz or percentage
      const pitchNum = Math.max(0.5, Math.min(1.5, parseFloat(pitchParam) || 1.0));
      const pitchPercent = `${pitchNum >= 1 ? '+' : ''}${Math.round((pitchNum - 1) * 50)}Hz`;

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
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text, {
          rate: ratePercent,
          pitch: pitchPercent
        });

        const chunks = [];
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Transfer-Encoding': 'chunked',
          'X-Cache': 'MISS'
        });

        audioStream.on('data', chunk => {
          chunks.push(chunk);
          res.write(chunk);
        });

        audioStream.on('end', () => {
          res.end();
          const fullBuffer = Buffer.concat(chunks);
          if (audioCache.size >= MAX_CACHE_ITEMS) {
            const firstKey = audioCache.keys().next().value;
            audioCache.delete(firstKey);
          }
          audioCache.set(cacheKey, fullBuffer);
        });

        audioStream.on('error', err => {
          console.error('Edge TTS audioStream error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          }
          res.end('TTS Stream error: ' + err.message);
        });
      } catch (streamErr) {
        console.error('Edge TTS init error:', streamErr);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('TTS generation error: ' + streamErr.message);
      }
      return;
    }

    // Static file serving
    let safePath = pathname === '/' ? '/index.html' : pathname;
    let filePath = resolve(root, `.${safePath}`);

    if (!filePath.startsWith(root)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const fileStat = await stat(filePath).catch(() => null);
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
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
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
