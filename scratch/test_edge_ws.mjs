import WebSocket from 'ws';
import crypto from 'node:crypto';

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

// Test with different Sec-MS-GEC algorithms or standard connection
function generateSecMsGec() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = BigInt(rounded) * 10000000n;
  const data = Buffer.from(`${windowsTicks.toString()}${TRUSTED_TOKEN}`, 'utf-8');
  return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
}

console.log('Sec-MS-GEC:', generateSecMsGec());

const connId = crypto.randomUUID().replace(/-/g, '');
const reqId = crypto.randomUUID().replace(/-/g, '');
const hash = generateSecMsGec();
const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${hash}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`;

console.log('Connecting to:', url);

const ws = new WebSocket(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache'
  }
});

ws.on('open', () => {
  console.log('✓ WebSocket connected successfully!');
  const date = new Date().toISOString();
  const configMsg = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
  ws.send(configMsg, (err) => {
    if (err) console.error('Error sending configMsg:', err);
    else console.log('Sent speech.config');
    
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="vi-VN"><voice name="vi-VN-HoaiMyNeural"><prosody pitch="+0Hz" rate="+0%">Xin chào</prosody></voice></speak>`;
    const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
    ws.send(ssmlMsg, (err2) => {
      if (err2) console.error('Error sending ssmlMsg:', err2);
      else console.log('Sent ssml');
    });
  });
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    console.log('Received binary audio chunk of size:', data.length);
  } else {
    console.log('Received text message:', data.toString().slice(0, 100));
  }
});

ws.on('error', (err) => {
  console.error('WebSocket Error:', err);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason?.toString());
  process.exit(0);
});
