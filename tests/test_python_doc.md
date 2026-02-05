# Python编程基础

## 变量和数据类型

Python是一种动态类型语言，变量不需要声明类型。

### 基本数据类型
- **整数 (int)**: 如 42, -10
- **浮点数 (float)**: 如 3.14, -2.5
- **字符串 (str)**: 如 "Hello", 'World'
- **布尔值 (bool)**: True 或 False

### 变量赋值
```python
name = "Alice"
age = 25
height = 1.68
is_student = True
```

## 控制结构

### 条件语句
```python
if age >= 18:
    print("成年")
else:
    print("未成年")
```

### 循环语句
```python
# for循环
for i in range(5):
    print(i)

# while循环
count = 0
while count < 5:
    print(count)
    count += 1
```