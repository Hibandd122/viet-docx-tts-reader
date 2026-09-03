import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('volumes.js', 'utf-8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const VOLUMES = sandbox.window.VOLUMES || {};
const vol10 = VOLUMES.vol10 || {};
const chapters = vol10.chapters || [];

console.log("Analyzing all dialogue scenes in Vol 10...");

const errors = [];

chapters.forEach((ch, chIdx) => {
  const title = ch.title || `Chương ${chIdx + 1}`;
  const blocks = ch.blocks || [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'p') continue;
    const text = b.text || (b.runs ? b.runs.map(r => r.text).join('') : '');

    // Check 1: In Chapter 4 p76 & p77: Chitose and Amane talking
    if (text.includes('Ý tớ là, nếu tụi này đến nhà mày thì Mahirun')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Chitose talking to Amane: change "nhà mày" to "nhà Amane-kun" or "nhà cậu", "tụi này" to "tụi tớ"' });
    }
    if (text.includes('Mục tiêu của mày chỉ là Mahiru thôi đúng không?')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Amane talking to Chitose: change "mày" to "cậu"' });
    }
    if (text.includes('Này, đừng có nhìn tao bằng cái ánh mắt của kẻ chiến thắng như thế chứ')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Amane talking to Chitose: change "tao" to "tớ"' });
    }

    // Check 2: In Chapter 10 p7:
    if (text.includes('Mày ơi, có đứa thực sự đang cá cược')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Student talking in class: change "Mày ơi" to "Này cậu ơi"' });
    }
    if (text.includes('hoặc mày sẽ nghĩ là như thế')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Student talking in class: change "hoặc mày sẽ nghĩ" to "hoặc người ta sẽ nghĩ"' });
    }
    if (text.includes('Tao bắt đầu thấy lo rồi đấy. Ý tao là, tao ngờ rằng')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Student in class talking to friend: change to "Tớ bắt đầu thấy lo rồi đấy. Ý tớ là, tớ ngờ rằng"' });
    }

    // Check 3: In Chapter 10 p192 & p193:
    if (text.includes('Hai đứa chúng mày không thể nghiêm túc hơn được à')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Amane talking to Itsuki & Chitose: change "Hai đứa chúng mày" to "Hai cậu"' });
    }
    if (text.includes('Tụi này sẽ trả lại tiền cho mày mà, hứa đấy!')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Chitose & Itsuki: change "cho mày mà" to "cho Amane-kun mà" or "cho cậu mà"' });
    }

    // Check 4: Chapter 8 p81: Amane leaving Itsuki & Chitose alone
    if (text.includes('tao sẽ để hai đứa chim cu chúng mày tự mình nói chuyện')) {
      errors.push({ chIdx, title, bIdx: i, text, fix: 'Amane talking to Itsuki & Chitose: change "chúng mày" to "hai người / hai đứa chim cu"' });
    }

    // Check 5: General scan for any "mày" or "tao" in chapters 1, 3, 5, 6, 7 (where Itsuki is not present or when speaking with parents/cafe/Mahiru)
  }
});

console.log(`Found specific errors:`, errors);
