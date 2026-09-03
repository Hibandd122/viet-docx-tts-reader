import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

const trueAnomalies = [];

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];
  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const isAfterword = title.toLowerCase().includes('lời bạt');
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');
      const quotes = text.match(/“[^”]+”/g) || [];

      // 1. Mismatched quotes
      const openCurly = (text.match(/“/g) || []).length;
      const closeCurly = (text.match(/”/g) || []).length;
      if (openCurly !== closeCurly) {
        trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'MISMATCHED_QUOTES' });
      }

      // 2. Mahiru calling Amane "Amane-kun"
      if (!isAfterword && text.includes('Amane-kun')) {
        const isChitoseContext = /Chitose|Chi-chan|Ikkun/i.test(text);
        if (!isChitoseContext) {
          quotes.forEach(q => {
            if (q.includes('Amane-kun') && /Mahiru|cô gái|cô bạn|cô thì thầm|cô dịu dàng|cô e thẹn/i.test(text)) {
              trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'MAHIRU_AMANE_KUN', quote: q });
            }
          });
        }
      }

      // 3. Mày/tao with Mahiru
      quotes.forEach(q => {
        if (/(?<![a-zA-Zà-ỹÀ-Ỹ])(mày|tao)(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
          if (q.includes('Mahirun') || (q.includes('Mahiru') && /mày.*Mahiru\s*(ơi|à)|Mahiru.*(mày|tao)/i.test(q))) {
            trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'MAY_TAO_MAHIRU', quote: q });
          }
          if (q.includes('Chitose') && /(?<![a-zA-Zà-ỹÀ-Ỹ])mày(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
            trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'MAY_TAO_CHITOSE', quote: q });
          }
        }
      });

      // 4. Shihoko called bà
      if (text.includes('Shihoko')) {
        if (/(?<![a-zA-Zà-ỹÀ-Ỹ])bà(?![a-zA-Zà-ỹÀ-Ỹ])\s+(ấy|nói|cười|nhìn|thở|hỏi|mỉm|bảo|chớp)/i.test(text)) {
          trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'SHIHOKO_BA' });
        }
      }

      // 5. Koyuki using ta
      if (!isAfterword && text.includes('Koyuki')) {
        quotes.forEach(q => {
          const cleaned = q.replace(/chúng ta|người ta|thật ra|tự ta/gi, '');
          if (/(?<![a-zA-Zà-ỹÀ-Ỹ])ta(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(cleaned)) {
            trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'KOYUKI_TA', quote: q });
          }
        });
      }

      // 6. Akazawa-san / Kadowaki-san
      if (text.includes('Akazawa-san')) {
        trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'AKAZAWA_SAN' });
      }
      if (text.includes('Kadowaki-san')) {
        trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'KADOWAKI_SAN' });
      }

      // 7. Archaic ngươi
      quotes.forEach(q => {
        if (/(?<![a-zA-Zà-ỹÀ-Ỹ])ngươi(?![a-zA-Zà-ỹÀ-Ỹ])/i.test(q)) {
          trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'NGUOI', quote: q });
        }
      });

      // 8. JS artifacts
      if (/undefined|null|NaN|\[object Object\]/.test(text)) {
        trueAnomalies.push({ volId, chIdx, title, bIdx, text, type: 'JS_ARTIFACT' });
      }
    });
  });
}

console.log("================================================================");
console.log(`TOTAL REAL ANOMALIES FOUND ACROSS BOTH VOLUMES: ${trueAnomalies.length}`);
console.log("================================================================");

if (trueAnomalies.length === 0) {
  console.log("\n>>> ABSOLUTE PERFECTION: ZERO DEFECTS FOUND IN EITHER VOLUME 9 OR VOLUME 10! <<<\n");
} else {
  console.log("Anomalies found:", trueAnomalies);
}
