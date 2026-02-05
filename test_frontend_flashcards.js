import { generateFlashcards } from './src/services/openaiService.ts';

// 模拟前端的LLM配置
const mockApiConfig = {
  provider: 'volcano',
  volcanoApiKey: '1805dc99-496f-4f37-89f1-b7e929ba21b4',
  volcanoModel: 'doubao-seed-1-8-251228',
  volcanoBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  enabled: true
};

const testContent = `人工智能的发展历程：
1. 1950年代：图灵测试提出
2. 1960年代：专家系统诞生
3. 1980年代：神经网络复兴
4. 2010年代：深度学习突破
5. 2020年代：大语言模型时代`;

async function testFrontendFlashcardGeneration() {
  console.log('Testing frontend flashcard generation...');
  console.log('API Config:', mockApiConfig);
  console.log('Test Content:', testContent.substring(0, 100) + '...');

  try {
    const flashcards = await generateFlashcards(testContent, mockApiConfig);
    console.log('Success! Generated flashcards:', flashcards);
    console.log(`Generated ${flashcards.length} flashcards`);
  } catch (error) {
    console.error('Error generating flashcards:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testFrontendFlashcardGeneration();