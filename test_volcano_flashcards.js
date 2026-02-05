import fetch from 'node-fetch';

async function testVolcanoFlashcardGeneration() {
  const apiKey = '1805dc99-496f-4f37-89f1-b7e929ba21b4';
  const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
  const model = 'doubao-seed-1-8-251228';

  const testContent = `人工智能的发展历程：
  1. 1950年代：图灵测试提出
  2. 1960年代：专家系统诞生
  3. 1980年代：神经网络复兴
  4. 2010年代：深度学习突破
  5. 2020年代：大语言模型时代`;

  const prompt = `你是一个金牌助教。请根据以下文本提取 5-10 个核心知识点，并严格以 JSON 格式输出一个数组。
格式要求：[{"q": "问题", "a": "答案"}]
文本内容如下：${testContent}`;

  const requestBody = {
    model: model,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
  };

  console.log('Testing Volcano API flashcard generation...');
  console.log('URL:', `${baseUrl}/chat/completions`);
  console.log('Prompt:', prompt.substring(0, 200) + '...');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error Response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('API Response received successfully');

    const result = data.choices?.[0]?.message?.content;
    console.log('Raw AI Response:', result);

    if (!result) {
      console.error('No content in response');
      return;
    }

    // 尝试解析JSON
    try {
      const flashcards = JSON.parse(result.trim());
      console.log('Parsed flashcards:', JSON.stringify(flashcards, null, 2));

      if (!Array.isArray(flashcards)) {
        console.error('Response is not an array');
        return;
      }

      console.log(`Successfully generated ${flashcards.length} flashcards!`);

      // 验证格式
      flashcards.forEach((item, index) => {
        if (!item.q || !item.a) {
          console.error(`Invalid flashcard format at index ${index}:`, item);
        } else {
          console.log(`✓ Flashcard ${index + 1}: ${item.q.substring(0, 50)}...`);
        }
      });

    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Raw response that failed to parse:', result);
    }

  } catch (error) {
    console.error('Network Error:', error);
  }
}

testVolcanoFlashcardGeneration();