const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const JobManager = require('./utils/job-manager');
const cacheApiRoutes = require('./utils/cache-api');
const cache = require('./utils/cache');
const auth = require('./utils/auth');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

async function checkSession(req, res, next) {
  let sessionId = req.cookies.sessionId;
  
  // Nếu không có phiên, tạo phiên mới
  if (!sessionId) {
    const userId = `guest_${Date.now()}`; // Có thể thay bằng xác thực thực sự
    sessionId = await auth.createSession(userId);
    res.cookie('sessionId', sessionId, { 
      maxAge: 24 * 60 * 60 * 1000, // 24 giờ
      httpOnly: true
    });
  }
  
  // Kiểm tra và khôi phục phiên
  const session = await auth.getSession(sessionId);
  if (!session) {
    // Phiên không tồn tại hoặc hết hạn, tạo phiên mới
    const userId = `guest_${Date.now()}`;
    sessionId = await auth.createSession(userId);
    res.cookie('sessionId', sessionId, { 
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true
    });
  }
  
  req.sessionId = sessionId;
  next();
}

app.use(checkSession);

// Đảm bảo thư mục uploads tồn tại
const UPLOAD_DIR = './uploads';
if (!fsSync.existsSync(UPLOAD_DIR)) {
  fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOAD_DIR));

// Cấu hình multer để lưu trữ file tải lên
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn 10MB
  fileFilter: (req, file, cb) => {
    // Chỉ chấp nhận file ảnh
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh!'), false);
    }
  }
}).array('images', 10); // Cho phép tải lên tối đa 10 ảnh

async function validateImageFile(filePath) {
  try {
    // Đọc 8 byte đầu tiên của file
    const buffer = Buffer.alloc(8);
    const fileHandle = await fs.open(filePath, 'r');
    await fileHandle.read(buffer, 0, 8, 0);
    await fileHandle.close();
    
    // Chữ ký của các định dạng file phổ biến
    const signatures = {
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      // JPEG: FF D8 FF
      jpeg: [0xFF, 0xD8, 0xFF],
      // GIF: 47 49 46 38
      gif: [0x47, 0x49, 0x46, 0x38],
      // BMP: 42 4D
      bmp: [0x42, 0x4D],
      // WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
      webp: [0x52, 0x49, 0x46, 0x46]
    };
    
    // Kiểm tra PNG
    if (signatures.png.every((byte, i) => buffer[i] === byte)) {
      return { valid: true, type: 'image/png' };
    }
    
    // Kiểm tra JPEG
    if (signatures.jpeg.every((byte, i) => buffer[i] === byte)) {
      return { valid: true, type: 'image/jpeg' };
    }
    
    // Kiểm tra GIF
    if (signatures.gif.every((byte, i) => buffer[i] === byte)) {
      return { valid: true, type: 'image/gif' };
    }
    
    // Kiểm tra BMP
    if (signatures.bmp.every((byte, i) => buffer[i] === byte)) {
      return { valid: true, type: 'image/bmp' };
    }
    
    // Kiểm tra WEBP
    if (signatures.webp.every((byte, i) => i < 4 ? buffer[i] === byte : true)) {
      // Đọc thêm để kiểm tra đầy đủ signature WEBP
      const webpBuffer = Buffer.alloc(12);
      const webpHandle = await fs.open(filePath, 'r');
      await webpHandle.read(webpBuffer, 0, 12, 0);
      await webpHandle.close();
      
      if (webpBuffer[8] === 0x57 && webpBuffer[9] === 0x45 && 
          webpBuffer[10] === 0x42 && webpBuffer[11] === 0x50) {
        return { valid: true, type: 'image/webp' };
      }
    }
    
    // Không khớp với bất kỳ định dạng hình ảnh nào
    return { valid: false, type: 'unknown' };
  } catch (error) {
    console.error('Lỗi khi kiểm tra file:', error);
    return { valid: false, type: 'error', message: error.message };
  }
}

// API endpoint để tải lên ảnh và xử lý
app.post('/api/process-images', (req, res) => {
  upload(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lỗi tải lên file',
        error: err.message 
      });
    } else if (err) {
      return res.status(400).json({ 
        success: false, 
        message: 'Chỉ chấp nhận file ảnh',
        error: err.message 
      });
    }

    // Kiểm tra xem có file nào được tải lên không
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Không có file nào được tải lên' 
      });
    }

    try {
      const indexes = req.body.indexes || [];

      // Mảng chứa các file hợp lệ
      const validFiles = [];
      const invalidFiles = [];
      
      // Kiểm tra từng file
      await Promise.all(req.files.map(async (file, i) => {
        const validation = await validateImageFile(file.path);
        
        if (validation.valid) {
          validFiles.push({
            ...file,
            validatedType: validation.type,
            index: parseInt(indexes[i] || -1)
          });
        } else {
          // Xóa file không hợp lệ
          await fs.unlink(file.path).catch(e => console.error(`Lỗi xóa file: ${e}`));
          
          invalidFiles.push({
            index: parseInt(indexes[i] || -1),
            reason: 'Định dạng file không hợp lệ'
          });
        }
      }));
      
      // Nếu không có file hợp lệ nào
      if (validFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có file hợp lệ nào được tải lên',
          invalidFiles
        });
      }
      
      // Xử lý từng file
      const jobResults = await Promise.all(
        validFiles.map(async (file) => {
          // Tạo job mới
          const jobId = await JobManager.createJob();
        
          // Thêm job vào phiên của người dùng
          auth.addJobToSession(req.sessionId, jobId)
            .then(added => {
              if (!added) {
                console.warn(`Không thể thêm job ${jobId} vào phiên ${req.sessionId}`);
              }
            })
            .catch(error => {
              console.error(`Lỗi khi thêm job ${jobId} vào phiên:`, error);
            });
        
          // Bắt đầu xử lý ảnh
          await JobManager.startImageProcessing(file.path, jobId)
            .catch(error => console.error(`Lỗi xử lý job ${jobId}:`, error));
          
          return {
            index: parseInt(file.index),
            jobId
          };
        })
      );
      
      // Trả về danh sách jobId để client có thể theo dõi tiến trình
      res.json({
        success: true,
        jobs: jobResults,
        message: `Đã bắt đầu xử lý ${jobResults.length} ảnh`,
        invalidFiles: invalidFiles.length > 0 ? invalidFiles : undefined
      });
    } catch (error) {
      console.error('Lỗi xử lý yêu cầu:', error);
      res.status(500).json({
        success: false,
        message: 'Đã xảy ra lỗi khi xử lý yêu cầu',
        error: error.message
      });
    }
  });
});

