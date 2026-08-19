import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const tts = new MsEdgeTTS();

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
    const voice = req.query?.voice || 'vi-VN-HoaiMyNeural';
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

    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text, {
      rate: ratePercent,
      pitch: pitchPercent
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');

    audioStream.pipe(res);
  } catch (err) {
    console.error('Vercel TTS error:', err);
    if (!res.headersSent) {
      res.status(500).send('TTS error: ' + err.message);
    } else {
      res.end();
    }
  }
}
