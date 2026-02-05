import fetch from 'node-fetch';

async function testVolcanoAPI() {
  const apiKey = '1805dc99-496f-4f37-89f1-b7e929ba21b4';
  const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
  const model = 'doubao-seed-1-8-251228';

  const requestBody = {
    model: model,
    messages: [
      {
        role: 'user',
        content: '你好，请简单回复一句话。'
      }
    ],
    temperature: 0.7,
    max_tokens: 100
  };

  console.log('Testing Volcano API...');
  console.log('URL:', `${baseUrl}/chat/completions`);
  console.log('Request Body:', JSON.stringify(requestBody, null, 2));

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
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error Response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('Success! Response:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Network Error:', error);
  }
}

testVolcanoAPI();