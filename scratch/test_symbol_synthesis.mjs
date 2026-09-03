import { synthesizeEdgeTTS, isSpeakableText, cleanTextForTTS, isSceneBreakDivider } from '../api/tts.js';

console.log('Testing Scene Break & Symbol Synthesis:');

const testCases = [
  '✧ ₊ ✦ ₊ ✧',
  '◆ ◆ ◆',
  'Amane nhìn Mahiru với vẻ dịu dàng ✧ ₊ ✦ ₊ ✧ rồi mỉm cười.',
  'Mahiru ngượng ngùng cúi đầu... 🔖',
  '✦ ₊ ✧ ₊ ✦'
];

for (const t of testCases) {
  const isDivider = isSceneBreakDivider(t);
  const isSpeakable = isSpeakableText(t);
  const cleaned = cleanTextForTTS(t);
  console.log(`\nInput: "${t}"`);
  console.log(`  -> isDivider: ${isDivider}, isSpeakable: ${isSpeakable}`);
  console.log(`  -> cleaned: "${cleaned}"`);

  const buf = await synthesizeEdgeTTS(t, 'vi-VN-HoaiMyNeural', '+0%', '+0Hz');
  console.log(`  -> synthesizeEdgeTTS returned buffer: ${buf.length} bytes`);
}

console.log('\nAll symbol synthesis tests passed successfully!');
