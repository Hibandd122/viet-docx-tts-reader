import WebSocket from 'ws';
import crypto from 'node:crypto';

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function generateSecMsGec() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = BigInt(rounded) * 10000000n;
  const data = Buffer.from(`${windowsTicks.toString()}${TRUSTED_TOKEN}`, 'utf-8');
  return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
}

export function synthesizeEdgeTTS(text, voice = 'vi-VN-HoaiMyNeural', rate = '+0%', pitch = '+0Hz') {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomUUID().replace(/-/g, '');
    const reqId = crypto.randomUUID().replace(/-/g, '');
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
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}'>${escaped}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });
    });

    ws.on('message', (data) => {
      const buf = Buffer.from(data);
      if (buf.length >= 2) {
        const headerLen = buf.readUInt16BE(0);
        if (headerLen > 0 && headerLen + 2 < buf.length) {
          const headerStr = buf.subarray(2, 2 + headerLen).toString('utf-8');
          if (headerStr.includes('Path:audio')) {
            const audioData = buf.subarray(2 + headerLen);
            if (audioData.length > 0) {
              audioChunks.push(audioData);
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
          return reject(new Error('Received empty audio from Edge TTS'));
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
        reject(new Error('Edge TTS WebSocket closed without audio'));
      }
    });
  });
}

console.log('Testing synthesizeEdgeTTS for "Xin chào bạn, tôi là Hoài My"...');
const audio = await synthesizeEdgeTTS('Xin chào bạn, tôi là Hoài My', 'vi-VN-HoaiMyNeural');
console.log('🎉 SUCCESS! Synthesized audio bytes:', audio.length);
