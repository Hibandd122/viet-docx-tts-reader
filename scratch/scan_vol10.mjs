import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log(`Total chapters in Vol 10: ${chapters.length}`);

const mayTaoWithMahiru = [];
const allMayTao = [];
const toiIssues = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // Check for mày / tao
    if (/\b(mày|tao)\b/i.test(text)) {
      allMayTao.push({ chIdx, title, bIdx, text });
      // If Mahiru or Amane talking to girl/family or in non-Itsuki context
      if (/mahiru|thiên sứ|cô gái|bạn gái|mẹ|bố|shihoko|chitose|em/i.test(text)) {
        mayTaoWithMahiru.push({ chIdx, title, bIdx, text });
      }
    }

    // Check for 1st person narration "tôi"
    if (/\b(tôi)\b/i.test(text)) {
      toiIssues.push({ chIdx, title, bIdx, text });
    }
  });
});

console.log(`\n=== TOTAL 'MÀY/TAO' PARAGRAPHS IN VOL 10: ${allMayTao.length} ===`);
allMayTao.forEach(item => {
  console.log(`\n[${item.title}] (p${item.bIdx}):`);
  console.log(`  "${item.text}"`);
});

console.log(`\n=== TOTAL 'TÔI' PARAGRAPHS IN VOL 10: ${toiIssues.length} ===`);
toiIssues.forEach(item => {
  console.log(`\n[${item.title}] (p${item.bIdx}):`);
  console.log(`  "${item.text}"`);
});
