#!/usr/bin/env python3
"""
测试嵌套引号修复
"""
import re

def test_quote_fixing():
    test = '"如何使用"引号"？"'
    print(f"原始: {test}")

    # 测试正则表达式
    pattern = r'([a-zA-Z\u4e00-\u9fff])"([a-zA-Z\u4e00-\u9fff])'
    result = re.sub(pattern, r"\1'\2", test)
    print(f"修复后: {result}")

    # 检查字符
    for i, char in enumerate(test):
        print(f"{i}: '{char}' (ord: {ord(char)})")

if __name__ == "__main__":
    test_quote_fixing()