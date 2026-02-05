#!/usr/bin/env python3
"""
测试Word文档JSON解析修复
"""
import requests
import json
import os

def test_word_docx_json_fix():
    """测试修复后的Word文档处理和JSON解析"""
    
    # 创建一个包含特殊字符的测试文档内容
    test_content = '''# 测试文档 - 特殊字符处理

## 引号和特殊符号
字符串可以使用"双引号"或'单引号'。
特殊符号：@#$%^&*()[]{}|\\:;"'<>,.?/

## 中文字符和标点
中文标点：，。！？；：""''（）【】《》……
全角符号：１２３ＡＢＣａｂｃ

## 多行内容
这是一个很长的段落，
包含多行文本。
应该能够正确处理换行符
和段落分隔。

## 代码示例
```python
def test_function():
    # 这是一个注释
    return "Hello, 世界!"
```

## 列表项目
- 项目1：包含中文
- 项目2：包含"引号"
- 项目3：包含'单引号'
- 项目4：包含特殊字符 @#$%

## 表格数据
| 列1 | 列2 | 列3 |
|------|------|------|
| 数据1 | 数据"2" | 数据'3' |
| 中文 | 符号@ | 数字123 |

## 数学公式
E = mc²
a² + b² = c²
∑(xᵢ) = n

## 结束语
这个文档包含了各种可能导致JSON解析问题的特殊字符。'''

    # 保存为临时文件（模拟.docx文件）
    temp_docx_path = 'test_special_chars.docx'
    with open(temp_docx_path, 'w', encoding='utf-8') as f:
        f.write(test_content)

    print("✅ 创建了包含特殊字符的测试Word文档")
    print(f"📁 文件路径: {temp_docx_path}")
    print(f"📏 文件大小: {os.path.getsize(temp_docx_path)} bytes")
    print()

    # 测试API
    url = 'http://localhost:8000/api/process-text'
    
    try:
        with open(temp_docx_path, 'rb') as f:
            files = {'file': ('test_special_chars.docx', f, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
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
If the suggested categories don't fit well, create meaningful custom category names that reflect the document's content type and structure. For technical/programming content, prefer these:

**Programming & Technical:**
- ALGORITHM (algorithms, data structures, computational methods)
- SYNTAX (language syntax, code patterns, formatting rules)
- METHODOLOGY (development approaches, best practices, frameworks)
- API_REFERENCE (function signatures, parameters, return values)
- DEBUGGING (error handling, troubleshooting, common issues)

**Scientific & Academic:**
- THEORY (theoretical concepts, mathematical foundations)
- EXPERIMENT (research methods, experimental design)
- ANALYSIS (data analysis techniques, statistical methods)
- HYPOTHESIS (scientific hypotheses, research questions)

**Business & Process:**
- STRATEGY (business strategies, planning approaches)
- WORKFLOW (business processes, operational procedures)
- METRICS (KPIs, performance indicators, measurements)

Choose categories that make LEARNING LOGICAL and help users understand the content structure. For technical documents, prefer creating specific categories like ALGORITHM, SYNTAX, METHODOLOGY over generic ones.

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

Focus on creating flashcards that transform passive reading into active learning and deep understanding.

【重要格式要求】
你必须只输出一个有效的JSON数组，不要输出任何其他文字、解释或markdown格式。
JSON格式必须完全正确：
- 使用双引号，不要使用单引号
- 正确转义字符串中的特殊字符
- 确保所有括号、中括号都匹配
- 不要在JSON中包含注释
- 不要使用多行字符串
- 数组中每个对象必须包含：ip, section, question, hint, text, image字段

示例格式：
[{"ip":"主题","section":"IDENTITY","question":"问题？","hint":"提示","text":"答案","image":""}]'''}

            print("🚀 发送请求到API...")
            response = requests.post(url, files=files, data=data, timeout=120)

            print(f"📡 响应状态码: {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print("✅ API调用成功!")
                print(f"📊 生成卡片数量: {len(result.get('cards', []))}")
                print(f"📝 文档标题: {result.get('deck_title')}")

                if result.get('cards'):
                    print("\n🃏 前3张卡片预览:")
                    for i, card in enumerate(result.get('cards', [])[:3], 1):
                        print(f"  {i}. [{card.get('section')}] {card.get('question')[:60]}...")

                print("\n🎯 Word文档JSON解析修复测试成功!")

            elif response.status_code == 500:
                error_data = response.json()
                error_detail = error_data.get('detail', 'Unknown error')
                print(f"❌ 服务器错误: {error_detail}")
                
                # 检查是否是JSON解析错误
                if "AI 返回的不是合法 JSON" in error_detail:
                    print("\n🔍 详细错误分析:")
                    lines = error_detail.split('\n')
                    for line in lines:
                        if line.strip():
                            print(f"  {line}")
                    
                    print("\n💡 建议解决方案:")
                    print("  1. 检查Word文档是否包含特殊字符")
                    print("  2. 尝试简化文档内容")
                    print("  3. 联系开发者获取更多调试信息")
                else:
                    print(f"❌ 其他错误: {error_detail}")
            else:
                print(f"❌ HTTP错误 {response.status_code}: {response.text[:300]}")

    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到API服务器")
        print("请确保后端服务器正在运行 (python main.py)")
    except Exception as e:
        print(f"❌ 请求异常: {e}")
    finally:
        # 清理临时文件
        if os.path.exists(temp_docx_path):
            os.unlink(temp_docx_path)
            print(f"\n🧹 已清理临时文件: {temp_docx_path}")

if __name__ == "__main__":
    test_word_docx_json_fix()