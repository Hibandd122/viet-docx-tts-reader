import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log(`Analyzing all paragraphs with "mày" or "tao" in Volume 10:`);

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    if (/\b(mày|tao)\b/i.test(text)) {
      console.log(`\n==================================================`);
      console.log(`[Chương ${chIdx + 1}: ${title}] (Đoạn ${bIdx + 1}):`);
      console.log(text);
      
      // Print context: previous paragraph and next paragraph
      if (bIdx > 0) {
        const prev = ch.blocks[bIdx - 1];
        const prevText = prev.text || (prev.runs ? prev.runs.map(r => r.text).join('') : '');
        console.log(`   [Bối cảnh trước]: "${prevText}"`);
      }
      if (bIdx < ch.blocks.length - 1) {
        const next = ch.blocks[bIdx + 1];
        const nextText = next.text || (next.runs ? next.runs.map(r => r.text).join('') : '');
        console.log(`   [Bối cảnh sau]: "${nextText}"`);
      }
    }
  });
});
