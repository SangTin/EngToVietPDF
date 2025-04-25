const { v4: uuidv4 } = require('uuid');
const cache = require('./cache');

const SESSION_TTL = 24 * 60 * 60; // Phiên làm việc kéo dài 24 giờ

// Tạo phiên làm việc mới
async function createSession(userId) {
  const sessionId = uuidv4();
  const sessionData = {
    userId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    jobs: [] // Danh sách job của người dùng
  };
  
  // Lưu phiên vào Redis
  await cache.setWithPriority(`session:${sessionId}`, sessionData, 'MEDIUM');
  
  return sessionId;
}

// Lấy thông tin phiên làm việc
async function getSession(sessionId) {
  if (!sessionId) return null;
  
  const sessionData = await cache.get(`session:${sessionId}`);
  if (!sessionData) return null;
  
  // Cập nhật thời gian hoạt động cuối
  sessionData.lastActivity = Date.now();
  await cache.setWithPriority(`session:${sessionId}`, sessionData, 'MEDIUM');
  
  return sessionData;
}

// Thêm job vào phiên làm việc
async function addJobToSession(sessionId, jobId) {
  try {
    // Thêm jobId vào một set trong Redis
    await cache.redisClient.sAdd(`session:${sessionId}:jobs`, jobId);
    
    // Lưu thông tin job riêng biệt
    await cache.redisClient.hSet(`job:${jobId}`, {
      sessionId,
      createdAt: Date.now()
    });
    
    // Cập nhật thời gian hoạt động cuối
    await cache.redisClient.set(`session:${sessionId}:lastActivity`, Date.now());
    await cache.redisClient.expire(`session:${sessionId}:lastActivity`, 24 * 60 * 60);
    
    // Đặt thời gian sống cho set
    await cache.redisClient.expire(`session:${sessionId}:jobs`, 24 * 60 * 60);
    
    console.log(`Đã thêm job ${jobId} vào phiên ${sessionId}`);
    return true;
  } catch (error) {
    console.error(`Lỗi khi thêm job ${jobId} vào phiên:`, error);
    return false;
  }
}

async function getSessionJobs(sessionId) {
  try {
    // Lấy tất cả jobId từ set
    const jobIds = await cache.redisClient.sMembers(`session:${sessionId}:jobs`);
    
    if (!jobIds || jobIds.length === 0) {
      return [];
    }
    
    // Lấy thông tin chi tiết cho mỗi job
    const jobs = [];
    for (const jobId of jobIds) {
      const jobInfo = await cache.redisClient.hGetAll(`job:${jobId}`);
      if (jobInfo && jobInfo.createdAt) {
        jobs.push({
          jobId,
          createdAt: parseInt(jobInfo.createdAt),
          name: jobInfo.name || null
        });
      }
    }
    
    // Sắp xếp theo thời gian gần nhất
    jobs.sort((a, b) => b.createdAt - a.createdAt);
    
    return jobs;
  } catch (error) {
    console.error(`Lỗi khi lấy danh sách job của phiên ${sessionId}:`, error);
    return [];
  }
}

// Lưu cài đặt người dùng
async function saveUserSettings(sessionId, settings) {
  const sessionData = await getSession(sessionId);
  if (!sessionData) return false;
  
  sessionData.settings = {
    ...sessionData.settings || {},
    ...settings
  };
  
  await cache.setWithPriority(`session:${sessionId}`, sessionData, 'MEDIUM');
  return true;
}

// Lấy cài đặt người dùng
async function getUserSettings(sessionId) {
  const sessionData = await getSession(sessionId);
  if (!sessionData) return {};
  
  return sessionData.settings || {};
}

// Đặt tên cho job
async function renameJob(sessionId, jobId, name) {
  try {
    // Kiểm tra xem job có thuộc phiên không
    const isMember = await cache.redisClient.sIsMember(`session:${sessionId}:jobs`, jobId);
    if (!isMember) {
      console.log(`Job ${jobId} không thuộc phiên ${sessionId}`);
      return false;
    }
    
    // Lưu tên mới vào thông tin job
    await cache.redisClient.hSet(`job:${jobId}`, {
      name
    });
    
    console.log(`Đã đổi tên job ${jobId} thành "${name}"`);
    return true;
  } catch (error) {
    console.error(`Lỗi khi đổi tên job ${jobId}:`, error);
    return false;
  }
}

module.exports = {
  createSession,
  getSession,
  addJobToSession,
  getSessionJobs,
  saveUserSettings,
  getUserSettings,
  renameJob
};