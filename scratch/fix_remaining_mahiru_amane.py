import re

files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

replacements = [
    (
        "“C-Cậu ấy nói đúng đấy ạ,” Mahiru vội vàng đỡ lời cho cậu. “Amane-kun luôn chăm sóc tớ rất chu đáo. Cậu ấy luôn tốt bụng và đối xử với tớ dịu dàng hết mức có thể.”",
        "“C-Cậu ấy nói đúng đấy ạ,” Mahiru vội vàng đỡ lời cho cậu. “Amane luôn chăm sóc tớ rất chu đáo. Cậu ấy luôn tốt bụng và đối xử với tớ dịu dàng hết mức có thể.”"
    ),
    (
        "“…T-Tớ sẽ suy nghĩ về chuyện đó ạ,” Mahiru nói. “Hơn nữa, hôm qua Amane-kun đã chiều chuộng tớ rất nhiều rồi.”",
        "“…T-Tớ sẽ suy nghĩ về chuyện đó ạ,” Mahiru nói. “Hơn nữa, hôm qua Amane đã chiều chuộng tớ rất nhiều rồi.”"
    ),
    (
        "“Tớ nhận thức rất rõ rằng, ừm, cậu yêu tớ rất nhiều, Amane-kun. Và tớ biết cậu không phải là kiểu người sẽ phá vỡ lời hứa mà mình đã đưa ra,” Mahiru nói.",
        "“Tớ nhận thức rất rõ rằng, ừm, cậu yêu tớ rất nhiều, Amane. Và tớ biết cậu không phải là kiểu người sẽ phá vỡ lời hứa mà mình đã đưa ra,” Mahiru nói."
    ),
    (
        "“Nếu cậu đã làm thế, thì tớ cũng muốn cậu dựa dẫm vào tớ nhiều hơn nữa, Amane-kun,” Mahiru thì thầm ngọt ngào.",
        "“Nếu cậu đã làm thế, thì tớ cũng muốn cậu dựa dẫm vào tớ nhiều hơn nữa, Amane,” Mahiru thì thầm ngọt ngào."
    ),
    (
        "“Akazawa-san, cậu cũng nên cố gắng tránh trêu chọc Amane-kun quá nhiều nhé. Cậu ấy có xu hướng cư xử như trẻ con mỗi khi ở cạnh cậu đấy ạ,” Mahiru dịu dàng nhận xét.",
        "“Akazawa-kun, cậu cũng nên cố gắng tránh trêu chọc Amane quá nhiều nhé. Cậu ấy có xu hướng cư xử như trẻ con mỗi khi ở cạnh cậu đấy ạ,” Mahiru dịu dàng nhận xét."
    ),
    (
        "“Amane-kun đừng dỗi nữa nhé, được không ạ?” Mahiru thì thầm bằng một giọng nói dịu dàng, êm đềm, cố gắng an ủi Amane khi cô nhận ra nét mặt ủ rũ của cậu chính là đang hờn dỗi.",
        "“Amane đừng dỗi nữa nhé, được không ạ?” Mahiru thì thầm bằng một giọng nói dịu dàng, êm đềm, cố gắng an ủi Amane khi cô nhận ra nét mặt ủ rũ của cậu chính là đang hờn dỗi."
    ),
    (
        "“Tớ cũng cùng chung hoàn cảnh với Amane-kun ạ,” Mahiru nói, “Mặc dù vì tớ không đi làm thêm nên tớ sẽ dành nhiều thời gian hơn cho việc học.”",
        "“Tớ cũng cùng chung hoàn cảnh với Amane ạ,” Mahiru nói, “Mặc dù vì tớ không đi làm thêm nên tớ sẽ dành nhiều thời gian hơn cho việc học.”"
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

print("\nFinished fixing remaining Mahiru addresses.")
