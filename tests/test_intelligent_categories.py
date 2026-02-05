#!/usr/bin/env python3
"""
测试智能分类功能
"""
import requests
import json

def test_intelligent_categories():
    """测试AI是否能智能选择分类"""

    # 测试API
    url = 'http://localhost:8000/api/process-text'
    with open('test_python_tutorial.md', 'rb') as f:
        files = {'file': ('test_python_tutorial.md', f, 'text/markdown')}
        data = {'system_prompt': '''# AI Learning Coach - Automatic Document Analysis

You are an intelligent learning coach that automatically analyzes any document and creates effective flashcards for memory training and knowledge absorption.

## Your Mission
Transform any uploaded document into a structured learning deck that helps users deeply understand and retain the content. Act as a teacher who identifies key concepts, creates meaningful questions, and builds knowledge frameworks.

## Analysis Process
1. Document Type Detection: Automatically identify if the content is academic, technical, business, creative, historical, scientific, or general knowledge
2. Content Structure: Extract main topics, subtopics, key concepts, definitions, processes, examples, and relationships
3. Knowledge Framework: Build connections between ideas, identify prerequisites, and create learning pathways
4. Question Generation: Create varied question types (factual, conceptual, analytical, application-based)

## Intelligent Category Selection (section field)
Analyze the document content and choose the MOST APPROPRIATE category for each flashcard. You can use these suggested categories or create CUSTOM categories that better fit the content:

### Suggested Categories (use when appropriate):
- IDENTITY: Core concepts, definitions, main ideas, what something IS
- APPEARANCE: Characteristics, features, attributes, how something LOOKS or WORKS
- PERSONALITY: Principles, theories, methodologies, behavioral patterns
- NARRATIVE: Processes, sequences, timelines, stories, how things HAPPEN
- SYMBOLISM: Relationships, connections, analogies, meanings
- ORIGIN: History, background, development, evolution
- TABOO: Common mistakes, misconceptions, pitfalls, what to AVOID

### Custom Categories (create when needed):
If the suggested categories don't fit well, create meaningful custom category names that reflect the document's content type and structure. Examples:
- ALGORITHM (for programming/technical docs)
- THEORY (for scientific/academic content)
- METHODOLOGY (for research methods)
- CASE_STUDY (for practical examples)
- BEST_PRACTICE (for guidelines)
- TUTORIAL (for step-by-step guides)
- REFERENCE (for lookup information)

Choose categories that make LEARNING LOGICAL and help users understand the content structure.

## Output Requirements
Generate a JSON array of flashcards. Each card must have:
- ip: Document title or main subject area
- section: Most appropriate category (use existing or create custom)
- question: A clear, specific question that tests understanding
- hint: 2-4 key words or concepts (comma-separated)
- text: Complete, accurate answer with context
- image: Leave empty string "" unless content specifically references images

## Quality Standards
- Questions should promote active recall, not just recognition
- Answers should be comprehensive but concise
- Cover both breadth and depth of the content
- Create logical learning sequences
- Include both basic facts and deeper insights
- Categories should reflect the document's natural structure and content type

Focus on creating flashcards that transform passive reading into active learning and deep understanding.'''}

        try:
            response = requests.post(url, files=files, data=data, timeout=120)
            print(f'Status: {response.status_code}')

            if response.status_code == 200:
                result = response.json()
                print(f'✅ Success! Generated {len(result.get("cards", []))} cards')
                print(f'Document: Python编程教程')
                print()

                # 分析分类使用情况
                categories = {}
                for card in result.get('cards', []):
                    cat = card.get('section', 'UNKNOWN')
                    if cat not in categories:
                        categories[cat] = []
                    categories[cat].append(card.get('question', '')[:50])

                print('📊 分类使用统计:')
                for cat, questions in categories.items():
                    print(f'  {cat}: {len(questions)} 张卡片')
                    for q in questions[:2]:  # 只显示前2个问题
                        print(f'    - {q}...')
                print()

                # 显示所有卡片详情
                for i, card in enumerate(result.get('cards', []), 1):
                    print(f'卡片 {i}:')
                    print(f'  主题: {card.get("ip")}')
                    print(f'  分类: {card.get("section")}')
                    print(f'  问题: {card.get("question")}')
                    print(f'  提示: {card.get("hint")}')
                    print(f'  答案: {card.get("text")[:100]}...')
                    print()
            else:
                print('❌ Error:', response.text[:500])

        except Exception as e:
            print('❌ Exception:', e)

if __name__ == "__main__":
    test_intelligent_categories()