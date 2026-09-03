import re

files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

replacements = [
    (
        "“C-Cậu không cần phải trịnh trọng thế đâu ạ… nhưng cảm ơn cậu nhiều nhé, Akazawa-san. Và cả Kadowaki-san nữa ạ.”",
        "“C-Cậu không cần phải trịnh trọng thế đâu ạ… nhưng cảm ơn cậu nhiều nhé, Akazawa-kun. Và cả Kadowaki-kun nữa ạ.”"
    ),
    (
        "“Amane-kun lúc nào cũng tỏ ra lạnh lùng với Akazawa-san mỗi khi cậu nhận ra cậu ấy đang khen ngợi mình. Tớ thấy hơi ghen tị đấy ạ.”",
        "“Amane lúc nào cũng tỏ ra lạnh lùng với Akazawa-kun mỗi khi cậu nhận ra cậu ấy đang khen ngợi mình. Tớ thấy hơi ghen tị đấy ạ.”"
    ),
    (
        "“Cậu chỉ cư xử theo cách đó với mỗi một mình cậu ấy thôi. Điều đó có nghĩa là Akazawa-san là một người rất đặc biệt,” Mahiru dịu dàng giải thích.",
        "“Cậu chỉ cư xử theo cách đó với mỗi một mình cậu ấy thôi. Điều đó có nghĩa là Akazawa-kun là một người rất đặc biệt,” Mahiru dịu dàng giải thích."
    ),
    (
        "“Mọi chuyện vẫn chưa thực sự kết thúc đâu ạ… nhưng đúng là vậy thật. Cháu không ngờ lại thấy Akazawa-san và chú Shuuto đi cùng nhau như thế.” Mahiru đáp lại",
        "“Mọi chuyện vẫn chưa thực sự kết thúc đâu ạ… nhưng đúng là vậy thật. Cháu không ngờ lại thấy Akazawa-kun và chú Shuuto đi cùng nhau như thế.” Mahiru đáp lại"
    ),
    (
        "“Tớ nghĩ Akazawa-san đã ngập ngừng vào phút chót đấy ạ.",
        "“Tớ nghĩ Akazawa-kun đã ngập ngừng vào phút chót đấy ạ."
    ),
    (
        "“Tớ nghĩ cậu cũng có thể thẳng thắn bộc trực hơn với Akazawa-san một chút đấy, cậu biết không ạ?” Mahiru gợi ý.",
        "“Tớ nghĩ cậu cũng có thể thẳng thắn bộc trực hơn với Akazawa-kun một chút đấy, cậu biết không ạ?” Mahiru gợi ý."
    ),
    (
        "“Tớ cũng có quà dành cho Kadowaki-san và Akazawa-san nữa ạ. Tớ muốn đợi cho đến khi đám đông thưa thớt nhất có thể nên tớ trao quà hơi muộn một chút ạ.”",
        "“Tớ cũng có quà dành cho Kadowaki-kun và Akazawa-kun nữa ạ. Tớ muốn đợi cho đến khi đám đông thưa thớt nhất có thể nên tớ trao quà hơi muộn một chút ạ.”"
    )
]

for filepath in files_to_update:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        updated = content
        count = 0
        for old_str, new_str in replacements:
            if old_str in updated:
                updated = updated.replace(old_str, new_str)
                count += 1

        if updated != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated)
            print(f"Updated {filepath} with {count} fixes.")
        else:
            print(f"No changes needed in {filepath}.")
    except Exception as e:
        print(f"Skipping {filepath}: {e}")

print("\nDone fixing Akazawa-kun / Kadowaki-kun.")
