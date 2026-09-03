import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log(`Auditing Volume 10 pronoun consistency...`);

const issues = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // Check 1: Chitose using mày/tao
    // Check 2: Amane using mày/tao with Mahiru, Chitose, Kadowaki, parents
    // Check 3: Mahiru using mày/tao/anh/em
    // Check 4: "bà" referring to Shihoko
    // Check 5: "mày/tao" in group context including girls
    
    // Pattern search:
    const checks = [
      { pattern: /tiền cho mày mà/i, desc: 'Chitose/Itsuki saying "cho mày mà" to Amane (Chitose is present)' },
      { pattern: /chúng mày/i, desc: '"chúng mày" addressed to mixed group' },
      { pattern: /mày ơi/i, desc: '"mày ơi" in general narration or conversation' },
      { pattern: /bà Shihoko|bà ấy.*Shihoko|Shihoko.*bà ấy/i, desc: 'Calling Shihoko "bà"' },
      { pattern: /Mahiru.*(mày|tao)|(mày|tao).*Mahiru/i, desc: 'mày/tao in proximity to Mahiru' }
    ];

    checks.forEach(c => {
      if (c.pattern.test(text)) {
        issues.push({ chIdx, title, bIdx, text, desc: c.desc });
      }
    });
  });
});

console.log(`Found ${issues.length} potential issues:`);
issues.forEach((item, idx) => {
  console.log(`\n#${idx + 1} [${item.title}] (p${item.bIdx}): ${item.desc}`);
  console.log(`  "${item.text}"`);
});
