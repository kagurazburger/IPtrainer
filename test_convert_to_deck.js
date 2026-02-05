// 测试转换为卡组功能
// 在浏览器控制台中运行

function testConvertToDeck() {
  console.log('=== 测试转换为卡组功能 ===');

  // 检查currentBread是否存在
  const currentBread = window.currentBread || null;
  if (!currentBread) {
    console.log('❌ 没有当前记忆面包');
    return;
  }

  console.log('当前面包信息:');
  console.log('- 标题:', currentBread.title);
  console.log('- 文本长度:', currentBread.originalText?.length || 0);
  console.log('- 闪卡数量:', currentBread.flashcards?.length || 0);

  if (!currentBread.flashcards || currentBread.flashcards.length === 0) {
    console.log('❌ 面包中没有闪卡，请先点击"添加闪卡"生成闪卡');
    return;
  }

  console.log('闪卡预览:');
  currentBread.flashcards.slice(0, 3).forEach((card, index) => {
    console.log(`${index + 1}. Q: ${card.q.substring(0, 50)}...`);
    console.log(`   A: ${card.a.substring(0, 50)}...`);
  });

  console.log('\n✅ 准备就绪！现在可以点击"转换为卡组"按钮');
  console.log('转换后，卡组将出现在主页上，并保存为JSON文件');
}

console.log('请在浏览器控制台中运行: testConvertToDeck()');
console.log('函数已定义，复制到控制台执行即可');