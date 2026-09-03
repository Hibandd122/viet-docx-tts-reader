import re

files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

replacements = [
    (
        "“Ý tớ là, nếu tụi này đến nhà mày thì Mahirun cũng sẽ có mặt ở đó luôn. Một công đôi việc quá hời còn gì!”",
        "“Ý tớ là, nếu tụi tớ đến nhà Amane-kun thì Mahirun cũng sẽ có mặt ở đó luôn. Một công đôi việc quá hời còn gì!”"
    ),
    (
        "“Mục tiêu của mày chỉ là Mahiru thôi đúng không?”",
        "“Mục tiêu của cậu chỉ là Mahiru thôi đúng không?”"
    ),
    (
        "“Này, đừng có nhìn tao bằng cái ánh mắt của kẻ chiến thắng như thế chứ,” Amane càu nhàu",
        "“Này, đừng có nhìn tớ bằng cái ánh mắt của kẻ chiến thắng như thế chứ,” Amane càu nhàu"
    ),
    (
        "“Dù sao thì, tao sẽ để hai đứa chim cu chúng mày tự mình nói chuyện giải quyết ổn thỏa với nhau nhé,”",
        "“Dù sao thì, tao sẽ để hai đứa chim cu chúng bay tự mình nói chuyện giải quyết ổn thỏa với nhau nhé,”"
    ),
    (
        "“Mày ơi, có đứa thực sự đang cá cược xem cậu ta sẽ nhận được bao nhiêu món quà kìa.”",
        "“Này cậu ơi, có đứa thực sự đang cá cược xem cậu ta sẽ nhận được bao nhiêu món quà kìa.”"
    ),
    (
        "hoặc mày sẽ nghĩ là như thế, nhưng giờ đây ai nấy đều chỉ thấy thương xót cho cậu ta mà thôi.",
        "hoặc ai cũng sẽ nghĩ là như thế, nhưng giờ đây ai nấy đều chỉ thấy thương xót cho cậu ta mà thôi."
    ),
    (
        "Tao bắt đầu thấy lo rồi đấy. Ý tao là, tao ngờ rằng chỗ đó có thể nhét vừa vào tủ đồ của cậu ta.",
        "Tớ bắt đầu thấy lo rồi đấy. Ý tớ là, tớ ngờ rằng chỗ đó có thể nhét vừa vào tủ đồ của cậu ta."
    ),
    (
        "“Mày đừng có bán đứng tao trơ trẽn như thế chứ mày! Tao đã phải nếm quá đủ rồi, xin kiếu!”",
        "“Mày đừng có bán đứng tao trơ trẽn như thế chứ! Tao đã phải nếm quá đủ rồi, xin kiếu!”"
    ),
    (
        "“Hai đứa chúng mày không thể nghiêm túc hơn được à…”",
        "“Hai cậu không thể nghiêm túc hơn được à…”"
    ),
    (
        "“Tụi này sẽ trả lại tiền cho mày mà, hứa đấy!” họ nài nỉ",
        "“Tụi này sẽ trả lại tiền cho cậu mà, hứa đấy!” họ nài nỉ"
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
            print(f"No changes needed in {filepath} (or matches not found).")
    except Exception as e:
        print(f"Skipping {filepath}: {e}")

print("\nDone applying pronoun fixes.")
