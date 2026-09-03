import re

files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

replacements = [
    (
        "“Con chuẩn bị tinh thần tốt đấy. Con cũng đã tính đến chuyện này rồi nhỉ,” bà mỉm cười nói. “Mùa đông này nhớ về nhà nhé. Năm sau thi rồi nên con sẽ không có nhiều thời gian rảnh đâu.”",
        "“Con chuẩn bị tinh thần tốt đấy. Con cũng đã tính đến chuyện này rồi nhỉ,” mẹ cậu mỉm cười nói. “Mùa đông này nhớ về nhà nhé. Năm sau thi rồi nên con sẽ không có nhiều thời gian rảnh đâu.”"
    ),
    (
        "Theo những gì Amane biết hiện tại, Shihoko là một người cực kỳ thông minh. Bà đã tích lũy được một lượng kiến thức khổng lồ — dù có vài thứ thà bà không biết thì hơn — và cách bà nói chuyện vô cùng lý trí. Dù Amane cho rằng bà được coi là một người thông minh, cậu lại thấy khá khó để tưởng tượng điểm số thực tế của bà trông như thế nào.",
        "Theo những gì Amane biết hiện tại, Shihoko là một người cực kỳ thông minh. Cô đã tích lũy được một lượng kiến thức khổng lồ — dù có vài thứ thà cô không biết thì hơn — và cách cô nói chuyện vô cùng lý trí. Dù Amane cho rằng mẹ mình được coi là một người thông minh, cậu lại thấy khá khó để tưởng tượng điểm số thực tế của mẹ trông như thế nào."
    ),
    (
        "Đối với Amane, vẻ ngoài dịu dàng thường ngày của mẹ khiến lời miêu tả đáng sợ từ những người bạn kia càng trở nên khó tin. Ngạc nhiên, cậu theo bản năng quay sang nhìn bà. Shihoko liền gật đầu, không để lộ chút dấu vết nào của dáng vẻ quá khứ kia. “Chà, giờ nghĩ lại thì mẹ phải thừa nhận là lúc đó mẹ chẳng có kế hoạch cụ thể nào cả,” bà nói, giữ nguyên vẻ mặt hiền hậu đặc trưng.",
        "Đối với Amane, vẻ ngoài dịu dàng thường ngày của mẹ khiến lời miêu tả đáng sợ từ những người bạn kia càng trở nên khó tin. Ngạc nhiên, cậu theo bản năng quay sang nhìn mẹ. Shihoko liền gật đầu, không để lộ chút dấu vết nào của dáng vẻ quá khứ kia. “Chà, giờ nghĩ lại thì mẹ phải thừa nhận là lúc đó mẹ chẳng có kế hoạch cụ thể nào cả,” cô nói, giữ nguyên vẻ mặt hiền hậu đặc trưng."
    ),
    (
        "Thay vào đó, những lời của bà chỉ đơn thuần là một lời nhắc nhở nhẹ nhàng.",
        "Thay vào đó, những lời của mẹ cậu chỉ đơn thuần là một lời nhắc nhở nhẹ nhàng."
    ),
    (
        "Quan sát sự trăn trở của con trai, Shihoko không hề tỏ ra tức giận hay buồn bã. Thay vào đó, bà nhìn cậu bằng ánh mắt bình tĩnh và thấu hiểu, như muốn nói, mẹ hiểu rồi, ra là vậy.",
        "Quan sát sự trăn trở của con trai, Shihoko không hề tỏ ra tức giận hay buồn bã. Thay vào đó, cô nhìn cậu bằng ánh mắt bình tĩnh và thấu hiểu, như muốn nói, mẹ hiểu rồi, ra là vậy."
    ),
    (
        "Amane thường nghĩ rằng cậu có thể tôn trọng mẹ mình hơn nếu bà bỏ được cái thói cư xử trẻ con hơn tuổi mỗi khi ở cạnh cậu, dù cậu chưa bao giờ nói thẳng điều này ra. Shihoko chỉ nhún vai. Bà nhìn cậu với vẻ mặt như muốn nói rằng cậu đang quá nhạy cảm.",
        "Amane thường nghĩ rằng cậu có thể tôn trọng mẹ mình hơn nếu mẹ bỏ được cái thói cư xử trẻ con hơn tuổi mỗi khi ở cạnh cậu, dù cậu chưa bao giờ nói thẳng điều này ra. Shihoko chỉ nhún vai. Cô nhìn cậu với vẻ mặt như muốn nói rằng cậu đang quá nhạy cảm."
    ),
    (
        "“Không ai có thể khiến mẹ nghĩ rằng làm vậy là có lợi cho con cái cả,” bà nói thêm, dễ dàng chốt lại vấn đề.",
        "“Không ai có thể khiến mẹ nghĩ rằng làm vậy là có lợi cho con cái cả,” cô nói thêm, dễ dàng chốt lại vấn đề."
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

print("\nDone fixing Volume 9 Shihoko pronoun references.")
