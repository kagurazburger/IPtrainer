import fetch from 'node-fetch';

async function testCurrentConfig() {
  console.log('=== 测试当前API配置 ===');

  // 模拟前端配置
  const config = {
    provider: 'volcano',
    volcanoApiKey: '1805dc99-496f-4f37-89f1-b7e929ba21b4',
    volcanoModel: 'doubao-seed-1-8-251228',
    volcanoBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3'
  };

  const content = '测试文本：人工智能的发展历程包括图灵测试、专家系统和深度学习。';
  const prompt = `你是一个金牌助教。请根据以下文本提取 5-10 个核心知识点，并严格以 JSON 格式输出一个数组。
格式要求：[{"q": "问题", "a": "答案"}]
文本内容如下：${content}`;

  const requestBody = {
    model: config.volcanoModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 2000
  };

  console.log('配置信息:');
  console.log('- Provider:', config.provider);
  console.log('- Model:', config.volcanoModel);
  console.log('- Base URL:', config.volcanoBaseUrl);
  console.log('- API Key:', config.volcanoApiKey ? '已设置' : '未设置');

  console.log('\n发送请求...');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${config.volcanoBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.volcanoApiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('响应状态:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('错误详情:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ 请求成功!');
    console.log('响应时间:', new Date().toLocaleTimeString());

    const result = data.choices?.[0]?.message?.content;
    if (result) {
      console.log('AI回复长度:', result.length, '字符');
      console.log('回复预览:', result.substring(0, 100) + '...');

      // 尝试解析JSON
      try {
        const flashcards = JSON.parse(result.trim());
        console.log('✅ 成功解析为JSON，生成', flashcards.length, '张闪卡');
      } catch (e) {
        console.log('❌ JSON解析失败，但API调用成功');
      }
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ 请求超时 (30秒)');
    } else {
      console.error('❌ 网络错误:', error.message);
    }
  }
}

testCurrentConfig();