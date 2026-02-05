// 调试前端配置状态的脚本
// 在浏览器控制台中运行

function debugFrontendConfig() {
  console.log('=== 前端配置调试 ===');

  // 检查localStorage
  const apiConfigStr = localStorage.getItem('api_config');
  console.log('本地API配置:', apiConfigStr ? JSON.parse(apiConfigStr) : '未设置');

  // 检查用户会话
  const userSessionStr = localStorage.getItem('trainer_user_session');
  if (userSessionStr) {
    const userSession = JSON.parse(userSessionStr);
    console.log('用户会话:', {
      username: userSession.username,
      hasApiConfig: !!userSession.apiConfig,
      apiConfig: userSession.apiConfig
    });
  } else {
    console.log('用户会话: 未登录');
  }

  // 检查当前用户
  const currentUserId = localStorage.getItem('live_memory_trainer_current_user');
  console.log('当前用户ID:', currentUserId);

  // 检查所有用户
  const usersStr = localStorage.getItem('live_memory_trainer_users');
  if (usersStr) {
    const users = JSON.parse(usersStr);
    console.log('所有用户数量:', users.length);
    users.forEach((user, index) => {
      console.log(`用户 ${index + 1}:`, {
        username: user.username,
        hasApiConfig: !!user.apiConfig,
        apiConfig: user.apiConfig
      });
    });
  } else {
    console.log('用户数据: 未找到');
  }

  console.log('=== 调试完成 ===');
  console.log('复制上面的函数到浏览器控制台运行: debugFrontendConfig()');
}

console.log('请在浏览器控制台中运行: debugFrontendConfig()');
console.log('函数已定义，复制到控制台执行即可');