const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JobManager = require('./utils/job-manager');
const cacheApiRoutes = require('./utils/cache-api');
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
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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
      // Xử lý từng file
      const jobResults = [];
  
      for (const file of req.files) {
        // Tạo job mới
        const jobId = await JobManager.createJob();
        
        // Thêm job vào phiên của người dùng - đợi hoàn thành
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
        
        jobResults.push({
          filename: file.originalname,
          jobId
        });
      }
      
      // Trả về danh sách jobId để client có thể theo dõi tiến trình
      res.json({
        success: true,
        jobs: jobResults,
        message: 'Đã bắt đầu xử lý ảnh'
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
    
    if (!fs.existsSync(pdfPath)) {
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