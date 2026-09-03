import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};

console.log("=== CHECKING SCENE BREAKS & DECORATIVE SYMBOLS IN VOL 9 & 10 ===");

let dividerCount = 0;
let sceneBreakParagraphs = 0;

for (const [volId, volData] of Object.entries(VOLUMES)) {
  const chapters = volData.chapters || [];
  chapters.forEach((ch, chIdx) => {
    const title = ch.title || `Chương ${chIdx + 1}`;
    const blocks = ch.blocks || [];

    blocks.forEach((b, bIdx) => {
      if (b.type === 'divider') {
        dividerCount++;
      } else if (b.type === 'p') {
        const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');
        // Check if text is a decorative scene break
        if (/^[✧✦₊★☆♡♥♪♫✿❀❁❃❄❅❆❇❈❉❊❋▲▼◀▶◆◇■□●○◎✪✫✬✭✮✯✰※†‡~～〰=_*^#§•·\\/|\s\-—–]+$/.test(text)) {
          sceneBreakParagraphs++;
          console.log(`[${volId} - ${title}] (p${bIdx}): Scene break paragraph: "${text}"`);
        }
      }
    });
  });
}

console.log(`\nTotal 'divider' blocks: ${dividerCount}`);
console.log(`Total decorative scene break 'p' blocks: ${sceneBreakParagraphs}`);
