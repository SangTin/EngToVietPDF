const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JobManager = require('./utils/job-manager');
const cacheApiRoutes = require('./utils/cache-api');
const monitor = require('./utils/monitoring');

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
});

// API endpoint để tải lên ảnh và xử lý
app.post('/api/process-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được tải lên' });
    }
    
    // Tạo job mới
    const jobId = await JobManager.createJob(req.file.path);
    
    // Bắt đầu xử lý ảnh (không chờ đợi hoàn thành)
    await JobManager.startImageProcessing(req.file.path, jobId)
      .catch(error => console.error(`Lỗi xử lý job ${jobId}:`, error));
    
    // Trả về jobId để client có thể theo dõi tiến trình
    res.json({
      success: true,
      jobId,
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

// API để tạo báo cáo hiệu năng
app.get('/api/performance-report', async (req, res) => {
  try {
    const { filename, report } = await monitor.generateReport();
    res.json({
      success: true,
      message: `Báo cáo hiệu năng đã được tạo: ${filename}`,
      report
    });
  } catch (error) {
    console.error('Lỗi khi tạo báo cáo hiệu năng:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi tạo báo cáo',
      error: error.message
    });
  }
});

// API để tạo báo cáo PDF
app.get('/api/performance-report/pdf', async (req, res) => {
  try {
    const { report } = await monitor.generateReport();
    
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });
    
    const reportFile = `./reports/performance_${Date.now()}.pdf`;
    const writeStream = fs.createWriteStream(reportFile);
    
    doc.pipe(writeStream);
    
    // Đảm bảo font tiếng Việt được load
    doc.registerFont('Vietnamese', './font/Roboto-Regular.ttf');
    doc.font('Vietnamese');
    
    // Tiêu đề
    doc.fontSize(24).text('Báo cáo hiệu năng hệ thống', {
      align: 'center'
    });
    
    doc.moveDown();
    doc.fontSize(12).text(`Thời gian tạo: ${new Date().toLocaleString('vi-VN')}`);
    doc.moveDown(2);
    
    // PHẦN 1: Tóm tắt hiệu năng thời gian
    doc.fontSize(16).text('Tóm tắt hiệu năng thời gian:');
    doc.moveDown();
    
    // Vẽ bảng tóm tắt hiệu năng thời gian
    const tableTop = doc.y;
    const tableLeft = 50;
    const cellWidth = 100;
    const cellHeight = 30;
    
    // Tiêu đề bảng
    doc.fontSize(10);
    doc.text('Quy trình', tableLeft, tableTop, { width: cellWidth });
    doc.text('Trung bình (ms)', tableLeft + cellWidth, tableTop, { width: cellWidth });
    doc.text('Tối thiểu (ms)', tableLeft + cellWidth * 2, tableTop, { width: cellWidth });
    doc.text('Tối đa (ms)', tableLeft + cellWidth * 3, tableTop, { width: cellWidth });
    
    // Vẽ đường kẻ ngang tiêu đề
    doc.moveTo(tableLeft, tableTop + 20)
       .lineTo(tableLeft + cellWidth * 4, tableTop + 20)
       .stroke();
    
    // Dữ liệu bảng thời gian
    let rowTop = tableTop + 25;
    for (const [name, metrics] of Object.entries(report.summary)) {
      doc.text(name, tableLeft, rowTop, { width: cellWidth });
      doc.text(metrics.avg.toFixed(2), tableLeft + cellWidth, rowTop, { width: cellWidth });
      doc.text(metrics.min.toFixed(2), tableLeft + cellWidth * 2, rowTop, { width: cellWidth });
      doc.text(metrics.max.toFixed(2), tableLeft + cellWidth * 3, rowTop, { width: cellWidth });
      
      rowTop += cellHeight;
    }
    
    // Vẽ viền bảng
    doc.rect(tableLeft, tableTop, cellWidth * 4, rowTop - tableTop).stroke();
    
    // PHẦN 2: Thông tin Cache Hit/Miss
    doc.moveDown(3);
    doc.fontSize(16).text('Thông tin Cache Hit/Miss:');
    doc.moveDown();
    
    // Tính toán tỷ lệ cache hit/miss
    const cacheHitCount = (report.details.cache_hit || []).length;
    const cacheMissCount = (report.details.cache_miss || []).length;
    const totalCache = cacheHitCount + cacheMissCount;
    const cacheHitRate = totalCache > 0 ? (cacheHitCount / totalCache * 100).toFixed(2) : '0.00';
    
    // Vẽ bảng cache
    const cacheTableTop = doc.y;
    
    // Tiêu đề bảng cache
    doc.fontSize(10);
    doc.text('Loại', tableLeft, cacheTableTop, { width: cellWidth });
    doc.text('Số lượng', tableLeft + cellWidth, cacheTableTop, { width: cellWidth });
    doc.text('Tỷ lệ (%)', tableLeft + cellWidth * 2, cacheTableTop, { width: cellWidth });
    
    // Vẽ đường kẻ ngang tiêu đề cache
    doc.moveTo(tableLeft, cacheTableTop + 20)
       .lineTo(tableLeft + cellWidth * 3, cacheTableTop + 20)
       .stroke();
    
    // Dữ liệu bảng cache
    let cacheRowTop = cacheTableTop + 25;
    
    // Cache Hit
    doc.text('Cache Hit', tableLeft, cacheRowTop, { width: cellWidth });
    doc.text(cacheHitCount.toString(), tableLeft + cellWidth, cacheRowTop, { width: cellWidth });
    doc.text(cacheHitRate, tableLeft + cellWidth * 2, cacheRowTop, { width: cellWidth });
    
    cacheRowTop += cellHeight;
    
    // Cache Miss
    doc.text('Cache Miss', tableLeft, cacheRowTop, { width: cellWidth });
    doc.text(cacheMissCount.toString(), tableLeft + cellWidth, cacheRowTop, { width: cellWidth });
    doc.text(totalCache > 0 ? (100 - parseFloat(cacheHitRate)).toFixed(2) : '0.00', tableLeft + cellWidth * 2, cacheRowTop, { width: cellWidth });
    
    cacheRowTop += cellHeight;
    
    // Tổng cộng
    doc.text('Tổng cộng', tableLeft, cacheRowTop, { width: cellWidth });
    doc.text(totalCache.toString(), tableLeft + cellWidth, cacheRowTop, { width: cellWidth });
    doc.text('100.00', tableLeft + cellWidth * 2, cacheRowTop, { width: cellWidth });
    
    // Vẽ viền bảng cache
    doc.rect(tableLeft, cacheTableTop, cellWidth * 3, cacheRowTop + cellHeight - cacheTableTop).stroke();
    
    // PHẦN 3: Chi tiết các metrics
    doc.addPage();
    doc.fontSize(18).text('Chi tiết các metrics', { align: 'center' });
    doc.moveDown();
    
    // Hiển thị chi tiết cho mỗi loại metric
    for (const [name, values] of Object.entries(report.details)) {
      if (values.length === 0) continue;
      
      doc.fontSize(14).text(name);
      doc.moveDown(0.5);
      
      const detailTableTop = doc.y;
      
      // Tiêu đề bảng chi tiết
      doc.fontSize(9);
      const smallWidth = 60;
      const mediumWidth = 100;
      const largeWidth = 200;
      
      doc.text('Job ID', tableLeft, detailTableTop, { width: largeWidth });
      
      if (values[0].duration !== undefined) {
        doc.text('Thời gian (ms)', tableLeft + largeWidth, detailTableTop, { width: mediumWidth });
      } else {
        doc.text('Giá trị', tableLeft + largeWidth, detailTableTop, { width: mediumWidth });
      }
      
      doc.text('Thời gian', tableLeft + largeWidth + mediumWidth, detailTableTop, { width: mediumWidth });
      
      // Vẽ đường kẻ ngang tiêu đề chi tiết
      doc.moveTo(tableLeft, detailTableTop + 15)
         .lineTo(tableLeft + largeWidth + mediumWidth * 2, detailTableTop + 15)
         .stroke();
      
      // Hiển thị tối đa 10 mục
      let detailRowTop = detailTableTop + 20;
      const maxItems = Math.min(values.length, 10);
      
      for (let i = 0; i < maxItems; i++) {
        const item = values[i];
        doc.text(item.jobId || 'N/A', tableLeft, detailRowTop, { width: largeWidth });
        
        if (item.duration !== undefined) {
          doc.text(item.duration.toFixed(2), tableLeft + largeWidth, detailRowTop, { width: mediumWidth });
        } else {
          doc.text(item.value.toString(), tableLeft + largeWidth, detailRowTop, { width: mediumWidth });
        }
        
        doc.text(new Date(item.timestamp).toLocaleString('vi-VN'), tableLeft + largeWidth + mediumWidth, detailRowTop, { width: mediumWidth });
        
        detailRowTop += 25;
        
        // Kiểm tra nếu sắp hết trang, thì thêm trang mới
        if (detailRowTop > doc.page.height - 100 && i < maxItems - 1) {
          doc.addPage();
          detailRowTop = 50;
        }
      }
      
      // Hiển thị thông báo nếu có nhiều hơn 10 mục
      if (values.length > 10) {
        doc.text(`Hiển thị 10/${values.length} mục...`, tableLeft, detailRowTop);
      }
      
      doc.moveDown(2);
    }
    
    doc.end();
    
    writeStream.on('finish', () => {
      res.download(reportFile, (err) => {
        if (err) {
          console.error('Lỗi khi gửi file báo cáo:', err);
          res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi gửi file báo cáo',
            error: err.message
          });
        }
      });
    });
  } catch (error) {
    console.error('Lỗi khi tạo báo cáo PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi tạo báo cáo PDF',
      error: error.message
    });
  }
});

