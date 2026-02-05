#!/usr/bin/env python3
"""
测试新的自动文档分析功能
"""
import requests
import json

def test_auto_document_analysis():
    """测试自动文档分析功能"""

    # 测试文档内容
    test_content = """# Python编程基础

## 变量和数据类型

Python是一种动态类型语言，变量不需要声明类型。

### 基本数据类型
- **整数 (int)**: 如 42, -10
- **浮点数 (float)**: 如 3.14, -2.5
- **字符串 (str)**: 如 "Hello", 'World'
- **布尔值 (bool)**: True 或 False

### 变量赋值
```python
name = "Alice"
age = 25
height = 1.68
is_student = True
```

## 控制结构

### 条件语句
```python
if age >= 18:
    print("成年")
else:
    print("未成年")
```

### 循环语句
```python
# for循环
for i in range(5):
    print(i)

# while循环
count = 0
while count < 5:
    print(count)
    count += 1
```"""

    # 保存测试文件
    with open('test_python_doc.md', 'w', encoding='utf-8') as f:
        f.write(test_content)

    # 测试API
    url = 'http://localhost:8000/api/process-text'

    with open('test_python_doc.md', 'rb') as f:
        files = {'file': ('test_python_doc.md', f, 'text/markdown')}
        data = {
            'system_prompt': """# AI Learning Coach - Automatic Document Analysis

You are an intelligent learning coach that automatically analyzes any document and creates effective flashcards for memory training and knowledge absorption.

## Your Mission
Transform any uploaded document into a structured learning deck that helps users deeply understand and retain the content.

## Analysis Process
1. Document Type Detection: Automatically identify content type
2. Content Structure: Extract main topics, subtopics, key concepts
3. Knowledge Framework: Build connections between ideas
4. Question Generation: Create varied question types

## Flashcard Categories
- IDENTITY: Core concepts, definitions
- APPEARANCE: Characteristics, features
- PERSONALITY: Principles, methodologies
- NARRATIVE: Processes, sequences
- SYMBOLISM: Relationships, connections
- ORIGIN: History, background
- TABOO: Common mistakes, misconceptions

## Output Requirements
Generate JSON array with: ip, section, question, hint, text, image fields."""
        }

        try:
            response = requests.post(url, files=files, data=data)
            print(f"Status Code: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print("✅ API调用成功!")
                print(f"消息: {result.get('message', 'N/A')}")
                print(f"生成卡片数量: {len(result.get('cards', []))}")

                # 显示前3张卡片
                cards = result.get('cards', [])[:3]
                for i, card in enumerate(cards, 1):
                    print(f"\n卡片 {i}:")
                    print(f"  IP: {card.get('ip', 'N/A')}")
                    print(f"  Section: {card.get('section', 'N/A')}")
                    print(f"  Question: {card.get('question', 'N/A')}")
                    print(f"  Hint: {card.get('hint', 'N/A')}")
                    print(f"  Text: {card.get('text', 'N/A')[:100]}...")
            else:
                print(f"❌ API调用失败: {response.text}")

        except Exception as e:
            print(f"❌ 请求异常: {e}")

if __name__ == "__main__":
    test_auto_document_analysis()