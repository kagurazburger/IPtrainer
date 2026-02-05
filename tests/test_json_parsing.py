#!/usr/bin/env python3
"""
测试JSON解析修复逻辑
"""
import json

def test_json_parsing_fix():
    """测试改进的JSON解析逻辑"""
    
    # 模拟一个有问题的AI响应
    problematic_response = '''这是一个测试响应。

```json
[
  {"ip": "测试主题", "section": "IDENTITY", "question": "什么是测试？", "hint": "测试,检查", "text": "测试是一种验证方法", "image": ""},
  {"ip": "测试主题", "section": "NARRATIVE", "question": "测试过程是什么？", "hint": "步骤,流程", "text": "测试过程包括准备、执行和验证阶段", "image": ""}
]
```

以上是生成的卡片。'''
    
    print("🔍 测试JSON解析修复逻辑")
    print(f"原始响应长度: {len(problematic_response)}")
    print(f"原始响应预览: {problematic_response[:200]}...")
    print()
    
    # 应用修复逻辑
    raw_content = problematic_response.strip()
    original_length = len(raw_content)
    
    # 清理可能的markdown代码块
    if raw_content.startswith("```"):
        lines = raw_content.split("\n")
        if lines[0].lower().startswith("```json"):
            lines = lines[1:]
        elif lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw_content = "\n".join(lines).strip()
    
    print(f"清理markdown后长度: {len(raw_content)}")
    print(f"清理后内容预览: {raw_content[:200]}...")
    print()
    
    # 进一步清理：移除可能的额外文本
    json_start = raw_content.find('[')
    json_end = raw_content.rfind(']') + 1
    
    if json_start != -1 and json_end > json_start:
        raw_content = raw_content[json_start:json_end]
    
    print(f"提取JSON部分后长度: {len(raw_content)}")
    print(f"提取后内容预览: {raw_content[:200]}...")
    print()
    
    # 验证JSON格式
    try:
        cards_raw = json.loads(raw_content)
        print("✅ JSON解析成功!")
        print(f"解析出 {len(cards_raw)} 张卡片")
        
        for i, card in enumerate(cards_raw[:2]):
            print(f"卡片 {i+1}: {card.get('question')}")
            
    except json.JSONDecodeError as e:
        print(f"❌ JSON解析失败: {e}")
        
        # 提供详细错误信息
        error_msg = f"AI 返回的不是合法 JSON: {e}\n"
        error_msg += f"原始响应长度: {original_length} 字符\n"
        error_msg += f"清理后长度: {len(raw_content)} 字符\n"
        error_msg += f"内容预览 (前500字符): {raw_content[:500]}...\n"
        error_msg += f"内容预览 (后500字符): ...{raw_content[-500:] if len(raw_content) > 500 else raw_content}"
        
        print("详细错误信息:")
        print(error_msg)

if __name__ == "__main__":
    test_json_parsing_fix()