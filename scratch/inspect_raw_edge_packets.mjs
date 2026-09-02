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

ws.on('open', () => {
  console.log('WS OPENED');
  const date = new Date().toISOString();
  const config = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
  ws.send(config);
  
  const text = 'Xin chào, đây là giọng đọc Hoài My.';
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="vi-VN-HoaiMyNeural"><prosody pitch="+0Hz" rate="+0%">${text}</prosody></voice></speak>`;
  const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
  ws.send(ssmlMsg);
});

ws.on('message', (msg) => {
  const buf = Buffer.from(msg);
  if (buf.length >= 2) {
    const headLen = buf.readUInt16BE(0);
    if (headLen > 0 && headLen < buf.length) {
      const headText = buf.subarray(2, 2 + headLen).toString('utf-8');
      console.log('Binary message header:', headText.replace(/\r\n/g, ' | '));
      const payload = buf.subarray(2 + headLen);
      console.log('Payload size:', payload.length);
      return;
    }
  }
  console.log('Text message:', buf.toString('utf-8').slice(0, 120).replace(/\r\n/g, ' | '));
});

ws.on('close', (c, r) => {
  console.log('CLOSED:', c, r?.toString());
  process.exit(0);
});

ws.on('error', (e) => console.error('ERROR:', e));
