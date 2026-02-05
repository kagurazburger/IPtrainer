#!/usr/bin/env python3
"""
最终验证测试 - 使用实际的后端清理函数
"""
import json
import sys
import os

# 添加backend目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from main import _clean_json_content

def test_backend_json_cleaning():
    """使用实际的后端函数测试JSON清理"""

    print("🎯 最终验证 - 使用后端JSON清理函数")
    print("=" * 50)

    # 测试用例1: 未终止字符串 (模拟AI响应)
    test1 = '''```json
[
  {"ip": "测试", "section": "IDENTITY", "question": "问题？", "hint": "提示", "text": "这是一个未终止的字符串, "image": ""}
]
```'''

    print("\n🧪 测试1: 未终止字符串 (模拟AI响应)")
    print("=" * 40)
    print(f"原始响应: {test1.strip()}")

    # 模拟后端处理流程
    raw_content = test1.strip()
    original_length = len(raw_content)

    # 清理markdown代码块
    if raw_content.startswith("```"):
        lines = raw_content.split("\n")
        if lines[0].lower().startswith("```json"):
            lines = lines[1:]
        elif lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw_content = "\n".join(lines).strip()

    # 提取JSON数组部分
    json_start = raw_content.find('[')
    json_end = raw_content.rfind(']') + 1
    if json_start != -1 and json_end > json_start:
        raw_content = raw_content[json_start:json_end]

    # 应用我们的清理函数
    cleaned_content = _clean_json_content(raw_content)

    print(f"清理后: {cleaned_content}")
    try:
        result = json.loads(cleaned_content)
        print("✅ 解析成功!")
        print(f"获得 {len(result)} 张卡片")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ 解析失败: {e}")
        return False

    # 测试用例2: 嵌套引号问题
    test2 = '''```json
[
  {"ip": "测试", "section": "NARRATIVE", "question": "如何使用"引号"？", "hint": "引号", "text": "使用"双引号"或'单引号'", "image": ""}
]
```'''

    print("\n🧪 测试2: 嵌套引号问题")
    print("=" * 40)
    print(f"原始响应: {test2.strip()}")

    # 同样的处理流程
    raw_content = test2.strip()
    original_length = len(raw_content)

    # 清理markdown代码块
    if raw_content.startswith("```"):
        lines = raw_content.split("\n")
        if lines[0].lower().startswith("```json"):
            lines = lines[1:]
        elif lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw_content = "\n".join(lines).strip()

    # 提取JSON数组部分
    json_start = raw_content.find('[')
    json_end = raw_content.rfind(']') + 1
    if json_start != -1 and json_end > json_start:
        raw_content = raw_content[json_start:json_end]

    # 应用我们的清理函数
    cleaned_content = _clean_json_content(raw_content)

    print(f"清理后: {cleaned_content}")
    try:
        result = json.loads(cleaned_content)
        print("✅ 解析成功!")
        print(f"获得 {len(result)} 张卡片")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ 解析失败: {e}")
        return False

if __name__ == "__main__":
    success1 = test_backend_json_cleaning()
    print(f"\n📊 测试结果: {'全部通过' if success1 else '部分失败'}")