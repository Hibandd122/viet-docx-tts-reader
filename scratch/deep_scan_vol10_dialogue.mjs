import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log(`Starting deep scan across all ${chapters.length} chapters of Vol 10...\n`);

const fixes = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // Search for quoted dialogue lines
    const quotes = text.match(/“[^”]+”/g) || [];
    quotes.forEach(q => {
      // If quote contains mày or tao
      if (/\b(mày|tao)\b/i.test(q)) {
        fixes.push({
          chIdx,
          title,
          bIdx,
          fullText: text,
          quote: q
        });
      }
    });
  });
});

console.log(`Found ${fixes.length} quotes containing 'mày' or 'tao':\n`);
fixes.forEach((f, i) => {
  console.log(`--- [${i + 1}] [${f.title}] (p${f.bIdx}) ---`);
  console.log(`Quote: ${f.quote}`);
  console.log(`Paragraph: ${f.fullText}\n`);
});
