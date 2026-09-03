files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

old_str = "“Liệu cậu có thể mang hết đống này về nhà nổi không thế hả Kadowaki-san?” Mahiru hỏi."
new_str = "“Liệu cậu có thể mang hết đống này về nhà nổi không thế hả Kadowaki-kun?” Mahiru hỏi."

for filepath in files_to_update:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if old_str in content:
            updated = content.replace(old_str, new_str)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated)
            print(f"Fixed Kadowaki-san in {filepath}")
        else:
            print(f"Target not found in {filepath}")
    except Exception as e:
        print(f"Error updating {filepath}: {e}")

print("Done!")
