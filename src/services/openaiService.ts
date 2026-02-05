import { LLMConfig } from '../types';

export interface FlashcardItem {
  q: string;
  a: string;
}

/**
 * 使用自定义API生成闪卡
 */
const generateFlashcardsWithCustomAPI = async (content: string, config: LLMConfig): Promise<FlashcardItem[]> => {
  console.log('generateFlashcardsWithCustomAPI called with config:', config);
  const baseUrl = config.customBaseUrl;
  const apiKey = config.customApiKey;
  const model = config.customModel || 'gpt-3.5-turbo';

  console.log('Custom API config - baseUrl:', baseUrl, 'apiKey:', apiKey ? '***set***' : '***not set***', 'model:', model);

  if (!baseUrl || !apiKey) {
    throw new Error("Custom API base URL and API key are required. Please configure them in settings.");
  }

  const prompt = `你是一个金牌助教。请根据以下文本提取 5-10 个核心知识点，并严格以 JSON 格式输出一个数组。
格式要求：[{"q": "问题", "a": "答案"}]
文本内容如下：${content}`;

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }),
    signal: AbortSignal.timeout(30000) // 30秒超时
  });

  if (!response.ok) {
    throw new Error(`Custom API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;

  if (!result) {
    throw new Error('No response from custom API');
  }

  // 尝试解析JSON
  try {
    const flashcards = JSON.parse(result.trim());
    if (!Array.isArray(flashcards)) {
      throw new Error('Response is not an array');
    }

    // 验证格式
    const validatedFlashcards = flashcards.map((item: any, index: number) => {
      if (!item.q || !item.a) {
        throw new Error(`Invalid flashcard format at index ${index}`);
      }
      return {
        q: String(item.q).trim(),
        a: String(item.a).trim()
      };
    });

    return validatedFlashcards;
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Raw response:', result);
    throw new Error('Failed to parse custom API response as valid JSON');
  }
};

/**
 * 使用Volcano API生成闪卡
 */
const generateFlashcardsWithVolcanoAPI = async (content: string, config: LLMConfig): Promise<FlashcardItem[]> => {
  console.log('generateFlashcardsWithVolcanoAPI called with config:', config);
  const apiKey = config.volcanoApiKey;
  const model = config.volcanoModel || 'doubao-seed-1-8-251228';
  const baseUrl = config.volcanoBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3';

  console.log('Volcano API config - apiKey:', apiKey ? '***set***' : '***not set***', 'model:', model, 'baseUrl:', baseUrl);

  if (!apiKey) {
    throw new Error("Volcano API key is required. Please configure it in settings.");
  }

  const prompt = `你是一个金牌助教。请根据以下文本提取 5-10 个核心知识点，并严格以 JSON 格式输出一个数组。
格式要求：[{"q": "问题", "a": "答案"}]
文本内容如下：${content}`;

  const requestUrl = `${baseUrl}/chat/completions`;
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

  console.log('Volcano API request:', {
    url: requestUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ***'
    },
    body: requestBody
  });

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30000) // 30秒超时
  });

  console.log('Volcano API response status:', response.status, response.statusText);
  console.log('Volcano API response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    let errorDetails = '';
    try {
      const errorText = await response.text();
      console.error('Volcano API error response body:', errorText);

      // 尝试解析JSON错误响应
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = `Status: ${response.status} ${response.statusText}\nError: ${errorJson.error?.message || errorJson.message || 'Unknown error'}\nType: ${errorJson.error?.type || errorJson.type || 'Unknown type'}`;
      } catch (parseError) {
        // 如果不是JSON，直接使用文本
        errorDetails = `Status: ${response.status} ${response.statusText}\nResponse: ${errorText}`;
      }
    } catch (textError) {
      console.error('Failed to read error response:', textError);
      errorDetails = `Status: ${response.status} ${response.statusText}\nFailed to read response body`;
    }

    // 根据状态码提供更具体的错误信息
    let errorMessage = 'Volcano API request failed';
    if (response.status === 401) {
      errorMessage = 'Volcano API 认证失败：API Key 无效或已过期';
    } else if (response.status === 403) {
      errorMessage = 'Volcano API 访问被拒绝：权限不足或账户问题';
    } else if (response.status === 404) {
      errorMessage = 'Volcano API 端点不存在：请检查 Base URL 和模型名称';
    } else if (response.status === 429) {
      errorMessage = 'Volcano API 请求频率过高：请稍后重试';
    } else if (response.status >= 500) {
      errorMessage = 'Volcano API 服务器错误：服务暂时不可用';
    }

    const fullErrorMessage = `${errorMessage}\n\n详细信息：\n${errorDetails}\n\n配置信息：\n- Base URL: ${baseUrl}\n- Model: ${model}\n- API Key: ${apiKey ? '已设置' : '未设置'}`;

    throw new Error(fullErrorMessage);
  }

  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;

  if (!result) {
    throw new Error('No response from Volcano API');
  }

  // 尝试解析JSON
  try {
    const flashcards = JSON.parse(result.trim());
    if (!Array.isArray(flashcards)) {
      throw new Error('Response is not an array');
    }

    // 验证格式
    const validatedFlashcards = flashcards.map((item: any, index: number) => {
      if (!item.q || !item.a) {
        throw new Error(`Invalid flashcard format at index ${index}`);
      }
      return {
        q: String(item.q).trim(),
        a: String(item.a).trim()
      };
    });

    return validatedFlashcards;
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Raw response:', result);
    throw new Error('Failed to parse Volcano API response as valid JSON');
  }
};

/**
 * 使用GPT-4o-mini生成闪卡
 */
export const generateFlashcards = async (content: string, config?: LLMConfig): Promise<FlashcardItem[]> => {
  console.log('generateFlashcards called with config:', config);
  console.log('config?.provider:', config?.provider);
  console.log('config?.customBaseUrl:', config?.customBaseUrl);
  console.log('config?.customApiKey:', config?.customApiKey ? '***set***' : '***not set***');

  // 检查是否有有效的配置
  if (!config) {
    throw new Error('API配置未设置。请在设置中配置LLM API。');
  }

  // 根据提供商路由到不同的处理函数
  switch (config.provider) {
    case 'custom':
      console.log('Using custom API');
      if (!config.customBaseUrl || !config.customApiKey) {
        throw new Error('自定义API配置不完整。请填写Base URL和API Key。');
      }
      return generateFlashcardsWithCustomAPI(content, config);

    case 'gemini':
      console.log('Using Gemini API');
      if (!config.geminiApiKey) {
        throw new Error('Gemini API key not configured. Please set geminiApiKey in settings.');
      }
      // TODO: 实现Gemini API调用
      throw new Error('Gemini API暂未实现，请使用其他提供商。');

    case 'volcano':
      console.log('Using Volcano API');
      if (!config.volcanoApiKey) {
        throw new Error('Volcano API key not configured. Please set volcanoApiKey in settings.');
      }
      return generateFlashcardsWithVolcanoAPI(content, config);

    default:
      throw new Error(`不支持的提供商: ${config.provider}`);
  }
};