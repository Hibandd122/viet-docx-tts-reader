import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol9 = VOLUMES.vol9 || {};

console.log("Checking how Mahiru addresses Amane in Volume 9:");
(vol9.chapters || []).forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');
    if (text.includes('Amane-kun')) {
      console.log(`[Ch ${chIdx + 1}] (p${bIdx}): "${text}"`);
    }
  });
});
