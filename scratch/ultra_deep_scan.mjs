import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("================================================================");
console.log("        ULTRA-DEEP COMPREHENSIVE SCAN FOR VOL 9 & VOL 10        ");
console.log("================================================================\n");

const report = {
  totalVolumes: 0,
  totalChapters: 0,
  totalParagraphs: 0,
  totalWords: 0,
  findings: []
};

for (const [volId, volData] of Object.entries(VOLUMES)) {
  report.totalVolumes++;
  const chapters = volData.chapters || [];
  console.log(`Analyzing [${volId}] "${volData.title || ''}" (${chapters.length} chapters)...`);

  chapters.forEach((ch, chIdx) => {
    report.totalChapters++;
    const title = ch.title || `Chương ${chIdx + 1}`;
    const isAfterword = title.toLowerCase().includes('lời bạt');
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      report.totalParagraphs++;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');
      const words = text.split(/\s+/).filter(Boolean).length;
      report.totalWords += words;

      // Extract all dialogue quotes
      const quotes = text.match(/“[^”]+”/g) || [];

      // ======================================================================
      // 1. QUOTE BALANCE CHECK (Unclosed or mismatched quotes)
      // ======================================================================
      const openCurly = (text.match(/“/g) || []).length;
      const closeCurly = (text.match(/”/g) || []).length;
      if (openCurly !== closeCurly) {
        report.findings.push({
          volId, chIdx, title, bIdx, text,
          severity: 'HIGH',
          category: 'PUNCTUATION_BALANCE',
          issue: `Mismatched quotation marks: ${openCurly} open “ vs ${closeCurly} close ”`
        });
      }

      // ======================================================================
      // 2. PRONOUN AUDIT: Amane ↔ Mahiru
      // ======================================================================
      if (!isAfterword && text.includes('Amane-kun')) {
        const isChitoseContext = /Chitose|Chi-chan|Ikkun/i.test(text);
        if (!isChitoseContext) {
          quotes.forEach(q => {
            if (q.includes('Amane-kun')) {
              if (/Mahiru|cô gái|cô bạn|cô thì thầm|cô dịu dàng|cô e thẹn|bạn gái/i.test(text)) {
                report.findings.push({
                  volId, chIdx, title, bIdx, text,
                  severity: 'HIGH',
                  category: 'PRONOUN_MAHIRU_AMANE',
                  issue: `Mahiru calling "Amane-kun" instead of "Amane" in dialogue: ${q}`
                });
              }
            }
          });
        }
      }

      // Check if Amane or Mahiru use "anh/em" between each other
      if (!isAfterword) {
        quotes.forEach(q => {
          if (/(?<![a-zA-Zà-ỹÀ-Ỹ])(anh|em)(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
            // Exclude Cafe, Itsuki-Chitose, Souji-Ayaka, Parents
            const isKnownCoupleOrSenior = /Ikkun|Chitose|Chi-chan|Itsuki|Souji|Ayaka|Fumika|Miyamoto|Oohashi|Itomaki|tiền bối|quán cà phê|bố|mẹ|Shihoko|Shuuto/i.test(text);
            if (!isKnownCoupleOrSenior) {
              // Exclude quotes referring to Itsuki's brother ("anh trai")
              if (!q.includes('anh trai')) {
                report.findings.push({
                  volId, chIdx, title, bIdx, text,
                  severity: 'MEDIUM',
                  category: 'PRONOUN_ANH_EM_SUSPECT',
                  issue: `Suspect "anh/em" in dialogue: ${q}`
                });
              }
            }
          }
        });
      }

      // ======================================================================
      // 3. PRONOUN AUDIT: Mày / Tao Boundaries
      // ======================================================================
      quotes.forEach(q => {
        if (/(?<![a-zA-Zà-ỹÀ-Ỹ])(mày|tao)(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
          if (q.includes('Mahirun') || (q.includes('Mahiru') && /mày.*Mahiru\s*(ơi|à)|Mahiru.*(mày|tao)/i.test(q))) {
            report.findings.push({
              volId, chIdx, title, bIdx, text,
              severity: 'CRITICAL',
              category: 'PRONOUN_MAY_TAO_MAHIRU',
              issue: `"mày/tao" directed at Mahiru: ${q}`
            });
          }
          if (q.includes('Chitose') && /(?<![a-zA-Zà-ỹÀ-Ỹ])mày(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
            report.findings.push({
              volId, chIdx, title, bIdx, text,
              severity: 'HIGH',
              category: 'PRONOUN_MAY_TAO_CHITOSE',
              issue: `"mày" directed at Chitose: ${q}`
            });
          }
        }
      });

      // ======================================================================
      // 4. PRONOUN AUDIT: Shihoko Narration ("bà" vs "mẹ cậu / cô")
      // ======================================================================
      if (text.includes('Shihoko')) {
        if (/(?<![a-zA-Zà-ỹÀ-Ỹ])bà(?![a-zA-Zà-ỹÀ-Ỹ])\s+(ấy|nói|cười|nhìn|thở|hỏi|mỉm|bảo|chớp)/i.test(text)) {
          report.findings.push({
            volId, chIdx, title, bIdx, text,
            severity: 'HIGH',
            category: 'PRONOUN_SHIHOKO_BA',
            issue: `Shihoko called "bà" in narration: "${text.substring(0, 100)}..."`
          });
        }
      }

      // ======================================================================
      // 5. PRONOUN AUDIT: Koyuki ("ta" vs "bác / bà")
      // ======================================================================
      if (!isAfterword && text.includes('Koyuki')) {
        quotes.forEach(q => {
          const cleaned = q.replace(/chúng ta|người ta|thật ra|tự ta/gi, '');
          if (/(?<![a-zA-Zà-ỹÀ-Ỹ])ta(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(cleaned)) {
            report.findings.push({
              volId, chIdx, title, bIdx, text,
              severity: 'HIGH',
              category: 'PRONOUN_KOYUKI_TA',
              issue: `Koyuki using archaic "ta": ${q}`
            });
          }
        });
      }

      // ======================================================================
      // 6. PRONOUN AUDIT: Mahiru addressing Classmates
      // ======================================================================
      if (text.includes('Akazawa-san')) {
        report.findings.push({
          volId, chIdx, title, bIdx, text,
          severity: 'MEDIUM',
          category: 'PRONOUN_AKAZAWA_SAN',
          issue: `Found "Akazawa-san" (should be "Akazawa-kun")`
        });
      }
      if (text.includes('Kadowaki-san')) {
        report.findings.push({
          volId, chIdx, title, bIdx, text,
          severity: 'MEDIUM',
          category: 'PRONOUN_KADOWAKI_SAN',
          issue: `Found "Kadowaki-san" (should be "Kadowaki-kun")`
        });
      }

      // ======================================================================
      // 7. ARCHAIC / FANTASY PRONOUNS ("ngươi")
      // ======================================================================
      quotes.forEach(q => {
        if (/(?<![a-zA-Zà-ỹÀ-Ỹ])ngươi(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
          report.findings.push({
            volId, chIdx, title, bIdx, text,
            severity: 'HIGH',
            category: 'PRONOUN_NGUOI',
            issue: `Archaic "ngươi" in dialogue: ${q}`
          });
        }
      });
    });
  });
}

console.log("\n================================================================");
console.log("                      SCAN METRICS SUMMARY                      ");
console.log("================================================================");
console.log(`Total Volumes Scanned:   ${report.totalVolumes}`);
console.log(`Total Chapters/Sections: ${report.totalChapters}`);
console.log(`Total Paragraphs:        ${report.totalParagraphs}`);
console.log(`Total Words Analyzed:    ${report.totalWords.toLocaleString()} words`);
console.log(`Total Issues Flagged:    ${report.findings.length}`);
console.log("================================================================\n");

if (report.findings.length > 0) {
  console.log("DETAILED FINDINGS LIST:\n");
  report.findings.forEach((f, i) => {
    console.log(`[#${i + 1}] [${f.severity}] [${f.category}] in [${f.volId} - ${f.title}] (p${f.bIdx}):`);
    console.log(`  Issue: ${f.issue}`);
    console.log(`  Snippet: "${f.text.substring(0, 120)}..."\n`);
  });
} else {
  console.log(">>> ALL CHECKS PASSED WITH FLYING COLORS! ZERO DEFECTS FOUND! <<<");
}
