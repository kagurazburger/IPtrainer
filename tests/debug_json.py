#!/usr/bin/env python3
"""
调试JSON清理逻辑
"""
import json
import re

def debug_json_cleaning():
    """调试JSON清理功能"""

    # 测试用例1: 未终止字符串
    test1 = '''[
  {"ip": "测试", "section": "IDENTITY", "question": "问题？", "hint": "提示", "text": "这是一个未终止的字符串, "image": ""}
]'''

    print("原始内容:")
    print(test1)
    print("\n引号计数:", test1.count('"'))

    # 测试正则表达式
    def replace_quotes_in_string(match):
        inner = match.group(1)
        print(f"匹配到字符串: '{inner}'")
        fixed = re.sub(r'(?<!\\)"', "'", inner)
        print(f"修复后: '{fixed}'")
        return f'"{fixed}"'

    result = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', replace_quotes_in_string, test1)
    print("\n正则处理后:")
    print(result)

    # 测试状态机
    in_string = False
    escape_next = False
    result2 = []

    for char in test1:
        if escape_next:
            result2.append(char)
            escape_next = False
            continue

        if char == '\\':
            escape_next = True
            result2.append(char)
            continue

        if char == '"':
            in_string = not in_string
            result2.append(char)
            continue

        result2.append(char)

    if in_string:
        result2.append('"')

    final = ''.join(result2)
    print("\n状态机处理后:")
    print(final)
    print("引号计数:", final.count('"'))

if __name__ == "__main__":
    debug_json_cleaning()