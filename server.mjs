import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import ttsHandler from './api/tts.mjs';
import chapterHandler from './api/chapter.mjs';
const root = resolve('.');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/tts' || url.pathname === '/api/tts.mp3') { await ttsHandler(req, res); return; }
    if (url.pathname === '/api/chapter') { await chapterHandler(req, res); return; }
    const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(root)) throw new Error('forbidden');
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 8765), process.env.HOST || '0.0.0.0');
