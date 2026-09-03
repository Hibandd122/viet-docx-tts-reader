import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("=== DETAILED PRONOUN CLASSIFICATION & DISCREPANCY AUDIT ===");

const invalidPronouns = [];

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];

  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const isAfterword = title.toLowerCase().includes('lời bạt');
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

      // 1. Check for "ngươi" (always unnatural in modern slice-of-life)
      if (/\b(ngươi)\b/i.test(text)) {
        invalidPronouns.push({
          volId, chIdx, title, bIdx, text,
          reason: 'Contains "ngươi" (ancient/unnatural)'
        });
      }

      // 2. Check for "ta" as singular pronoun in dialogue (unless part of "chúng ta", "người ta", "tự ta", "thật ra", "bộ ba", "làn da", "thị giác")
      const taMatches = text.match(/“[^”]*\b(ta)\b[^”]*”/g) || [];
      taMatches.forEach(q => {
        // Exclude "chúng ta", "người ta", "thật ra", "tự ta"
        const cleanedQ = q.replace(/chúng ta|người ta|thật ra|tự ta/gi, '');
        if (/\bta\b/i.test(cleanedQ)) {
          // Check if used as self-referential archaic pronoun
          if (/\b(ta|ta đây)\b/i.test(cleanedQ)) {
            invalidPronouns.push({
              volId, chIdx, title, bIdx, text,
              reason: `Contains standalone "ta" in dialogue: ${q}`
            });
          }
        }
      });

      // 3. Check for mày / tao in dialogues NOT between Amane and Itsuki
      const mayTaoMatches = text.match(/“[^”]*\b(mày|tao)\b[^”]*”/g) || [];
      if (mayTaoMatches.length > 0) {
        // Check if Chitose or Mahiru or Ayaka is the speaker or addressee
        // We will inspect each one
      }
    });
  });
}

console.log(`\nFound ${invalidPronouns.length} definite pronoun anomalies (ta/ngươi):`);
invalidPronouns.forEach((item, i) => {
  console.log(`\n[#${i + 1}] [${item.volId} - ${item.title}] (p${item.bIdx}): ${item.reason}`);
  console.log(`  "${item.text}"`);
});
