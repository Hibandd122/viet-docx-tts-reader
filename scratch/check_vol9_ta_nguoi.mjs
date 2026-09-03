import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("Checking first instances in Vol 9:");
const vol9 = VOLUMES.vol9 || {};
(vol9.chapters || []).forEach((ch, chIdx) => {
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');
    if (/\b(ngươi|ta)\b/i.test(text) && !/chúng ta|người ta|thật ra|tự ta/i.test(text)) {
      console.log(`[Ch ${chIdx + 1}] (p${bIdx}): "${text}"`);
    }
  });
});
