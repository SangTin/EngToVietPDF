const crypto = require('crypto');
const { createClient } = require('redis');

// Cấu hình kết nối Redis
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PREFIX = 'ocr_app:cache:';

// Thời gian hết hạn cache (mặc định 24 giờ - tính bằng giây)
const DEFAULT_EXPIRY = 24 * 60 * 60; // 24 giờ tính bằng giây

// Khởi tạo Redis client
const redisClient = createClient({
  url: REDIS_URL
});

// Kết nối và xử lý lỗi
(async () => {
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  redisClient.on('connect', () => console.log('Đã kết nối đến Redis server'));
  
  await redisClient.connect();
})().catch(console.error);

// Tạo key đầy đủ với prefix
function getFullKey(key) {
  return `${REDIS_PREFIX}${key}`;
}

// Tính hash của dữ liệu để làm key
function generateCacheKey(data, type) {
  const hash = crypto.createHash('md5').update(data + type).digest('hex');
  return `${type}_${hash}`;
}

// Kiểm tra cache tồn tại
async function cacheExists(key) {
  try {
    const ttl = await redisClient.ttl(getFullKey(key));
    return ttl > 0; // TTL > 0 nghĩa là key tồn tại và chưa hết hạn
  } catch (error) {
    console.error('Lỗi khi kiểm tra cache tồn tại:', error);
    return false;
  }
}

// Thêm dữ liệu vào cache
async function set(key, data, timeToLive = DEFAULT_EXPIRY) {
  try {
    const serializedData = JSON.stringify(data);
    await redisClient.setEx(getFullKey(key), timeToLive, serializedData);
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu cache:', error);
    return false;
  }
}

// Lấy dữ liệu từ cache
async function get(key) {
  try {
    const data = await redisClient.get(getFullKey(key));
    if (!data) return null;
    
    return JSON.parse(data);
  } catch (error) {
    console.error('Lỗi khi lấy cache:', error);
    return null;
  }
}

// Xóa cache theo key
async function remove(key) {
  try {
    await redisClient.del(getFullKey(key));
    return true;
  } catch (error) {
    console.error('Lỗi khi xóa cache:', error);
    return false;
  }
}

// Xóa tất cả cache
async function clear() {
  try {
    // Xóa tất cả các key có prefix của ứng dụng
    const keys = await redisClient.keys(`${REDIS_PREFIX}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return true;
  } catch (error) {
    console.error('Lỗi khi xóa tất cả cache:', error);
    return false;
  }
}

// Lấy tất cả các key trong cache
async function getAllKeys() {
  try {
    const keys = await redisClient.keys(`${REDIS_PREFIX}*`);
    return keys.map(key => key.replace(REDIS_PREFIX, ''));
  } catch (error) {
    console.error('Lỗi khi lấy tất cả cache keys:', error);
    return [];
  }
}

// Lấy thống kê cache
async function getStats() {
  try {
    const keys = await redisClient.keys(`${REDIS_PREFIX}*`);
    const stats = {
      totalItems: keys.length,
      types: {},
      oldestExpiry: null,
      newestExpiry: null
    };

    // Phân loại keys theo type
    for (const fullKey of keys) {
      const key = fullKey.replace(REDIS_PREFIX, '');
      const type = key.split('_')[0];
      
      if (!stats.types[type]) {
        stats.types[type] = 0;
      }
      stats.types[type]++;
      
      // Lấy thời gian hết hạn
      const ttl = await redisClient.ttl(fullKey);
      const expiry = Date.now() + (ttl * 1000);
      
      if (stats.oldestExpiry === null || expiry < stats.oldestExpiry) {
        stats.oldestExpiry = expiry;
      }
      
      if (stats.newestExpiry === null || expiry > stats.newestExpiry) {
        stats.newestExpiry = expiry;
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Lỗi khi lấy thống kê cache:', error);
    return {
      totalItems: 0,
      types: {},
      oldestExpiry: null,
      newestExpiry: null
    };
  }
}

// Hàm tương thích với API cũ để không phải sửa code quá nhiều
function getMemoryCache() {
  return {
    size: 0,
    keys: () => ({ next: () => ({ value: null }) }),
    entries: () => []
  };
}

// Đóng kết nối Redis khi ứng dụng kết thúc
async function closeConnection() {
  await redisClient.quit();
}

// Xử lý đóng kết nối khi ứng dụng dừng
process.on('SIGINT', async () => {
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeConnection();
  process.exit(0);
});

module.exports = {
  generateCacheKey,
  set,
  get,
  remove,
  clear,
  cacheExists,
  getAllKeys,
  getStats,
  closeConnection,
  getMemoryCache
};