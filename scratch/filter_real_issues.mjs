import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

const realErrors = [];

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];
  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

      // 1. Check Kadowaki-san or Akazawa-san
      if (text.includes('Kadowaki-san')) {
        realErrors.push({ volId, chIdx, title, bIdx, text, type: 'KADOWAKI_SAN', fix: 'Change Kadowaki-san to Kadowaki-kun' });
      }
      if (text.includes('Akazawa-san')) {
        realErrors.push({ volId, chIdx, title, bIdx, text, type: 'AKAZAWA_SAN', fix: 'Change Akazawa-san to Akazawa-kun' });
      }

      // 2. Check quote balance
      const openCurly = (text.match(/“/g) || []).length;
      const closeCurly = (text.match(/”/g) || []).length;
      if (openCurly !== closeCurly) {
        realErrors.push({ volId, chIdx, title, bIdx, text, type: 'QUOTE_BALANCE', fix: `Unbalanced quotes: ${openCurly} open vs ${closeCurly} close` });
      }

      // 3. Check for any Amane-kun in Mahiru dialogue
      if (!title.toLowerCase().includes('lời bạt') && text.includes('Amane-kun')) {
        // Find if Mahiru is speaking
        const quotes = text.match(/“[^”]+”/g) || [];
        quotes.forEach(q => {
          if (q.includes('Amane-kun')) {
            if (/Mahiru|cô gái|cô bạn|cô thì thầm|cô dịu dàng|cô e thẹn/i.test(text) && !/Chitose|Chi-chan|Ikkun/i.test(text)) {
              realErrors.push({ volId, chIdx, title, bIdx, text, type: 'MAHIRU_AMANE_KUN', fix: `Mahiru said Amane-kun: ${q}` });
            }
          }
        });
      }

      // 4. Check for any actual "anh/em" in dialogue between Amane & Mahiru
      const quotes = text.match(/“[^”]+”/g) || [];
      quotes.forEach(q => {
        // Test if "anh" or "em" is used as pronoun
        if (/\b(anh|em)\b/i.test(q)) {
          // Exclude words like "quanh", "thanh", "tiết kiệm", "khen ngợi", "đem", "xem", "ném", "nếm", "kèm"
          if (/(?<!\w)(anh|em)(?!\w)/i.test(q)) {
            // Check if this dialogue is between Amane and Mahiru
            // It is NOT cafe (Fumika/Miyamoto/Oohashi)
            // It is NOT Itsuki-Chitose
            // It is NOT Souji-Ayaka
            // It is NOT Shihoko-Shuuto
            const isOther = /Ikkun|Chitose|Chi-chan|Itsuki|Souji|Ayaka|Fumika|Miyamoto|Oohashi|tiền bối|quán cà phê|bố|mẹ|Shihoko|Shuuto|Daiki|ông|bà/i.test(text);
            if (!isOther) {
              // Let's check who is speaking
              realErrors.push({ volId, chIdx, title, bIdx, text, type: 'ANH_EM_CHECK', fix: `Inspect quote: ${q}` });
            }
          }
        }
      });
    });
  });
}

console.log(`Found ${realErrors.length} potential items to inspect:`);
realErrors.forEach((err, idx) => {
  console.log(`\n#${idx + 1} [${err.type}] in [${err.volId} - ${err.title}] (p${err.bIdx}):`);
  console.log(`  Issue: ${err.fix}`);
  console.log(`  Text: "${err.text}"`);
});
