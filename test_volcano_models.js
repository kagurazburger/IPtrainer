import fetch from 'node-fetch';

async function testVolcanoModels() {
  const apiKey = '1805dc99-496f-4f37-89f1-b7e929ba21b4';
  const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';

  // 测试不同的模型名称
  const modelsToTest = [
    'doubao-seed-1-8-251228',  // 正确的模型
    'Doubao-Seed-1.8',        // 用户配置的错误模型
    'doubao-lite-4k',         // 旧的默认模型
    'doubao-pro-4k',          // 另一个可能存在的模型
  ];

  const testContent = '你好，请简单回复。';

  for (const model of modelsToTest) {
    console.log(`\n=== 测试模型: ${model} ===`);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: testContent }],
          temperature: 0.7,
          max_tokens: 100
        })
      });

      console.log(`状态码: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ 模型 ${model} 可用`);
        console.log(`回复: ${data.choices[0]?.message?.content}`);
      } else {
        const errorText = await response.text();
        console.log(`❌ 模型 ${model} 不可用`);
        console.log(`错误: ${errorText}`);
      }
    } catch (error) {
      console.error(`❌ 网络错误 (${model}):`, error);
    }
  }
}

testVolcanoModels();