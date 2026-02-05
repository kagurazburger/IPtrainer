import { User, APIConfig } from '../types';

const USERS_STORAGE_KEY = 'live_memory_trainer_users';
const CURRENT_USER_KEY = 'live_memory_trainer_current_user';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  password: string;
}

/**
 * 获取所有用户数据
 */
const getUsers = (): User[] => {
  try {
    const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
    return usersJson ? JSON.parse(usersJson) : [];
  } catch (error) {
    console.error('Failed to load users:', error);
    return [];
  }
};

/**
 * 保存所有用户数据
 */
const saveUsers = (users: User[]): void => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Failed to save users:', error);
  }
};

/**
 * 获取当前登录用户
 */
export const getCurrentUser = (): User | null => {
  try {
    const userId = localStorage.getItem(CURRENT_USER_KEY);
    if (!userId) return null;

    const users = getUsers();
    return users.find(user => user.id === userId) || null;
  } catch (error) {
    console.error('Failed to get current user:', error);
    return null;
  }
};

/**
 * 设置当前登录用户
 */
const setCurrentUser = (user: User | null): void => {
  try {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, user.id);
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  } catch (error) {
    console.error('Failed to set current user:', error);
  }
};

/**
 * 用户注册
 */
export const registerUser = (data: RegisterData): { success: boolean; user?: User; error?: string } => {
  const { username, password } = data;

  // 验证输入
  if (!username.trim() || !password.trim()) {
    return { success: false, error: '用户名和密码不能为空' };
  }

  if (username.length < 3) {
    return { success: false, error: '用户名至少需要3个字符' };
  }

  if (password.length < 6) {
    return { success: false, error: '密码至少需要6个字符' };
  }

  const users = getUsers();

  // 检查用户名是否已存在
  if (users.some(user => user.username === username)) {
    return { success: false, error: '用户名已存在' };
  }

  // 创建新用户
  const newUser: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    username: username.trim(),
    password: password, // 注意：生产环境中应该哈希密码
    syncKey: `LMT_${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    lastSynced: Date.now(),
  };

  users.push(newUser);
  saveUsers(users);
  setCurrentUser(newUser);

  return { success: true, user: newUser };
};

/**
 * 用户登录
 */
export const loginUser = (credentials: LoginCredentials): { success: boolean; user?: User; error?: string } => {
  const { username, password } = credentials;

  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return { success: false, error: '用户名或密码错误' };
  }

  setCurrentUser(user);
  return { success: true, user };
};

/**
 * 用户登出
 */
export const logoutUser = (): void => {
  setCurrentUser(null);
};

/**
 * 更新用户API配置
 */
export const updateUserApiConfig = (userId: string, apiConfig: APIConfig): boolean => {
  try {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) return false;

    users[userIndex].apiConfig = apiConfig;
    users[userIndex].lastSynced = Date.now();
    saveUsers(users);

    return true;
  } catch (error) {
    console.error('Failed to update user API config:', error);
    return false;
  }
};

/**
 * 获取用户API配置
 */
export const getUserApiConfig = (userId: string): APIConfig | null => {
  try {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    return user?.apiConfig || null;
  } catch (error) {
    console.error('Failed to get user API config:', error);
    return null;
  }
};

/**
 * 删除用户账户
 */
export const deleteUser = (userId: string): boolean => {
  try {
    const users = getUsers();
    const filteredUsers = users.filter(u => u.id !== userId);

    if (filteredUsers.length === users.length) return false;

    saveUsers(filteredUsers);

    // 如果删除的是当前用户，登出
    const currentUser = getCurrentUser();
    if (currentUser?.id === userId) {
      logoutUser();
    }

    return true;
  } catch (error) {
    console.error('Failed to delete user:', error);
    return false;
  }
};