import { readFile } from 'node:fs/promises';
import { Constants, EdgeTTS } from '@andresaya/edge-tts';

const allowedVoices = new Set(['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural']);
const maxChunkLength = 2400;

const splitForSpeech = text => {
  const parts = [];
  let rest = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const minimumCut = Math.floor(maxChunkLength * 0.45);
  while (rest.length > maxChunkLength) {
    let cut = -1;
    for (const punctuation of ['.', '!', '?', '。', '！', '？']) {
      cut = Math.max(cut, rest.lastIndexOf(punctuation, maxChunkLength));
    }
    if (cut < minimumCut) cut = rest.lastIndexOf(' ', maxChunkLength);
    if (cut < 1) cut = maxChunkLength;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
};

let chaptersPromise;
const loadChapters = () => {
  chaptersPromise ||= readFile(new URL('../chapters.js', import.meta.url), 'utf8').then(source => {
    const json = source.replace(/^\s*window\.CHAPTERS\s*=\s*/, '').replace(/;\s*$/, '');
    return JSON.parse(json);
  });
  return chaptersPromise;
};

const query = request => new URL(request.url, 'https://reader.local').searchParams;

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
  if (request.method !== 'GET') { response.statusCode = 405; response.end('Method Not Allowed'); return; }

  try {
    const params = query(request);
    const chapterIndex = Math.max(0, Number.parseInt(params.get('chapter') || '0', 10) || 0);
    const requestedStart = Math.max(0, Number.parseInt(params.get('start') || '0', 10) || 0);
    const requestedEnd = Math.max(0, Number.parseInt(params.get('end') || '0', 10) || 0);
    const voice = allowedVoices.has(params.get('voice')) ? params.get('voice') : 'vi-VN-HoaiMyNeural';
    const pitchNumber = Number(params.get('pitch') || '1');
    const pitch = Math.round((Number.isFinite(pitchNumber) ? pitchNumber : 1) - 1) * 20;
    const chapters = await loadChapters();
    const chapter = chapters[chapterIndex];
    const paragraphs = (chapter?.blocks || [])
      .filter(block => block.type === 'p')
      .map(block => String(block.text || '').trim())
      .filter(Boolean);
    const start = Math.min(requestedStart, Math.max(0, paragraphs.length - 1));
    if (!paragraphs.length) { response.statusCode = 404; response.end('Chapter khong co noi dung'); return; }
    const end = requestedEnd > start ? Math.min(requestedEnd, paragraphs.length) : paragraphs.length;

    response.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'X-Reader-Audio': 'continuous-chapter',
      'X-Reader-Start': String(start),
      'X-Reader-End': String(end)
    });

    const tts = new EdgeTTS();
    for (const paragraph of paragraphs.slice(start, end)) {
      for (const text of splitForSpeech(paragraph)) {
        const stream = tts.synthesizeStream(text, voice, {
          rate: '+0%',
          pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
          volume: '100%',
          outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
        });
        for await (const chunk of stream) response.write(Buffer.from(chunk));
      }
    }
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      response.statusCode = 502;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    response.end(`Edge TTS chapter error: ${error.message || 'khong ket noi duoc'}`);
  }
}
