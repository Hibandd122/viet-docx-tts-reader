import re
import json

# Read volumes.js
with open('volumes.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Execute JS in node to get clean JSON representation
import subprocess
res = subprocess.run(['node', '-e', '''
import fs from "node:fs";
import vm from "node:vm";
const code = fs.readFileSync("volumes.js", "utf-8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
console.log(JSON.stringify(sandbox.window.VOLUMES.vol9));
'''], capture_output=True, text=True, encoding='utf-8')

vol9 = json.loads(res.stdout)
chapters = vol9.get('chapters', [])

print(f"=== DEEP AUDIT OF VOLUME 9: {len(chapters)} CHAPTERS ===")

issues = []

for ch_idx, ch in enumerate(chapters):
    title = ch.get('title', f'Chương {ch_idx + 1}')
    blocks = ch.get('blocks', [])
    print(f"\nScanning [{ch_idx + 1}/10]: {title} ({len(blocks)} blocks)...")

    for b_idx, block in enumerate(blocks):
        if block.get('type') != 'p':
            continue
        p_text = block.get('text', '')
        if not p_text and block.get('runs'):
            p_text = ''.join(r.get('text', '') for r in block.get('runs', []))

        # Check 1: "bà" for Shihoko
        if re.search(r'\bbà\b.*Shihoko|Shihoko.*\bbà\b|bà chớp mắt', p_text, re.IGNORECASE):
            issues.append((ch_idx, title, b_idx, p_text, "Shihoko called 'bà'"))

        # Check 2: Akazawa-san / Kadowaki-san by Mahiru
        if 'Akazawa-san' in p_text:
            issues.append((ch_idx, title, b_idx, p_text, "Akazawa-san (should be Akazawa-kun)"))
        if 'Kadowaki-san' in p_text:
            issues.append((ch_idx, title, b_idx, p_text, "Kadowaki-san (should be Kadowaki-kun)"))

        # Check 3: Amane-kun spoken by Mahiru
        if 'Amane-kun' in p_text and not title.startswith('Lời bạt'):
            # Check if Mahiru is speaking
            if any(k in p_text for k in ['Mahiru nói', 'Mahiru thì thầm', 'Mahiru hỏi', 'Mahiru bảo', 'Mahiru đáp']):
                issues.append((ch_idx, title, b_idx, p_text, "Mahiru calling Amane-kun"))

        # Check 4: Koyuki using 'ta'
        if not title.startswith('Lời bạt'):
            if re.search(r'Koyuki.*“[^”]*\bta\b[^”]*”|“[^”]*\bta\b[^”]*”.*Koyuki', p_text):
                if not re.search(r'chúng ta|người ta|thật ra|tự ta', p_text):
                    issues.append((ch_idx, title, b_idx, p_text, "Koyuki using 'ta'"))

        # Check 5: Dialogue with 'ngươi'
        if re.search(r'“[^”]*\bngươi\b[^”]*”', p_text):
            issues.append((ch_idx, title, b_idx, p_text, "Dialogue with 'ngươi'"))

        # Check 6: mày/tao in non-Itsuki context
        may_tao = re.findall(r'“([^”]*\b(?:mày|tao)\b[^”]*)”', p_text)
        for quote in may_tao:
            # Check if this chapter involves conversation with Mahiru or parents without Itsuki
            if 'Mahirun' in quote or 'mẹ' in quote or 'bố' in quote:
                issues.append((ch_idx, title, b_idx, p_text, f"Suspect mày/tao in quote: {quote}"))

print(f"\n=== AUDIT RESULTS FOR VOLUME 9: {len(issues)} ISSUES FOUND ===")
for ch_idx, title, b_idx, p_text, desc in issues:
    print(f"\n[Chương {ch_idx + 1}: {title}] (Block {b_idx + 1}): {desc}")
    print(f"  \"{p_text}\"")
