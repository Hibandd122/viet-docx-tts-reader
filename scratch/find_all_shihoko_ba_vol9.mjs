import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol9 = VOLUMES.vol9 || {};
const chapters = vol9.chapters || [];

console.log("Searching for any 'bà' referring to Shihoko in Vol 9:");

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // Check for "của bà", "lời bà", "với bà", "bà ấy", "bà nhìn", "bà nói"
    if (/\b(bà ấy|của bà|lời bà|với bà|bà nhìn|bà nói|bà hỏi|bà cười|bà mỉm|bà thở|bà khẽ)\b/i.test(text)) {
      // Exclude Koyuki (in Ch 8)
      if (chIdx !== 7 && chIdx !== 8 && chIdx !== 9) {
        console.log(`\n[Ch ${chIdx + 1}: ${title}] (p${bIdx}):`);
        console.log(`  "${text}"`);
      }
    }
  });
});
