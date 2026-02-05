#!/usr/bin/env python3
"""
测试改进的JSON清理逻辑
"""
import json
import sys
import os

# 添加backend目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from main import _clean_json_content

def test_improved_json_cleaning():
    """测试改进的JSON清理功能"""

    print("🧪 测试改进的JSON清理逻辑")
    print("=" * 50)

    # 测试用例1: 未终止字符串
    test1 = '''[
  {"ip": "测试", "section": "IDENTITY", "question": "问题？", "hint": "提示", "text": "这是一个未终止的字符串, "image": ""}
]'''

    print("\n🧪 测试1: 未终止字符串")
    print("=" * 30)
    print(f"原始内容: {test1}")
    cleaned1 = _clean_json_content(test1)
    print(f"清理后: {cleaned1}")
    try:
        result1 = json.loads(cleaned1)
        print("✅ 解析成功!")
        print(f"获得 {len(result1)} 张卡片")
    except json.JSONDecodeError as e:
        print(f"❌ 解析失败: {e}")

    # 测试用例2: 嵌套引号问题
    test2 = '''[
  {"ip": "测试", "section": "NARRATIVE", "question": "如何使用"引号"？", "hint": "引号", "text": "使用"双引号"或'单引号'", "image": ""}
]'''

    print("\n🧪 测试2: 嵌套引号问题")
    print("=" * 30)
    print(f"原始内容: {test2}")
    cleaned2 = _clean_json_content(test2)
    print(f"清理后: {cleaned2}")
    try:
        result2 = json.loads(cleaned2)
        print("✅ 解析成功!")
        print(f"获得 {len(result2)} 张卡片")
    except json.JSONDecodeError as e:
        print(f"❌ 解析失败: {e}")

    # 测试用例3: 多余逗号
    test3 = '''[
  {"ip": "测试", "section": "IDENTITY", "question": "问题？", "hint": "提示", "text": "答案", "image": "",},
]'''

    print("\n🧪 测试3: 多余逗号")
    print("=" * 30)
    print(f"原始内容: {test3}")
    cleaned3 = _clean_json_content(test3)
    print(f"清理后: {cleaned3}")
    try:
        result3 = json.loads(cleaned3)
        print("✅ 解析成功!")
        print(f"获得 {len(result3)} 张卡片")
    except json.JSONDecodeError as e:
        print(f"❌ 解析失败: {e}")

    # 测试用例4: 复杂混合问题
    test4 = '''[
  {"ip": "测试主题", "section": "IDENTITY", "question": "什么是"测试"？", "hint": "测试", "text": "测试是一种方法, "image": "",},
  {"ip": "另一个主题", "section": "NARRATIVE", "question": "如何做"这个"？", "hint": "方法", "text": "按照步骤来做", "image": ""}
]'''

    print("\n🧪 测试4: 复杂混合问题")
    print("=" * 30)
    print(f"原始内容: {test4}")
    cleaned4 = _clean_json_content(test4)
    print(f"清理后: {cleaned4}")
    try:
        result4 = json.loads(cleaned4)
        print("✅ 解析成功!")
        print(f"获得 {len(result4)} 张卡片")
    except json.JSONDecodeError as e:
        print(f"❌ 解析失败: {e}")

if __name__ == "__main__":
    test_improved_json_cleaning()