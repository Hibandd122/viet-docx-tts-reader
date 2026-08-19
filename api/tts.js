import WebSocket from 'ws';
import crypto from 'crypto';

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function sanitizeEdgeVoice(voice) {
  if (!voice || typeof voice !== 'string') return 'vi-VN-HoaiMyNeural';
  if (/NamMinh|Nam Minh|Male|Nam/i.test(voice)) return 'vi-VN-NamMinhNeural';
  if (/HoaiMy|Hoài My|Female|Nữ/i.test(voice)) return 'vi-VN-HoaiMyNeural';
  if (voice.includes('Neural')) return voice;
  return 'vi-VN-HoaiMyNeural';
}

function synthesizeEdgeTTS(text, voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz') {
  return new Promise((resolve, reject) => {
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
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
      }
    });

    const audioChunks = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('Edge TTS WebSocket timeout after 15s'));
    }, 15000);

    ws.on('open', () => {
      const configMsg = 'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}';
      ws.send(configMsg, () => {
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}">${escaped}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });
    });

    ws.on('message', (msg, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(msg);
        const headerLen = buf.readUInt16BE(0);
        if (buf.length > headerLen + 2) {
          audioChunks.push(buf.subarray(headerLen + 2));
        }
      } else {
        const textMsg = msg.toString();
        if (textMsg.includes('Path:turn.end')) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve(Buffer.concat(audioChunks));
        }
      }
    });

    ws.on('error', err => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(err);
    });
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
    const text = (req.query?.text || '').trim();
    const voice = sanitizeEdgeVoice(req.query?.voice);
    const rate = req.query?.rate || '1.0';
    const pitch = req.query?.pitch || '1.0';

    if (!text) {
      res.status(400).send('Missing text parameter');
      return;
    }

    const rateNum = Math.max(0.5, Math.min(2.0, parseFloat(rate) || 1.0));
    const ratePercent = `${rateNum >= 1 ? '+' : ''}${Math.round((rateNum - 1) * 100)}%`;

    const pitchNum = Math.max(0.5, Math.min(1.5, parseFloat(pitch) || 1.0));
    const pitchPercent = `${pitchNum >= 1 ? '+' : ''}${Math.round((pitchNum - 1) * 50)}Hz`;

    const audioBuffer = await synthesizeEdgeTTS(text, voice, ratePercent, pitchPercent);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
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
