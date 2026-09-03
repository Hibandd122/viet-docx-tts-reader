import re

files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

replacements = [
    (
        "Chẳng biết Shihoko có nhận ra cảm giác biết ơn và ngưỡng mộ của Amane hay không. Với nụ cười đặc trưng trên môi, bà đặt tay lên ngực tỏ vẻ vô cùng tự tin.",
        "Chẳng biết Shihoko có nhận ra cảm giác biết ơn và ngưỡng mộ của Amane hay không. Với nụ cười đặc trưng trên môi, cô đặt tay lên ngực tỏ vẻ vô cùng tự tin."
    ),
    (
        "Shihoko, có lẽ cũng lờ mờ nhận ra hoàn cảnh, nên đã không nói ra những lo ngại trong đầu Amane. Thay vào đó, bà chỉ nói, “Ồ, vậy sao?",
        "Shihoko, có lẽ cũng lờ mờ nhận ra hoàn cảnh, nên đã không nói ra những lo ngại trong đầu Amane. Thay vào đó, cô chỉ nói, “Ồ, vậy sao?"
    ),
    (
        "Về khoản đó, Shihoko là một người mà con trai bà chẳng mấy tin tưởng hay dựa dẫm vào.",
        "Về khoản đó, Shihoko là một người mà con trai cô chẳng mấy tin tưởng hay dựa dẫm vào."
    ),
    (
        "Shihoko quay sang nhìn Amane đang bối rối, tò mò hỏi “Có chuyện gì sao con?” Bà phô ra vẻ mặt giả vờ ngây ngô, và Amane lại một lần nữa nhận ra mẹ mình là một người sắc sảo đến nhường nào. Rất có thể, Shihoko đã cố tình nói vậy để phá vỡ bầu không khí nặng nề. Amane cậu không khỏi cảm thấy như mình vừa bị đâm sau lưng và nhướng mày đầy vẻ phóng đại với bà.",
        "Shihoko quay sang nhìn Amane đang bối rối, tò mò hỏi “Có chuyện gì sao con?” Cô phô ra vẻ mặt giả vờ ngây ngô, và Amane lại một lần nữa nhận ra mẹ mình là một người sắc sảo đến nhường nào. Rất có thể, Shihoko đã cố tình nói vậy để phá vỡ bầu không khí nặng nề. Amane cậu không khỏi cảm thấy như mình vừa bị đâm sau lưng và nhướng mày đầy vẻ phóng đại với mẹ."
    ),
    (
        "“Hehe, Amane đã trở nên thành thật với bản thân hơn rồi nhỉ?” Tiếng cười của Shihoko thật vui vẻ nhưng cũng đầy thanh lịch. Bà tận hưởng khoảnh khắc này trước khi quay nụ cười ấm áp của mình sang Daiki",
        "“Hehe, Amane đã trở nên thành thật với bản thân hơn rồi nhỉ?” Tiếng cười của Shihoko thật vui vẻ nhưng cũng đầy thanh lịch. Cô tận hưởng khoảnh khắc này trước khi quay nụ cười ấm áp của mình sang Daiki"
    ),
    (
        "“Có vẻ như Itsuki-kun cũng có những khúc mắc gia đình riêng nhỉ,” Shihoko lên tiếng sau khi lặng lẽ đưa mắt nhìn Itsuki chạy đi. Bà đã cố làm mờ nhạt bản thân để tránh xen ngang cuộc trò chuyện giữa hai người bạn.",
        "“Có vẻ như Itsuki-kun cũng có những khúc mắc gia đình riêng nhỉ,” Shihoko lên tiếng sau khi lặng lẽ đưa mắt nhìn Itsuki chạy đi. Cô đã cố làm mờ nhạt bản thân để tránh xen ngang cuộc trò chuyện giữa hai người bạn."
    ),
    (
        "Vì lập trường của Shihoko khác với Amane, bà có thể nhìn nhận mối quan hệ giữa Itsuki và cha cậu dưới một góc độ thực tế hơn. Bà khẽ thở dài và nhún vai. “Nuôi dạy con cái đúng là một việc khó khăn,” bà lẩm bẩm.",
        "Vì lập trường của Shihoko khác với Amane, cô có thể nhìn nhận mối quan hệ giữa Itsuki và cha cậu dưới một góc độ thực tế hơn. Cô khẽ thở dài và nhún vai. “Nuôi dạy con cái đúng là một việc khó khăn,” cô lẩm bẩm."
    ),
    (
        "Cậu chưa bao giờ tưởng tượng được việc Shihoko lại so sánh Daiki với bố của bà—nói cách khác, chính là ông ngoại của cậu.",
        "Cậu chưa bao giờ tưởng tượng được việc Shihoko lại so sánh Daiki với bố của cô—nói cách khác, chính là ông ngoại của cậu."
    ),
    (
        "Trong lúc cậu đang tiếp thu thông tin mà phải mất trọn mười bảy năm sống trên đời mới biết được này, Shihoko đung đưa người vẻ thích thú. Sau khi gật đầu hài lòng, bà đưa mắt nhìn dọc theo hành lang, nơi Itsuki và Daiki vừa khuất bóng.",
        "Trong lúc cậu đang tiếp thu thông tin mà phải mất trọn mười bảy năm sống trên đời mới biết được này, Shihoko đung đưa người vẻ thích thú. Sau khi gật đầu hài lòng, cô đưa mắt nhìn dọc theo hành lang, nơi Itsuki và Daiki vừa khuất bóng."
    ),
    (
        "“Con giận đấy,” cậu càu nhàu. Không biết Shihoko có nhận ra sự thay đổi tinh tế của Mahiru hay không, nhưng bà đã dùng Amane làm cớ để chuyển chủ đề và làm bầu không khí nhẹ nhàng hơn. Cậu lập tức hùa theo, mặc dù vẫn lườm nhẹ mẹ mình một cái.",
        "“Con giận đấy,” cậu càu nhàu. Không biết Shihoko có nhận ra sự thay đổi tinh tế của Mahiru hay không, nhưng cô đã dùng Amane làm cớ để chuyển chủ đề và làm bầu không khí nhẹ nhàng hơn. Cậu lập tức hùa theo, mặc dù vẫn lườm nhẹ mẹ mình một cái."
    ),
    (
        "Shihoko vô cùng thích thú trước phản ứng của Amane và nhìn Mahiru với một nụ cười tinh nghịch. Bà trêu chọc thì thầm, “Thằng bé chỉ đang giấu sự bối rối của mình thôi, đúng không nào~?”",
        "Shihoko vô cùng thích thú trước phản ứng của Amane và nhìn Mahiru với một nụ cười tinh nghịch. Cô trêu chọc thì thầm, “Thằng bé chỉ đang giấu sự bối rối của mình thôi, đúng không nào~?”"
    ),
    (
        "Shihoko ở lại khoảng một tiếng trước khi vội vã rời đi một cách duyên dáng, than thở rằng hôm sau bà phải đi làm.",
        "Shihoko ở lại khoảng một tiếng trước khi vội vã rời đi một cách duyên dáng, than thở rằng hôm sau cô phải đi làm."
    ),
    (
        "Tuy nhiên, vì Shihoko thường xuyên buông những lời châm chọc khiến cậu bực mình, có lẽ việc bà rời đi sớm lại là điều tốt nhất. Giá như bà không hay trêu chọc cậu thường xuyên đến thế, Amane hẳn đã muốn bà ở lại bên cạnh Mahiru.",
        "Tuy nhiên, vì Shihoko thường xuyên buông những lời châm chọc khiến cậu bực mình, có lẽ việc mẹ rời đi sớm lại là điều tốt nhất. Giá như mẹ không hay trêu chọc cậu thường xuyên đến thế, Amane hẳn đã muốn mẹ ở lại bên cạnh Mahiru."
    ),
    (
        "Giờ nghĩ lại, Amane không thể rũ bỏ cảm giác rằng Shihoko đã nhiệt tình lót đường từ tận trước khi bản thân cậu hoàn toàn phải lòng Mahiru. Dù đó là nhờ trực giác và sự tinh ý kỳ lạ của bà hay là sự quyết tâm cao độ, rõ ràng là bà đã lên sẵn kế hoạch tác chiến rồi.",
        "Giờ nghĩ lại, Amane không thể rũ bỏ cảm giác rằng Shihoko đã nhiệt tình lót đường từ tận trước khi bản thân cậu hoàn toàn phải lòng Mahiru. Dù đó là nhờ trực giác và sự tinh ý kỳ lạ của mẹ hay là sự quyết tâm cao độ, rõ ràng là cô đã lên sẵn kế hoạch tác chiến rồi."
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

print("\nDone fixing all narrative Shihoko pronouns in Volume 9.")
