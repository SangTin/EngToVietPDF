const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Đường dẫn đến file lưu trữ cache
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'cache-data.json');

// Kích thước tối đa của cache trong bộ nhớ (số lượng items)
const MAX_MEMORY_CACHE_SIZE = 100;

// Thời gian hết hạn cache (mặc định 24 giờ - tính bằng ms)
const DEFAULT_EXPIRY = 24 * 60 * 60 * 1000;

// Cache trong bộ nhớ
let memoryCache = new Map();

// Đảm bảo thư mục cache tồn tại
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Tạo cache file nếu chưa tồn tại
if (!fs.existsSync(CACHE_FILE)) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
}

function cacheExists(key) {
  // Kiểm tra trong bộ nhớ cache trước
  if (memoryCache.has(key)) {
    return true;
  }

  // Nếu không có trong bộ nhớ, kiểm tra trong file cache
  const fileCache = loadCacheFromFile();
  return fileCache[key] !== undefined;
}

// Tính hash của dữ liệu để làm key
function generateCacheKey(data, type) {
  const hash = crypto.createHash('md5').update(data + type).digest('hex');
  return `${type}_${hash}`;
}

// Đọc cache từ file
function loadCacheFromFile() {
  try {
    const cacheData = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(cacheData || '{}');
  } catch (error) {
    console.error('Lỗi khi đọc cache từ file:', error);
    return {};
  }
}

// Lưu cache vào file
function saveCacheToFile(cacheData) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu cache vào file:', error);
    return false;
  }
}

// Thêm dữ liệu vào cache
function set(key, data, timeToLive = DEFAULT_EXPIRY) {
  // Tạo đối tượng cache với thời gian hết hạn
  const cacheItem = {
    data,
    expiry: Date.now() + timeToLive
  };

  // Lưu vào memory cache
  memoryCache.set(key, cacheItem);

  // Nếu memory cache vượt quá kích thước, xóa item cũ nhất
  if (memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }

  // Lưu vào file cache
  const fileCache = loadCacheFromFile();
  fileCache[key] = cacheItem;
  saveCacheToFile(fileCache);
}

// Lấy dữ liệu từ cache
function get(key) {
  // Kiểm tra trong memory cache trước
  if (memoryCache.has(key)) {
    const cacheItem = memoryCache.get(key);

    // Kiểm tra thời gian hết hạn
    if (cacheItem.expiry > Date.now()) {
      return cacheItem.data;
    } else {
      // Xóa khỏi cache nếu đã hết hạn
      memoryCache.delete(key);
    }
  }

  // Nếu không có trong memory cache, kiểm tra trong file cache
  const fileCache = loadCacheFromFile();
  if (fileCache[key] && fileCache[key].expiry > Date.now()) {
    // Nếu tìm thấy trong file cache, thêm vào memory cache
    memoryCache.set(key, fileCache[key]);
    return fileCache[key].data;
  }

  // Không tìm thấy hoặc đã hết hạn
  return null;
}

// Xóa cache theo key
function remove(key) {
  // Xóa từ memory cache
  memoryCache.delete(key);

  // Xóa từ file cache
  const fileCache = loadCacheFromFile();
  if (fileCache[key]) {
    delete fileCache[key];
    saveCacheToFile(fileCache);
  }
}

// Xóa tất cả cache
function clear() {
  // Xóa memory cache
  memoryCache.clear();

  // Xóa file cache
  saveCacheToFile({});
}

// Xóa các cache đã hết hạn
function prune() {
  const now = Date.now();

  // Xóa các cache đã hết hạn từ memory
  for (const [key, value] of memoryCache.entries()) {
    if (value.expiry <= now) {
      memoryCache.delete(key);
    }
  }

  // Xóa các cache đã hết hạn từ file
  const fileCache = loadCacheFromFile();
  let modified = false;

  for (const key in fileCache) {
    if (fileCache[key].expiry <= now) {
      delete fileCache[key];
      modified = true;
    }
  }

  if (modified) {
    saveCacheToFile(fileCache);
  }
}

// Lên lịch xóa cache định kỳ (mỗi giờ)
setInterval(prune, 60 * 60 * 1000);

module.exports = {
  generateCacheKey,
  set,
  get,
  remove,
  clear,
  prune,
  cacheExists,
  getMemoryCache: () => memoryCache,
};