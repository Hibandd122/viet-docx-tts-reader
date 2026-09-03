const regex = /(?<![a-zA-Zà-ỹÀ-Ỹ])(anh|em)(?![a-zA-Zà-ỹÀ-Ỹ])/i;
console.log("Testing 'đem':", regex.test("đem lòng yêu")); // Should be FALSE!
console.log("Testing 'em':", regex.test("em yêu anh")); // Should be TRUE!
console.log("Testing 'kèm':", regex.test("kèm theo")); // Should be FALSE!
console.log("Testing 'thanh':", regex.test("âm thanh")); // Should be FALSE!
console.log("Testing 'quanh':", regex.test("xung quanh")); // Should be FALSE!
console.log("Testing 'tiết kiệm':", regex.test("tiết kiệm")); // Should be FALSE!
console.log("Testing 'khen ngợi':", regex.test("khen ngợi")); // Should be FALSE!
