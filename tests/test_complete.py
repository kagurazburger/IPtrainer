#!/usr/bin/env python3
"""
完整测试自动文档分析功能
"""
import requests
import json

def test_complete_auto_analysis():
    """测试完整的自动文档分析功能"""

    # 创建测试文档
    test_content = """# 机器学习简介

## 监督学习
监督学习使用标记数据训练模型。

### 关键概念
1. 特征 (Features): 输入变量
2. 标签 (Labels): 输出目标
3. 训练数据: 用于学习的数据

### 算法类型
- 分类: 预测离散类别
- 回归: 预测连续数值

## 模型评估
- 准确率: 正确预测比例
- 精确率: 真正例/预测正例
- 召回率: 真正例/实际正例

## 过拟合问题
当模型在训练数据上表现很好但在未知数据上表现差时发生。"""

    with open('test_ml_complete.md', 'w', encoding='utf-8') as f:
        f.write(test_content)

    # 测试API
    url = 'http://localhost:8000/api/process-text'
    with open('test_ml_complete.md', 'rb') as f:
        files = {'file': ('test_ml_complete.md', f, 'text/markdown')}
        data = {'system_prompt': '自动分析文档并生成学习卡片'}

        try:
            response = requests.post(url, files=files, data=data, timeout=120)
            print(f'Status: {response.status_code}')

            if response.status_code == 200:
                result = response.json()
                print(f'✅ Success! Generated {len(result.get("cards", []))} cards')
                print(f'Deck title: {result.get("deck_title")}')
                print()

                # 显示所有卡片
                for i, card in enumerate(result.get('cards', []), 1):
                    print(f'Card {i}:')
                    print(f'  Topic: {card.get("ip")}')
                    print(f'  Category: {card.get("section")}')
                    print(f'  Question: {card.get("question")}')
                    print(f'  Hint: {card.get("hint")}')
                    print(f'  Answer: {card.get("text")[:100]}...')
                    print()
            else:
                print('❌ Error:', response.text[:500])

        except Exception as e:
            print('❌ Exception:', e)

if __name__ == "__main__":
    test_complete_auto_analysis()