// API để tạo báo cáo HTML
app.get('/api/performance-report/html', async (req, res) => {
  try {
    const { report } = await monitor.generateReport();
    
    // Tạo HTML với encoding UTF-8
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    
    // Tạo nội dung HTML
    let html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Báo cáo hiệu năng hệ thống</title>
        <style>
          body { font-family: 'Roboto', Arial, sans-serif; padding: 20px; }
          h1, h2 { color: #333; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
          .metric { margin-bottom: 30px; }
        </style>
      </head>
      <body>
        <h1>Báo cáo hiệu năng hệ thống</h1>
        <p>Thời gian tạo: ${new Date().toLocaleString('vi-VN')}</p>
        
        <h2>Tóm tắt hiệu năng</h2>
    `;
    
    // Thêm bảng tóm tắt
    html += `
      <table>
        <tr>
          <th>Quy trình</th>
          <th>Trung bình (ms)</th>
          <th>Tối thiểu (ms)</th>
          <th>Tối đa (ms)</th>
          <th>Số lượng</th>
        </tr>
    `;
    
    // Thêm dữ liệu vào bảng
    for (const [name, metrics] of Object.entries(report.summary)) {
      html += `
        <tr>
          <td>${name}</td>
          <td>${metrics.avg.toFixed(2)}</td>
          <td>${metrics.min.toFixed(2)}</td>
          <td>${metrics.max.toFixed(2)}</td>
          <td>${metrics.count}</td>
        </tr>
      `;
    }
    
    html += `</table>`;
    
    // Thêm chi tiết cho mỗi metric
    for (const [name, values] of Object.entries(report.details)) {
      if (values.length === 0) continue;
      
      html += `
        <div class="metric">
          <h2>${name}</h2>
          <table>
            <tr>
              <th>Job ID</th>
              <th>${values[0].duration !== undefined ? 'Thời gian (ms)' : 'Giá trị'}</th>
              <th>Thời gian</th>
            </tr>
      `;
      
      for (const item of values.slice(0, 10)) { // Giới hạn hiển thị 10 mục
        html += `
          <tr>
            <td>${item.jobId || 'N/A'}</td>
            <td>${item.duration !== undefined ? item.duration.toFixed(2) : item.value}</td>
            <td>${new Date(item.timestamp).toLocaleString('vi-VN')}</td>
          </tr>
        `;
      }
      
      html += `</table>`;
      
      if (values.length > 10) {
        html += `<p>Hiển thị 10/${values.length} mục...</p>`;
      }
      
      html += `</div>`;
    }
    
    html += `
        </body>
        </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Lỗi khi tạo báo cáo HTML:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi khi tạo báo cáo HTML',
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