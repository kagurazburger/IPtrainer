# Python编程教程

## 基础语法
Python使用缩进作为代码块的分隔符。

### 变量赋值
```python
name = "Alice"
age = 25
```

### 数据类型
- 字符串 (str)
- 整数 (int)
- 浮点数 (float)
- 布尔值 (bool)

## 控制结构

### 条件语句
```python
if age >= 18:
    print("成年")
else:
    print("未成年")
```

### 循环结构
```python
for i in range(5):
    print(i)

while count < 10:
    count += 1
```

## 函数定义
```python
def greet(name):
    return f"Hello, {name}!"

result = greet("World")
```

## 常见错误
- 忘记缩进
- 变量名拼写错误
- 类型不匹配