// API endpoint mới để lấy lịch sử xử lý của người dùng
app.get('/api/user/history', async (req, res) => {
  try {
    // Lấy danh sách job từ phiên làm việc
    const jobIds = await auth.getSessionJobs(req.sessionId);
    
    // Lấy thông tin chi tiết cho mỗi job
    const jobDetails = await Promise.all(
      jobIds.map(async (job) => {
        const jobInfo = await JobManager.getJobResult(job.jobId);
        return {
          ...job,
          info: jobInfo
        };
      })
    );
    
    res.json({
      success: true,
      history: jobDetails
    });
  } catch (error) {
    console.error('Lỗi khi lấy lịch sử:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi lấy lịch sử xử lý',
      error: error.message
    });
  }
});

// API lưu cài đặt người dùng
app.post('/api/user/settings', async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: 'Không có dữ liệu cài đặt'
      });
    }
    
    const success = await auth.saveUserSettings(req.sessionId, settings);
    
    res.json({
      success,
      message: success ? 'Đã lưu cài đặt' : 'Không thể lưu cài đặt'
    });
  } catch (error) {
    console.error('Lỗi khi lưu cài đặt:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi lưu cài đặt',
      error: error.message
    });
  }
});

// API lấy cài đặt người dùng
app.get('/api/user/settings', async (req, res) => {
  try {
    const settings = await auth.getUserSettings(req.sessionId);
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Lỗi khi lấy cài đặt:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi lấy cài đặt',
      error: error.message
    });
  }
});

// API đặt tên cho job
app.post('/api/user/rename/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Không có tên mới'
      });
    }
    
    const success = await auth.renameJob(req.sessionId, jobId, name);
    
    res.json({
      success,
      message: success ? 'Đã đổi tên' : 'Không thể đổi tên'
    });
  } catch (error) {
    console.error('Lỗi khi đổi tên:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi đổi tên',
      error: error.message
    });
  }
});

// API endpoint để kiểm tra trạng thái job
app.get('/api/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await JobManager.getJobResult(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy job'
      });
    }
    
    res.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái job:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi kiểm tra trạng thái job',
      error: error.message
    });
  }
});

app.get('/api/preview/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await JobManager.getJobResult(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy job'
      });
    }
    
    // Fetch OCR and translated text for preview
    const ocrText = await cache.get(`job_${jobId}_ocr`) || '';
    const translatedText = await cache.get(`job_${jobId}_translate`) || '';
    
    // Get the original image path
    const originalImagePath = await cache.get(`job_${jobId}_original`);
    let imageUrl = null;
    
    if (originalImagePath) {
      // Extract filename from path
      const filename = originalImagePath.split('/').pop();
      // Create a URL to serve the image (you'll need to serve the uploads directory)
      imageUrl = `/uploads/${filename}`;
    }
    
    res.json({
      success: true,
      preview: {
        jobId,
        status: job.status,
        ocrText: ocrText.substring(0, 300) + (ocrText.length > 300 ? '...' : ''),
        translatedText: translatedText.substring(0, 300) + (translatedText.length > 300 ? '...' : ''),
        imageUrl
      }
    });
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu preview:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi lấy dữ liệu preview',
      error: error.message
    });
  }
});

// API endpoint để tải xuống PDF
app.get('/api/download/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await JobManager.getJobResult(jobId);
    
    if (!job || job.status !== 'completed' || !job.result || !job.result.pdf) {
      return res.status(404).json({
        success: false,
        message: 'PDF chưa sẵn sàng hoặc không tồn tại'
      });
    }
    
    const pdfPath = path.resolve(job.result.pdf);
    
    if (!fsSync.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'File PDF không tồn tại'
      });
    }
    
    res.download(pdfPath, (err) => {
      if (err) {
        console.error('Lỗi khi gửi file PDF:', err);
        res.status(500).json({
          success: false,
          message: 'Đã xảy ra lỗi khi gửi file PDF',
          error: err.message
        });
      }
    });
  } catch (error) {
    console.error('Lỗi khi tải xuống PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi tải xuống PDF',
      error: error.message
    });
  }
});

// Sử dụng API routes quản lý cache
app.use(cacheApiRoutes);

// Phục vụ trang web
app.use(express.static('public'));

// Khởi động server
app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});