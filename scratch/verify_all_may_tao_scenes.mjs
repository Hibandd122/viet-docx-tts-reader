import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log("Checking all remaining mày/tao scenes...");

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  const blocks = ch.blocks || [];

  blocks.forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    if (/\b(mày|tao)\b/i.test(text)) {
      // Check surrounding 3 paragraphs to identify who is speaking
      const start = Math.max(0, bIdx - 2);
      const end = Math.min(blocks.length, bIdx + 3);
      const surrounding = blocks.slice(start, end).map((blk, idx) => `      [${start + idx}] ${(blk.text || (blk.runs ? blk.runs.map(r => r.text).join('') : '')).substring(0, 100)}...`).join('\n');

      console.log(`\n[Ch ${chIdx + 1}: ${title}] (p${bIdx}):`);
      console.log(`   Text: "${text}"`);
      console.log(`   Context:\n${surrounding}`);
    }
  });
});
