import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("=== COMPREHENSIVE PRONOUN AUDIT FOR ALL VOLUMES ===");

const allIssues = [];

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];
  console.log(`\nVolume: ${volId} (${volData.title || ''}) - ${chapters.length} chapters/sections`);

  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const isAfterword = title.toLowerCase().includes('lời bạt');
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type !== 'p') return;
      const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');
      const quotes = text.match(/“[^”]+”/g) || [];

      // 1. Check for "mày" or "tao"
      if (/\b(mày|tao)\b/i.test(text)) {
        // If not Amane talking to Itsuki or vice versa
        // Check text content
        allIssues.push({
          volId, chIdx, title, bIdx, text,
          type: 'MAY_TAO',
          desc: 'Contains mày or tao'
        });
      }

      // 2. Check for "ta / ngươi"
      if (/\b(ngươi)\b/i.test(text) || /\b(ta)\b/i.test(text)) {
        // Exclude words like "tác giả", "chúng ta", "tại", "tam", "tàn", "tạo", "tay", "tai", "tắm", "tản", "tầng", "tất cả", "tạp"
        if (/\b(ngươi)\b/i.test(text) || /(?<!chúng\s+)\b(ta)\b(?!\s+(sao|sao|đây|nói|thấy|nghĩ|biết))/i.test(text)) {
          // Check if it is ancient/historical roleplay or error
          if (!isAfterword) {
            allIssues.push({
              volId, chIdx, title, bIdx, text,
              type: 'TA_NGUOI',
              desc: 'Contains ta / ngươi'
            });
          }
        }
      }

      // 3. Check for 1st person narration "tôi"
      if (/\b(tôi)\b/i.test(text) && !isAfterword) {
        // Check if "tôi" is inside quote or narration
        const withoutQuotes = text.replace(/“[^”]+”/g, '').replace(/"[^"]+"/g, '');
        // Exclude "tôi luyện", "tối", "tội"
        if (/\btôi\b(?! luyện)/i.test(withoutQuotes)) {
          allIssues.push({
            volId, chIdx, title, bIdx, text,
            type: 'TOI_NARRATION',
            desc: 'Contains "tôi" in narration'
          });
        }
      }

      // 4. Check for "bà" referring to Shihoko
      if (/bà Shihoko|bà ấy.*Shihoko|Shihoko.*bà ấy/i.test(text)) {
        allIssues.push({
          volId, chIdx, title, bIdx, text,
          type: 'BA_SHIHOKO',
          desc: 'Calling Shihoko "bà"'
        });
      }

      // 5. Check for "anh / em" in quotes where Mahiru and Amane are talking alone
      if (/“[^”]*\b(anh|em)\b[^”]*”/i.test(text)) {
        // If chapter is not at cafe and doesn't mention Itsuki/Chitose/Souji/Ayaka/Miyamoto/Oohashi/Fumika/Shihoko
        if (!/Itsuki|Ikkun|Chitose|Chi-chan|Souji|Ayaka|Fumika|Miyamoto|Oohashi|tiền bối|quán cà phê|bố|mẹ|Shihoko|Shuuto/i.test(text)) {
          allIssues.push({
            volId, chIdx, title, bIdx, text,
            type: 'ANH_EM_SUSPECT',
            desc: 'Suspect anh/em in dialogue'
          });
        }
      }
    });
  });
}

console.log(`\nFound ${allIssues.length} flagged paragraphs.`);

const grouped = {};
allIssues.forEach(item => {
  grouped[item.type] = (grouped[item.type] || 0) + 1;
});
console.log("Summary by category:", grouped);
