#!/usr/bin/env python3
"""
精确测试JSON修复
"""
import json
import re

def test_specific_fixes():
    """测试具体的修复方法"""

    # 测试用例1: 未终止字符串
    test1 = '''[
  {"ip": "测试", "section": "IDENTITY", "question": "问题？", "hint": "提示", "text": "这是一个未终止的字符串, "image": ""}
]'''

    print("原始测试1:")
    print(test1)

    # 修复嵌套引号
    fixed1 = re.sub(r'([a-zA-Z\u4e00-\u9fff])"([a-zA-Z\u4e00-\u9fff])', r"\1'\2", test1)
    print("\n修复嵌套引号后:")
    print(fixed1)

    # 修复缺少逗号 - 具体模式
    # 查找 "字符串, "image": 模式
    fixed1 = re.sub(r'("text"\s*:\s*"[^"]*),(\s*"image")', r'\1"\2', fixed1)
    print("\n修复未终止字符串后:")
    print(fixed1)

    # 现在应该可以解析了
    try:
        result = json.loads(fixed1)
        print("✅ 解析成功!")
    except json.JSONDecodeError as e:
        print(f"❌ 仍然失败: {e}")

if __name__ == "__main__":
    test_specific_fixes()