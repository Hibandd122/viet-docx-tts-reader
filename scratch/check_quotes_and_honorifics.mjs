import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

const issues1to50 = [];

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];
  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

      // Check quote balance
      const openCurly = (text.match(/“/g) || []).length;
      const closeCurly = (text.match(/”/g) || []).length;
      if (openCurly !== closeCurly) {
        issues1to50.push({ volId, chIdx, title, bIdx, text, type: 'QUOTE_BALANCE', fix: `Unbalanced quotes: ${openCurly} open vs ${closeCurly} close` });
      }

      // Check Kadowaki-san or Akazawa-san
      if (text.includes('Kadowaki-san') || text.includes('Akazawa-san')) {
        issues1to50.push({ volId, chIdx, title, bIdx, text, type: 'HONORIFIC', fix: text });
      }
    });
  });
}

console.log(`Total Quote / Honorific Issues: ${issues1to50.length}`);
issues1to50.forEach((item, i) => {
  console.log(`[#${i + 1}] [${item.type}] in [${item.volId} - ${item.title}] (p${item.bIdx}):`);
  console.log(`  Fix: ${item.fix}\n`);
});
