import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("Checking all instances of 'Amane-kun' across all volumes...");

for (const [volId, volData] of Object.entries(VOLUMES)) {
  (volData.chapters || []).forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    (ch.blocks || []).forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

      if (text.includes('Amane-kun')) {
        console.log(`\n[${volId} - ${title}] (p${bIdx}):`);
        console.log(`  "${text}"`);
      }
    });
  });
}
