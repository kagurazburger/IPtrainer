// 测试转换为卡组功能的完整流程
// 在浏览器控制台中运行

function testFullConversionFlow() {
  console.log('=== 测试完整转换为卡组流程 ===');

  // 步骤1: 检查是否有当前面包
  const currentBread = window.currentBread || null;
  if (!currentBread) {
    console.log('❌ 步骤1失败: 没有当前记忆面包');
    console.log('请先创建一个记忆面包并添加一些文本，然后点击"添加闪卡"生成闪卡');
    return;
  }

  console.log('✅ 步骤1通过: 找到当前记忆面包');
  console.log('- 标题:', currentBread.title);
  console.log('- 文本长度:', currentBread.originalText?.length || 0, '字符');
  console.log('- 闪卡数量:', currentBread.flashcards?.length || 0);

  // 步骤2: 检查是否有闪卡
  if (!currentBread.flashcards || currentBread.flashcards.length === 0) {
    console.log('❌ 步骤2失败: 面包中没有闪卡');
    console.log('请先点击"添加闪卡"按钮生成闪卡');
    return;
  }

  console.log('✅ 步骤2通过: 找到闪卡');
  console.log('闪卡预览:');
  currentBread.flashcards.slice(0, 3).forEach((card, index) => {
    console.log(`${index + 1}. Q: ${card.q.substring(0, 50)}...`);
    console.log(`   A: ${card.a.substring(0, 50)}...`);
  });

  // 步骤3: 检查转换按钮是否可用
  const convertButton = document.querySelector('button');
  const convertButtons = Array.from(document.querySelectorAll('button')).filter(btn =>
    btn.textContent && btn.textContent.includes('转换为卡组')
  );

  if (convertButtons.length === 0) {
    console.log('❌ 步骤3失败: 找不到"转换为卡组"按钮');
    console.log('请确保你在文本处理器模式下，并且有闪卡');
    return;
  }

  console.log('✅ 步骤3通过: 找到"转换为卡组"按钮');

  // 步骤4: 模拟点击转换按钮
  console.log('🔄 步骤4: 正在执行转换...');
  console.log('请手动点击"转换为卡组"按钮，然后刷新页面检查结果');

  // 步骤5: 检查结果
  console.log('📋 检查结果步骤:');
  console.log('1. 卡组应该出现在主页上');
  console.log('2. 本地应该有JSON文件生成');
  console.log('3. 如果登录了用户，卡组应该同步到云端');

  console.log('\n=== 测试完成 ===');
  console.log('现在可以手动测试转换功能了！');
}

console.log('请在浏览器控制台中运行: testFullConversionFlow()');
console.log('函数已定义，复制到控制台执行即可');