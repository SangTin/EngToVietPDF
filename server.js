const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JobManager = require('./utils/job-manager');
const cacheApiRoutes = require('./utils/cache-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
      const jobResults = await Promise.all(req.files.map(async (file) => {
        // Tạo job mới
        const jobId = await JobManager.createJob();
        
        // Bắt đầu xử lý ảnh (không chờ đợi hoàn thành)
        await JobManager.startImageProcessing(file.path, jobId)
          .catch(error => console.error(`Lỗi xử lý job ${jobId}:`, error));
        
        return {
          filename: file.originalname,
          jobId
        };
      }));
      
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

// API endpoint để kiểm tra trạng thái job (giữ nguyên như cũ)
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

// API endpoint để tải xuống PDF (giữ nguyên như cũ)
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