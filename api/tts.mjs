import { Constants, EdgeTTS } from '@andresaya/edge-tts';

const allowedVoices = new Set(['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural']);

const readBody = request => new Promise((resolve, reject) => {
  let value = '';
  request.setEncoding('utf8');
  request.on('data', chunk => { value += chunk; if (value.length > 20000) reject(new Error('body-too-large')); });
  request.on('end', () => {
    try { resolve(value ? JSON.parse(value) : {}); } catch { reject(new Error('invalid-json')); }
  });
  request.on('error', reject);
});

const valueFromRequest = async request => {
  if (request.method === 'GET') {
    const url = new URL(request.url, 'https://reader.local');
    return { text:url.searchParams.get('text') || '', voice:url.searchParams.get('voice') || '', rate:url.searchParams.get('rate') || '+0%', pitch:url.searchParams.get('pitch') || '+0Hz', volume:url.searchParams.get('volume') || '100%' };
  }
  return readBody(request);
};

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
  if (!['GET', 'POST'].includes(request.method)) { response.statusCode = 405; response.end('Method Not Allowed'); return; }
  try {
    const input = await valueFromRequest(request);
    const text = String(input.text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    const voice = allowedVoices.has(input.voice) ? input.voice : 'vi-VN-HoaiMyNeural';
    const rate = /^[-+]?\d{1,3}%$/.test(String(input.rate)) ? String(input.rate) : '+0%';
    const pitch = /^[-+]?\d{1,3}Hz$/.test(String(input.pitch)) ? String(input.pitch) : '+0Hz';
    const volume = /^\d{1,3}%$/.test(String(input.volume)) ? String(input.volume) : '100%';
    if (!text || text.length > 3000) { response.statusCode = 400; response.end('Text không hợp lệ hoặc quá dài'); return; }
    const tts = new EdgeTTS();
    const chunks = [];
    for await (const chunk of tts.synthesizeStream(text, voice, { rate, pitch, volume, outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3 })) chunks.push(Buffer.from(chunk));
    const audio = Buffer.concat(chunks);
    response.writeHead(200, { 'Content-Type':'audio/mpeg', 'Content-Length':String(audio.length) });
    response.end(audio);
  } catch (error) {
    if (!response.headersSent) { response.statusCode = 502; response.setHeader('Content-Type', 'text/plain; charset=utf-8'); }
    response.end(`Edge TTS lỗi: ${error.message || 'không kết nối được'}`);
  }
}
