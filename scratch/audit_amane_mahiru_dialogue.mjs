import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log("Auditing Amane ↔ Mahiru dialogue in Vol 10...");

const sus = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  const blocks = ch.blocks || [];

  blocks.forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // If dialogue has anh/em between Amane & Mahiru
    if (/“[^”]*\b(anh|em)\b[^”]*”/i.test(text)) {
      // Check if it is not Chitose talking to Itsuki (Ikkun) or cafe staff
      if (!text.includes('Ikkun') && !text.includes('Fumika') && !text.includes('Miyamoto') && !text.includes('Oohashi')) {
        sus.push({ chIdx, title, bIdx, text });
      }
    }
  });
});

console.log(`Found ${sus.length} dialogue lines with anh/em (excluding obvious cafe/Ikkun):`);
sus.forEach((item, idx) => {
  console.log(`\n#${idx + 1} [${item.title}] (p${item.bIdx}):`);
  console.log(`  "${item.text}"`);
});
