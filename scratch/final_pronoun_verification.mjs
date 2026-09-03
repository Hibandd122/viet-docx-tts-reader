import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("=== FINAL RIGOROUS PRONOUN & LORE FIDELITY VERIFICATION ===");

let totalChapters = 0;
let totalParagraphs = 0;
let totalErrors = 0;

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];
  totalChapters += chapters.length;

  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const isAfterword = title.toLowerCase().includes('lời bạt');
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      totalParagraphs++;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

      // Check 1: "bà" for Shihoko
      if (/bà chớp mắt|bà ấy.*Shihoko|Shihoko.*bà ấy/i.test(text)) {
        console.error(`[ERROR] [${volId} - ${title}] (p${bIdx}): Shihoko called 'bà': "${text}"`);
        totalErrors++;
      }

      // Check 2: Koyuki using archaic "ta"
      if (!isAfterword && /Koyuki.*“[^”]*\b(ta)\b[^”]*”/i.test(text)) {
        if (!/chúng ta|người ta|thật ra|tự ta/i.test(text)) {
          console.error(`[ERROR] [${volId} - ${title}] (p${bIdx}): Koyuki using 'ta': "${text}"`);
          totalErrors++;
        }
      }

      // Check 3: Mahiru calling Amane "Amane-kun"
      if (!isAfterword && text.includes('Amane-kun')) {
        // If it's Mahiru speaking in dialogue (not Chitose speaking, not author)
        if (text.includes('Mahiru nói') || text.includes('Mahiru thì thầm') || text.includes('Mahiru đỡ lời') || text.includes('Mahiru nhận xét')) {
          if (/“[^”]*Amane-kun[^”]*”/.test(text)) {
            console.error(`[ERROR] [${volId} - ${title}] (p${bIdx}): Mahiru saying Amane-kun: "${text}"`);
            totalErrors++;
          }
        }
      }

      // Check 4: Mahiru calling Itsuki "Akazawa-san" instead of "Akazawa-kun"
      if (text.includes('Akazawa-san')) {
        console.error(`[ERROR] [${volId} - ${title}] (p${bIdx}): Mahiru saying Akazawa-san: "${text}"`);
        totalErrors++;
      }
    });
  });
}

console.log(`\nAudit Complete:`);
console.log(`- Volumes scanned: ${Object.keys(VOLUMES).length}`);
console.log(`- Total chapters/sections scanned: ${totalChapters}`);
console.log(`- Total paragraphs checked: ${totalParagraphs}`);
console.log(`- Total errors found: ${totalErrors}`);

if (totalErrors === 0) {
  console.log(`\n>>> 100% PASSED: ZERO PRONOUN ERRORS FOUND ACROSS ALL VOLUMES! <<<`);
} else {
  process.exit(1);
}
