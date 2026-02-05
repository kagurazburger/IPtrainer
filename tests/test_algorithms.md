# Python算法实现

## 排序算法

### 快速排序 (Quick Sort)
快速排序是一种高效的排序算法，平均时间复杂度为O(n log n)。

```python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)
```

**算法步骤**:
1. 选择基准元素(pivot)
2. 将数组分为小于、等于、大于基准的三部分
3. 递归排序左右子数组
4. 合并结果

### 二分查找 (Binary Search)
二分查找算法用于在有序数组中查找元素。

```python
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```

**前提条件**: 数组必须有序
**时间复杂度**: O(log n)

## 数据结构

### 栈 (Stack)
后进先出(LIFO)数据结构。

```python
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()

    def is_empty(self):
        return len(self.items) == 0
```

### 队列 (Queue)
先进先出(FIFO)数据结构。

```python
class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, item):
        self.items.insert(0, item)

    def dequeue(self):
        return self.items.pop()

    def is_empty(self):
        return len(self.items) == 0
```