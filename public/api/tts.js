export const config = { runtime: 'edge' };

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

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

async function getSecMsGec() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  const data = new TextEncoder().encode(`${windowsTicks}${TRUSTED_TOKEN}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function synthesizeEdgeTTS(text, voice, rate, pitch, hash) {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomUUID().replace(/-/g, '');
    const reqId = crypto.randomUUID().replace(/-/g, '');
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${hash}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    const audioChunks = [];
    let isFinished = false;

    const timer = setTimeout(() => {
      if (isFinished) return;
      isFinished = true;
      try { ws.close(); } catch {}
      reject(new Error('Edge TTS WebSocket timeout after 15s'));
    }, 15000);

    ws.onopen = () => {
      const configMsg = 'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}';
      ws.send(configMsg);
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="${voice}"><prosody pitch="${pitch}" rate="${rate}">${escaped}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (event.data.byteLength >= 2) {
          const headerLen = view.getUint16(0, false);
          if (event.data.byteLength > headerLen + 2) {
            const chunk = event.data.slice(headerLen + 2);
            audioChunks.push(chunk);
          }
        }
      } else if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          if (isFinished) return;
          isFinished = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}

          let totalLen = 0;
          for (const c of audioChunks) totalLen += c.byteLength;
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of audioChunks) {
            merged.set(new Uint8Array(c), offset);
            offset += c.byteLength;
          }
          if (!totalLen) return reject(new Error('Received empty audio from Edge TTS'));
          resolve(merged);
        }
      }
    };

    ws.onerror = (err) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      reject(err);
    };

    ws.onclose = () => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      if (audioChunks.length > 0) {
        let totalLen = 0;
        for (const c of audioChunks) totalLen += c.byteLength;
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of audioChunks) {
          merged.set(new Uint8Array(c), offset);
          offset += c.byteLength;
        }
        resolve(merged);
      } else {
        reject(new Error('Edge TTS WebSocket closed prematurely'));
      }
    };
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range'
      }
    });
  }

  try {
    const url = new URL(req.url);
    const text = (url.searchParams.get('text') || '').trim();
    const rawVoice = url.searchParams.get('voice') || 'vi-VN-HoaiMyNeural';
    const rateParam = url.searchParams.get('rate') || '1.0';
    const pitchParam = url.searchParams.get('pitch') || '1.0';

    if (!text) {
      return new Response('Missing text parameter', { status: 400 });
    }

    const voice = sanitizeEdgeVoice(rawVoice);
    const rate = normalizeRate(rateParam);
    const pitch = normalizePitch(pitchParam);
    const hash = await getSecMsGec();

    const audioUint8 = await synthesizeEdgeTTS(text, voice, rate, pitch, hash);

    return new Response(audioUint8, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioUint8.byteLength),
        'X-Cache': 'EDGE-LIVE',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('Edge TTS Error:', err);
    return new Response('TTS error: ' + (err.message || String(err)), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
