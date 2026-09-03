import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol9 = VOLUMES.vol9 || {};

console.log("=== EXHAUSTIVE PRONOUN AUDIT FOR VOLUME 9 ===");

const vol9Fixes = [];

(vol9.chapters || []).forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // 1. Check for "bà" referring to Shihoko
    if (/bà chớp mắt|bà ấy.*Shihoko|Shihoko.*bà ấy|\bbà\b.*Shihoko/i.test(text)) {
      vol9Fixes.push({
        chIdx, title, bIdx, text,
        type: 'SHIHOKO_BA',
        desc: 'Shihoko called "bà"'
      });
    }

    // 2. Check for Koyuki using "ta"
    if (/Koyuki.*ta\b|ta gặp|ta đoán|ta không còn|ta thực sự/i.test(text)) {
      vol9Fixes.push({
        chIdx, title, bIdx, text,
        type: 'KOYUKI_TA',
        desc: 'Koyuki using "ta"'
      });
    }

    // 3. Check for Itsuki using "bọn mày" with Kadowaki or Chitose
    if (/sao bọn mày có thể thản nhiên/i.test(text)) {
      vol9Fixes.push({
        chIdx, title, bIdx, text,
        type: 'ITSUKI_MAY',
        desc: 'Itsuki saying "bọn mày" to Kadowaki'
      });
    }

    // 4. Check for Amane/Mahiru using wrong pronouns
    if (/“[^”]*\b(anh|em)\b[^”]*”/i.test(text)) {
      if (!/Ikkun|Chitose|Fumika|Miyamoto|Oohashi|tiền bối|quán cà phê|bố|mẹ|Shihoko|Shuuto|Ayaka|Souji/i.test(text)) {
        vol9Fixes.push({
          chIdx, title, bIdx, text,
          type: 'ANH_EM',
          desc: 'Possible Amane/Mahiru anh-em'
        });
      }
    }
  });
});

console.log(`Found ${vol9Fixes.length} potential fixes in Volume 9:`);
vol9Fixes.forEach((f, idx) => {
  console.log(`\n#${idx + 1} [${f.title}] (p${f.bIdx}) [${f.type}]: ${f.desc}`);
  console.log(`  "${f.text}"`);
});
