import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log("=== COMPREHENSIVE VOL 10 DIALOGUE AUDIT ===");

const targetedFixes = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  (ch.blocks || []).forEach((b, bIdx) => {
    if (b.type !== 'p') return;
    let text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // 1. Chapter 4: Amane & Chitose talking
    if (text.includes('Ý tớ là, nếu tụi này đến nhà mày thì Mahirun cũng sẽ có mặt ở đó luôn')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('nếu tụi này đến nhà mày thì Mahirun', 'nếu tụi tớ đến nhà Amane-kun thì Mahirun')
      });
    }

    if (text.includes('“Mục tiêu của mày chỉ là Mahiru thôi đúng không?”')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('Mục tiêu của mày chỉ là Mahiru', 'Mục tiêu của cậu chỉ là Mahiru')
      });
    }

    if (text.includes('Này, đừng có nhìn tao bằng cái ánh mắt của kẻ chiến thắng như thế chứ')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('đừng có nhìn tao bằng cái ánh mắt', 'đừng có nhìn tớ bằng cái ánh mắt')
      });
    }

    // 2. Chapter 10: Class students talking about Valentine chocolates
    if (text.includes('“Mày ơi, có đứa thực sự đang cá cược xem cậu ta sẽ nhận được bao nhiêu món quà kìa.”')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('Mày ơi, có đứa thực sự đang cá cược', 'Này cậu ơi, có đứa thực sự đang cá cược')
      });
    }

    if (text.includes('Mỗi lần cái đống quà đó cao thêm một chút là mọi người khác lại càng ghen tị hơn… hoặc mày sẽ nghĩ là như thế')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('hoặc mày sẽ nghĩ là như thế', 'hoặc ai cũng sẽ nghĩ là như thế')
      });
    }

    if (text.includes('Liệu cậu ta có thể vác hết đống đó về nhà nổi không nhỉ? Tao bắt đầu thấy lo rồi đấy. Ý tao là, tao ngờ rằng')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('Tao bắt đầu thấy lo rồi đấy. Ý tao là, tao ngờ rằng', 'Tớ bắt đầu thấy lo rồi đấy. Ý tớ là, tớ ngờ rằng')
      });
    }

    // 3. Chapter 10: Amane speaking to Itsuki & Chitose together
    if (text.includes('“Hai đứa chúng mày không thể nghiêm túc hơn được à…”')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('Hai đứa chúng mày không thể', 'Hai cậu không thể')
      });
    }

    if (text.includes('“Tụi này sẽ trả lại tiền cho mày mà, hứa đấy!”')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('trả lại tiền cho mày mà', 'trả lại tiền cho cậu mà')
      });
    }

    // 4. Chapter 8: Amane speaking to Itsuki & Chitose
    if (text.includes('tao sẽ để hai đứa chim cu chúng mày tự mình nói chuyện giải quyết ổn thỏa với nhau nhé')) {
      targetedFixes.push({
        chIdx, bIdx,
        oldText: text,
        newText: text.replace('hai đứa chim cu chúng mày tự mình', 'hai đứa chim cu chúng bay tự mình')
      });
    }

    // 5. Check other chapters for any accidental "mày / tao" with Mahiru or parents
    if (text.includes('Mahiru') && (text.includes('mày') || text.includes('tao'))) {
      console.log(`[Ch ${chIdx + 1}] Check Mahiru + mày/tao:`, text);
    }
  });
});

console.log(`\nIdentified ${targetedFixes.length} targeted pronoun fixes.`);
targetedFixes.forEach((f, idx) => {
  console.log(`\nFix #${idx + 1} (Ch ${f.chIdx + 1}, b ${f.bIdx}):`);
  console.log(`  OLD: "${f.oldText}"`);
  console.log(`  NEW: "${f.newText}"`);
});
