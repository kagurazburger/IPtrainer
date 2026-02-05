#!/usr/bin/env python3
"""
测试更复杂的JSON解析问题
"""
import json

def test_complex_json_issues():
    """测试各种JSON解析问题"""
    
    test_cases = [
        {
            "name": "未终止字符串",
            "content": '''```json
[
  {"ip": "测试", "section": "IDENTITY", "question": "问题？", "hint": "提示", "text": "这是一个未终止的字符串, "image": ""}
]
```''',
        },
        {
            "name": "多余文本",
            "content": '''根据您提供的文档，我生成了以下学习卡片：

```json
[
  {"ip": "测试主题", "section": "IDENTITY", "question": "什么是测试？", "hint": "测试", "text": "测试是一种方法", "image": ""}
]
```

希望这些卡片对您有帮助！''',
        },
        {
            "name": "嵌套引号问题",
            "content": '''```json
[
  {"ip": "测试", "section": "NARRATIVE", "question": "如何使用"引号"？", "hint": "引号", "text": "使用"双引号"或'单引号'", "image": ""}
]
```''',
        }
    ]
    
    for test_case in test_cases:
        print(f"\n🧪 测试: {test_case['name']}")
        print("=" * 50)
        
        raw_content = test_case['content'].strip()
        original_length = len(raw_content)
        
        print(f"原始长度: {original_length}")
        print(f"原始内容: {raw_content[:100]}...")
        
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
        
        print(f"清理markdown后: {raw_content[:100]}...")
        
        # 提取JSON部分
        json_start = raw_content.find('[')
        json_end = raw_content.rfind(']') + 1
        
        if json_start != -1 and json_end > json_start:
            raw_content = raw_content[json_start:json_end]
        
        print(f"提取JSON后: {raw_content[:100]}...")
        
        # 尝试解析
        try:
            cards_raw = json.loads(raw_content)
            print(f"✅ 解析成功! 获得 {len(cards_raw)} 张卡片")
        except json.JSONDecodeError as e:
            print(f"❌ 解析失败: {e}")
            
            # 提供诊断信息
            error_msg = f"位置: {e.pos}, 行: {e.lineno}, 列: {e.colno}\n"
            error_msg += f"错误字符: '{raw_content[e.pos] if e.pos < len(raw_content) else 'EOF'}'\n"
            
            # 检查常见问题
            if '"' in raw_content and raw_content.count('"') % 2 != 0:
                error_msg += "可能问题: 引号数量不匹配\n"
            if '{' in raw_content and '}' in raw_content:
                brace_diff = raw_content.count('{') - raw_content.count('}')
                if brace_diff != 0:
                    error_msg += f"可能问题: 大括号不匹配 ({{ 多 {brace_diff} 个)\n"
            if '[' in raw_content and ']' in raw_content:
                bracket_diff = raw_content.count('[') - raw_content.count(']')
                if bracket_diff != 0:
                    error_msg += f"可能问题: 中括号不匹配 ([ 多 {bracket_diff} 个)\n"
            
            print(f"诊断信息:\n{error_msg}")

if __name__ == "__main__":
    test_complex_json_issues()