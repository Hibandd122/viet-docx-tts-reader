import re
import json

# Load volumes.js
with open('volumes.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Extract VOLUMES object or parse JSON
# volumes.js typically starts with window.VOLUMES = ...
prefix = 'window.VOLUMES = '
if text.startswith(prefix):
    json_str = text[len(prefix):].rstrip(';')
else:
    # Find JSON start
    start = text.find('{')
    json_str = text[start:].rstrip(';').rstrip()

data = json.loads(json_str)
vol10 = data.get('vol10', {})
chapters = vol10.get('chapters', [])

print(f"Total chapters in vol10: {len(chapters)}")

may_tao_issues = []
anh_em_issues = []
toi_issues = []

for ch_idx, ch in enumerate(chapters):
    title = ch.get('title', f'Chương {ch_idx+1}')
    blocks = ch.get('blocks', [])
    for b_idx, block in enumerate(blocks):
        if block.get('type') != 'p':
            continue
        p_text = block.get('text', '')
        if not p_text and block.get('runs'):
            p_text = ''.join(r.get('text', '') for r in block.get('runs', []))
        
        # Check for mày / tao
        if re.search(r'\b(mày|tao)\b', p_text, re.IGNORECASE):
            may_tao_issues.append({
                'chapter_idx': ch_idx,
                'chapter_title': title,
                'block_idx': b_idx,
                'text': p_text
            })

print(f"\n--- FOUND {len(may_tao_issues)} PARAGRAPHS WITH 'MÀY' / 'TAO' IN VOL 10 ---")
for item in may_tao_issues:
    print(f"\n[{item['chapter_title']}] (block {item['block_idx']}):")
    print(f"  {item['text']}")
