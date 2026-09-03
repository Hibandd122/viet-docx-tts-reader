import re

files_to_update = [
    'volumes.js',
    'public/volumes.js',
    'chapters.js',
    'public/chapters.js'
]

vol9_replacements = [
    (
        "Bà chớp mắt vài cái và hướng ánh nhìn xuống hành lang. Amane cũng làm theo và quay đầu nhìn về cùng hướng đó, nơi cậu thấy hai bóng dáng quen thuộc. Một người là Itsuki",
        "Mẹ cậu chớp mắt vài cái và hướng ánh nhìn xuống hành lang. Amane cũng làm theo và quay đầu nhìn về cùng hướng đó, nơi cậu thấy hai bóng dáng quen thuộc. Một người là Itsuki"
    ),
    (
        "“Sao bọn mày có thể thản nhiên tàn nhẫn như vậy chứ?” Itsuki tuôn ra, nhanh chóng thoát khỏi sự tuyệt vọng giả trân của mình.",
        "“Sao hai cậu có thể thản nhiên tàn nhẫn như vậy chứ?” Itsuki tuôn ra, nhanh chóng thoát khỏi sự tuyệt vọng giả trân của mình."
    ),
    (
        "“Trông cháu tươi tắn hơn nhiều so với lần cuối cùng ta gặp. Ánh mắt cháu cũng rạng rỡ hơn nữa. Hẳn là cháu đang sống trong một môi trường rất tuyệt vời. Ta thực sự rất vui.”",
        "“Trông cháu tươi tắn hơn nhiều so với lần cuối cùng bà gặp. Ánh mắt cháu cũng rạng rỡ hơn nữa. Hẳn là cháu đang sống trong một môi trường rất tuyệt vời. Bà thực sự rất vui.”"
    ),
    (
        "Koyuki khúc khích cười, “Cháu không cần phải câu nệ thế đâu, ta không còn là người làm của gia đình cháu nữa. Giờ ta chỉ là một bà lão bình thường thôi.”",
        "Koyuki khúc khích cười, “Cháu không cần phải câu nệ thế đâu, bà không còn là người làm của gia đình cháu nữa. Giờ bà chỉ là một bà lão bình thường thôi.”"
    ),
    (
        "“Ôi trời. Hehe, ta đoán là cảm giác này từ hai phía rồi, vì niềm vui sướng cũng làm ta cư xử hơi suồng sã một chút.”",
        "“Ôi trời. Hehe, bà đoán là cảm giác này từ hai phía rồi, vì niềm vui sướng cũng làm bà cư xử hơi suồng sã một chút.”"
    )
]

