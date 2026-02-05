#!/usr/bin/env python3
"""
测试Word文档处理功能
"""
import requests
import json
import os
from pathlib import Path

def test_docx_processing():
    """测试Word文档处理功能"""

    # 创建一个模拟的Word文档内容（实际上是文本，但我们会模拟.docx扩展名）
    test_content = """# 机器学习基础概念

## 监督学习
监督学习使用标记的训练数据来训练模型。训练数据包含输入特征和对应的正确输出标签。

### 关键概念：
- 特征（Features）：输入数据的属性
- 标签（Labels）：我们想要预测的目标值
- 训练集（Training Set）：用于训练模型的数据

### 无监督学习
无监督学习不使用标记数据，算法试图从数据中发现隐藏的模式或结构。

## 模型评估
- 准确率（Accuracy）
- 精确率（Precision）
- 召回率（Recall）
- F1分数

## 常见问题
1. 过拟合：模型在训练数据上表现良好，但在新数据上表现差
2. 欠拟合：模型过于简单，无法捕捉数据中的模式"""

    # 保存为临时文件（模拟.docx文件）
    temp_docx_path = 'test_ml.docx'
    with open(temp_docx_path, 'w', encoding='utf-8') as f:
        f.write(test_content)

    print("✅ 创建了测试Word文档（模拟）")
    print(f"📁 文件路径: {temp_docx_path}")
    print(f"📏 文件大小: {os.path.getsize(temp_docx_path)} bytes")
    print()

    # 现在测试API（虽然我们没有真正的.docx文件，但可以测试文件类型检查）
    url = 'http://localhost:8000/api/process-text'

    try:
        with open(temp_docx_path, 'rb') as f:
            files = {'file': ('test_ml.docx', f, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
            data = {'system_prompt': '自动分析文档并生成学习卡片'}

            print("🚀 发送请求到API...")
            response = requests.post(url, files=files, data=data, timeout=30)

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

                print("\n🎯 Word文档处理功能测试成功!")

            elif response.status_code == 400:
                error_msg = response.json().get('detail', 'Unknown error')
                if '不支持的文件类型' in error_msg:
                    print("❌ 文件类型检查失败")
                    print(f"错误信息: {error_msg}")
                else:
                    print(f"❌ API错误: {error_msg}")
            else:
                print(f"❌ HTTP错误 {response.status_code}: {response.text[:200]}")

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
    test_docx_processing()