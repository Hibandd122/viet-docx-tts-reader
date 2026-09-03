import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("Checking for 'bà' referring to Shihoko across all volumes...");

for (const [volId, volData] of Object.entries(VOLUMES)) {
  (volData.chapters || []).forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    (ch.blocks || []).forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

      // Check sentences with "bà"
      if (/\bbà\b/i.test(text)) {
        // Exclude Koyuki (bà lão, bà Kujikawa, bà ấy - Koyuki)
        if (!title.includes('Koyuki') && !text.includes('Koyuki') && !text.includes('Kujikawa') && !text.includes('bà lão') && !text.includes('bà cụ')) {
          console.log(`\n[${volId} - ${title}] (p${bIdx}):`);
          console.log(`  "${text}"`);
        }
      }
    });
  });
}
