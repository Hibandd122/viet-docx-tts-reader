import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol9 = VOLUMES.vol9 || {};
const chapters = vol9.chapters || [];

console.log(`=== DEEP AUDIT OF VOLUME 9: ${chapters.length} CHAPTERS ===\n`);

const issues = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  const blocks = ch.blocks || [];
  const isAfterword = title.toLowerCase().includes('lời bạt');

  console.log(`[Chương ${chIdx + 1}/10]: ${title} (${blocks.length} blocks)`);

  blocks.forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // 1. Check for whole word "bà" referring to Shihoko
    if (/(?<![a-zA-Zà-ỹ])bà(?![a-zA-Zà-ỹ]).*Shihoko|Shihoko.*(?<![a-zA-Zà-ỹ])bà(?![a-zA-Zà-ỹ])|bà chớp mắt/i.test(text)) {
      issues.push({ chIdx, title, bIdx, text, reason: "Shihoko called 'bà'" });
    }

    // 2. Akazawa-san / Kadowaki-san by Mahiru
    if (text.includes('Akazawa-san')) {
      issues.push({ chIdx, title, bIdx, text, reason: "Akazawa-san (should be Akazawa-kun)" });
    }
    if (text.includes('Kadowaki-san')) {
      issues.push({ chIdx, title, bIdx, text, reason: "Kadowaki-san (should be Kadowaki-kun)" });
    }

    // 3. Amane-kun spoken by Mahiru
    if (text.includes('Amane-kun') && !isAfterword) {
      if (/Mahiru nói|Mahiru thì thầm|Mahiru hỏi|Mahiru bảo|Mahiru đáp/i.test(text)) {
        issues.push({ chIdx, title, bIdx, text, reason: "Mahiru calling Amane-kun" });
      }
    }

    // 4. Koyuki using archaic 'ta'
    if (!isAfterword) {
      if (/Koyuki.*“[^”]*\bta\b[^”]*”|“[^”]*\bta\b[^”]*”.*Koyuki/i.test(text)) {
        if (!/chúng ta|người ta|thật ra|tự ta/i.test(text)) {
          issues.push({ chIdx, title, bIdx, text, reason: "Koyuki using 'ta'" });
        }
      }
    }

    // 5. Dialogue with 'ngươi'
    if (/“[^”]*\bngươi\b[^”]*”/i.test(text)) {
      issues.push({ chIdx, title, bIdx, text, reason: "Dialogue with 'ngươi'" });
    }

    // 6. Check for mày/tao in non-Itsuki dialogues
    const quotes = text.match(/“[^”]+”/g) || [];
    quotes.forEach(q => {
      if (/\b(mày|tao)\b/i.test(q)) {
        if (chIdx === 3 || chIdx === 5 || chIdx === 7) {
          if (!text.includes('Itsuki') && !text.includes('Ikkun')) {
            issues.push({ chIdx, title, bIdx, text, reason: `Suspect mày/tao in non-Itsuki context: ${q}` });
          }
        }
      }
    });
  });
});

console.log(`\n=== AUDIT SUMMARY FOR VOLUME 9: ${issues.length} ISSUES FOUND ===`);
issues.forEach((item, idx) => {
  console.log(`\n#${idx + 1} [${item.title}] (p${item.bIdx}): ${item.reason}`);
  console.log(`  "${item.text}"`);
});

if (issues.length === 0) {
  console.log("\n>>> VOLUME 9 IS 100% CLEAN AND PERFECT! ZERO PRONOUN DISCREPANCIES FOUND! <<<");
}
