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

async function testSynthesis(voiceName, outputFormat = 'audio-24khz-48kbitrate-mono-mp3') {
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

    const audioBuffers = [];

    ws.on('open', () => {
      console.log(`[${voiceName}] WS open`);
      const date = new Date().toISOString();
      const configMsg = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${outputFormat}"}}}}`;
      ws.send(configMsg);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voiceName}'><prosody pitch='+0Hz' rate='+0%'>Xin chào bạn, tôi là giọng đọc Hoài My.</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(data);
        if (buf.length >= 2) {
          const headerLen = buf.readUInt16BE(0);
          if (buf.length > headerLen + 2) {
            const audioData = buf.subarray(headerLen + 2);
            audioBuffers.push(audioData);
            console.log(`[${voiceName}] Audio chunk: ${audioData.length} bytes`);
          }
        }
      } else {
        const str = data.toString();
        if (str.includes('Path:turn.end')) {
          console.log(`[${voiceName}] Turn ended! Total chunks: ${audioBuffers.length}`);
          ws.close();
          const total = Buffer.concat(audioBuffers);
          resolve(total);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[${voiceName}] WS error:`, err.message);
      reject(err);
    });

    ws.on('close', (code, reason) => {
      console.log(`[${voiceName}] WS closed with code ${code}, total bytes: ${Buffer.concat(audioBuffers).length}`);
      if (audioBuffers.length > 0) resolve(Buffer.concat(audioBuffers));
      else reject(new Error(`Closed with 0 bytes: ${code}`));
    });
  });
}

try {
  const result = await testSynthesis('vi-VN-HoaiMyNeural');
  console.log('🎉 SUCCESS! Synthesized audio bytes:', result.length);
} catch (e) {
  console.log('Failed vi-VN-HoaiMyNeural, testing full voice name...');
  try {
    const result2 = await testSynthesis('Microsoft Server Speech Text to Speech Voice (vi-VN, HoaiMyNeural)');
    console.log('🎉 SUCCESS with full name! Synthesized audio bytes:', result2.length);
  } catch (e2) {
    console.error('Failed both:', e2.message);
  }
}