vol10_replacements = [
    ("“Amane-kun không thích những điều như thế sao ạ?”", "“Amane không thích những điều như thế sao ạ?”"),
    ("“Đ-Đó là chỉ đối với một mình Amane-kun thôi ạ!”", "“Đ-Đó là chỉ đối với một mình Amane thôi ạ!”"),
    ("“Đó chỉ là vì trước đây Amane-kun chỉ toàn da bọc xương thôi ạ.”", "“Đó chỉ là vì trước đây Amane chỉ toàn da bọc xương thôi ạ.”"),
    ("“Tớ rất thích chạm vào người Amane-kun mà.”", "“Tớ rất thích chạm vào người Amane mà.”"),
    ("“Và Amane-kun cũng rất thích chạm vào người tớ đúng không ạ?”", "“Và Amane cũng rất thích chạm vào người tớ đúng không ạ?”"),
    ("“…Vấn đề không phải là tớ muốn cậu chạm vào đâu, Amane-kun. Mà là nơi cậu muốn chạm vào cơ ạ.”", "“…Vấn đề không phải là tớ muốn cậu chạm vào đâu, Amane. Mà là nơi cậu muốn chạm vào cơ ạ.”"),
    ("“…Ông già Noel đã không đến với tớ, nhưng đổi lại tớ đã nhận được rất nhiều món quà từ Amane-kun rồi. Tớ đã cảm thấy quá đỗi hạnh phúc rồi ạ.”", "“…Ông già Noel đã không đến với tớ, nhưng đổi lại tớ đã nhận được rất nhiều món quà từ Amane rồi. Tớ đã cảm thấy quá đỗi hạnh phúc rồi ạ.”"),
    ("“…Làm ơn đừng làm mọi chuyện đi quá xa nhé ạ? Cậu, ừm, nồng nhiệt và say đắm hơn nhiều so với những gì cậu tưởng tượng đấy, Amane-kun.”", "“…Làm ơn đừng làm mọi chuyện đi quá xa nhé ạ? Cậu, ừm, nồng nhiệt và say đắm hơn nhiều so với những gì cậu tưởng tượng đấy, Amane.”"),
    ("“Chúc cậu ngủ ngon nhé, Amane-kun.”", "“Chúc cậu ngủ ngon nhé, Amane.”"),
    ("“Đương nhiên là tớ hạnh phúc với bất cứ thứ gì Amane-kun tặng cho tớ rồi ạ. Nhưng gác chuyện đó sang một bên, món này hoàn toàn bổ sung hoàn hảo cho phong cách của tớ. Nó tuyệt đẹp lắm ạ.”", "“Đương nhiên là tớ hạnh phúc với bất cứ thứ gì Amane tặng cho tớ rồi ạ. Nhưng gác chuyện đó sang một bên, món này hoàn toàn bổ sung hoàn hảo cho phong cách của tớ. Nó tuyệt đẹp lắm ạ.”"),
    ("“Amane-kun, cậu thường hay chọn đồ trang sức có thiết kế hình hoa nhỉ?”", "“Amane, cậu thường hay chọn đồ trang sức có thiết kế hình hoa nhỉ?”"),
    ("“Amane-kun đúng là đồ đại ngốc mà,”", "“Amane đúng là đồ đại ngốc mà,”"),
    ("“Amane-kun này, cậu lúc nào cũng vị tha một cách kỳ quặc trong mấy chuyện này", "“Amane này, cậu lúc nào cũng vị tha một cách kỳ quặc trong mấy chuyện này"),
    ("“Làm ơn hãy nghĩ về sở thích của chính bản thân cậu nhiều hơn một chút đi ạ, Amane-kun. Trong trường hợp này, sở thích của tớ không nên đóng vai trò gì cả mới phải chứ.”", "“Làm ơn hãy nghĩ về sở thích của chính bản thân cậu nhiều hơn một chút đi ạ, Amane. Trong trường hợp này, sở thích của tớ không nên đóng vai trò gì cả mới phải chứ.”"),
    ("“Tớ sẵn sàng làm bất cứ thứ gì mà Amane-kun sẽ thích thú thưởng thức mà.”", "“Tớ sẵn sàng làm bất cứ thứ gì mà Amane sẽ thích thú thưởng thức mà.”"),
    ("“Tớ luôn biết ơn sự giúp đỡ của cậu mà, nên đây là cách tớ gửi lời cảm ơn ạ. Và hơn nữa, cậu cũng luôn chìa tay giúp đỡ Amane-kun nữa.”", "“Tớ luôn biết ơn sự giúp đỡ của cậu mà, nên đây là cách tớ gửi lời cảm ơn ạ. Và hơn nữa, cậu cũng luôn chìa tay giúp đỡ Amane nữa.”"),
    ("“…Amane-kun.”", "“…Amane.”"),
    ("“Tớ biết rằng Amane-kun sẽ không bao giờ buông tay tớ đâu ạ. Tớ tin tưởng cậu tuyệt đối hoàn toàn.”", "“Tớ biết rằng Amane sẽ không bao giờ buông tay tớ đâu ạ. Tớ tin tưởng cậu tuyệt đối hoàn toàn.”"),
    ("“Tớ có một sự tự tin tuyệt đối rằng Amane-kun sẽ không bao giờ bị lung lay bởi bất kỳ ai khác—rằng trái tim của cậu sẽ luôn mãi mãi thuộc về một mình tớ.", "“Tớ có một sự tự tin tuyệt đối rằng Amane sẽ không bao giờ bị lung lay bởi bất kỳ ai khác—rằng trái tim của cậu sẽ luôn mãi mãi thuộc về một mình tớ."),
    ("“Amane-kun à. Điều thực sự khiến tớ lo lắng nhất… chính là ý nghĩ về việc cậu sẽ bị tổn thương.”", "“Amane à. Điều thực sự khiến tớ lo lắng nhất… chính là ý nghĩ về việc cậu sẽ bị tổn thương.”"),
    ("“Cậu là người cuối cùng trên đời mà tớ muốn nghe câu đó đấy nhé, Amane-kun. Và chắc chắn là, cậu hiểu được cảm giác không muốn làm thất vọng người mà mình yêu thương nhất là như thế nào mà đúng không ạ.”", "“Cậu là người cuối cùng trên đời mà tớ muốn nghe câu đó đấy nhé, Amane. Và chắc chắn là, cậu hiểu được cảm giác không muốn làm thất vọng người mà mình yêu thương nhất là như thế nào mà đúng không ạ.”"),
    ("“Đó là bởi vì Amane-kun trông đẹp trai đến nhường nào mà.”", "“Đó là bởi vì Amane trông đẹp trai đến nhường nào mà.”"),
    ("Amane-kun lúc ngái ngủ trông đáng yêu quá đi mất…", "Amane lúc ngái ngủ trông đáng yêu quá đi mất…"),
    ("“Cậu nhìn thấy mọi thứ đã cân đối hài hòa chưa hả Amane-kun?”", "“Cậu nhìn thấy mọi thứ đã cân đối hài hòa chưa hả Amane?”"),
    ("“Amane-kun không định giúp trang trí cây thông sao ạ? Nãy giờ cậu vẫn chưa treo món nào lên cả đấy.”", "“Amane không định giúp trang trí cây thông sao ạ? Nãy giờ cậu vẫn chưa treo món nào lên cả đấy.”"),
    ("“Sẽ thật không công bằng nếu chỉ có mỗi một mình tớ xuất hiện trong video, nên tớ nhất định phải đưa cả Amane-kun vào trong đó nữa ạ. Rốt cuộc thì cậu mới là con trai ruột của hai bác mà.”", "“Sẽ thật không công bằng nếu chỉ có mỗi một mình tớ xuất hiện trong video, nên tớ nhất định phải đưa cả Amane vào trong đó nữa ạ. Rốt cuộc thì cậu mới là con trai ruột của hai bác mà.”"),
    ("Mahiru khúc khích cười e thẹn: “…Amane-kun ấm áp quá đi ạ.”", "Mahiru khúc khích cười e thẹn: “…Amane ấm áp quá đi ạ.”"),
    ("“Amane-kun xấu tính quá đi mất. Lần tới tớ nhất định sẽ mang theo túi chườm đá vào giường cho mà xem.”", "“Amane xấu tính quá đi mất. Lần tới tớ nhất định sẽ mang theo túi chườm đá vào giường cho mà xem.”")
]

all_replacements = vol9_replacements + vol10_replacements

for filepath in files_to_update:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        updated = content
        count = 0
        for old_str, new_str in all_replacements:
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

print("\nAll pronoun refinements applied successfully across all volumes!")
