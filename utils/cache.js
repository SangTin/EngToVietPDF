const crypto = require('crypto');
const { createClient } = require('redis');

const CACHE_PRIORITY = {
  HIGH: 60 * 60, // 1 giờ
  MEDIUM: 6 * 60 * 60, // 6 giờ
  LOW: 24 * 60 * 60 // 24 giờ
};

const CACHE_TYPES = {
  PREPROCESS: 'preprocess',
  OCR: 'ocr',
  TRANSLATE: 'translate',
  PDF: 'pdf',
  JOB: 'job'
};

async function setWithPriority(key, data, priority = 'LOW') {
  return await set(key, data, CACHE_PRIORITY[priority]);
}

// Cấu hình kết nối Redis
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PREFIX = 'ocr_app:cache:';

// Thời gian hết hạn cache (mặc định 24 giờ - tính bằng giây)
const DEFAULT_EXPIRY = CACHE_PRIORITY.LOW

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
function generateCacheKey(data, type, options = {}) {
  // Nếu data là string dài, dùng hash thay vì toàn bộ chuỗi
  let hashInput = typeof data === 'string' && data.length > 100 
    ? crypto.createHash('md5').update(data).digest('hex')
    : data.toString();
    
  // Thêm các tham số tùy chọn vào key
  if (Object.keys(options).length > 0) {
    hashInput += JSON.stringify(options);
  }
  
  const hash = crypto.createHash('md5').update(hashInput + type).digest('hex');
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
    const fullKey = getFullKey(key);
    const data = await redisClient.get(fullKey);
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

async function addToSet(key, value) {
  try {
    await redisClient.sAdd(getFullKey(key), value);
    return true;
  } catch (error) {
    console.error(`Lỗi khi thêm vào set ${key}:`, error);
    return false;
  }
}

// Lấy tất cả phần tử trong Set
async function getSetMembers(key) {
  try {
    return await redisClient.sMembers(getFullKey(key));
  } catch (error) {
    console.error(`Lỗi khi lấy set ${key}:`, error);
    return [];
  }
}

// Lưu hash map
async function setHash(key, fields) {
  try {
    await redisClient.hSet(getFullKey(key), fields);
    return true;
  } catch (error) {
    console.error(`Lỗi khi lưu hash ${key}:`, error);
    return false;
  }
}

// Lấy toàn bộ hash map
async function getHash(key) {
  try {
    return await redisClient.hGetAll(getFullKey(key));
  } catch (error) {
    console.error(`Lỗi khi lấy hash ${key}:`, error);
    return null;
  }
}

async function expire(key, priority) {
  try {
    const ttl = CACHE_PRIORITY[priority];
    if (ttl) {
      await redisClient.expire(getFullKey(key), ttl);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Lỗi khi đặt thời gian sống cho ${key}:`, error);
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

// Xóa cache theo pattern
async function clearByPattern(pattern) {
  try {
    const keys = await redisClient.keys(`${REDIS_PREFIX}${pattern}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return true;
  } catch (error) {
    console.error(`Lỗi khi xóa cache theo pattern ${pattern}:`, error);
    return false;
  }
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
  setWithPriority,
  get,
  remove,
  clear,
  cacheExists,
  getAllKeys,
  closeConnection,
  clearByPattern,
  redisClient,
  CACHE_PRIORITY,
  CACHE_TYPES
};