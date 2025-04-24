const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const SERVER_URL = 'http://localhost:3000';
const SAMPLE_IMAGES_DIR = './benchmark/images';
const RESULTS_DIR = './benchmark/results';
const CONCURRENT_LIMIT = 10;

// Đảm bảo thư mục kết quả tồn tại
async function ensureDirectories() {
  await fs.mkdir(SAMPLE_IMAGES_DIR, { recursive: true });
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

// Tải file lên và theo dõi tiến trình
async function processImage(imagePath) {
  const filename = path.basename(imagePath);
  console.log(`Đang xử lý ${filename}...`);
  
  const startTime = Date.now();
  const formData = new FormData();
  formData.append('image', await fs.readFile(imagePath), filename);
  
  try {
    // Tải file lên
    const uploadResponse = await axios.post(
      `${SERVER_URL}/api/process-image`,
      formData,
      { headers: formData.getHeaders() }
    );
    
    const { jobId } = uploadResponse.data;
    console.log(`Job ID: ${jobId}`);
    
    // Kiểm tra trạng thái job cho đến khi hoàn thành
    let completed = false;
    let result = null;
    
    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi 1 giây
      
      const statusResponse = await axios.get(`${SERVER_URL}/api/job/${jobId}`);
      const { job } = statusResponse.data;
      
      if (job.status === 'completed') {
        completed = true;
        result = job;
      } else if (job.status === 'error') {
        throw new Error(`Job lỗi: ${job.message}`);
      }
      
      console.log(`${filename} - Trạng thái: ${job.status}, Bước: ${job.currentStep}`);
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Lưu kết quả
    const resultData = {
      filename,
      jobId,
      startTime,
      endTime,
      processingTime,
      result
    };
    
    await fs.writeFile(
      path.join(RESULTS_DIR, `${filename.split('.')[0]}_result.json`),
      JSON.stringify(resultData, null, 2)
    );
    
    return {
      filename,
      processingTime,
      success: true
    };
  } catch (error) {
    console.error(`Lỗi xử lý ${filename}:`, error.message);
    return {
      filename,
      error: error.message,
      success: false
    };
  }
}

// Xử lý mảng công việc với giới hạn đồng thời
async function processConcurrent(tasks, concurrencyLimit) {
  const results = [];
  const runningTasks = [];

  for (const task of tasks) {
    const promise = task().then(result => {
      // Khi task hoàn thành, xóa nó khỏi danh sách chạy
      const index = runningTasks.indexOf(promise);
      if (index !== -1) runningTasks.splice(index, 1);
      return result;
    });
    
    runningTasks.push(promise);
    results.push(promise);
    
    if (runningTasks.length >= concurrencyLimit) {
      // Đợi cho đến khi ít nhất một task hoàn thành
      await Promise.race(runningTasks);
    }
  }
  
  // Đợi tất cả các công việc còn lại hoàn thành
  return Promise.all(results);
}

// Thực hiện benchmark với tất cả các ảnh đồng thời với giới hạn
async function runBenchmark() {
  await ensureDirectories();
  
  try {
    const files = await fs.readdir(SAMPLE_IMAGES_DIR);
    const imageFiles = files.filter(file => 
      ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(path.extname(file).toLowerCase())
    );
    
    console.log(`Tìm thấy ${imageFiles.length} ảnh để benchmark`);
    
    // Tạo mảng công việc
    const tasks = imageFiles.map(file => {
      return () => processImage(path.join(SAMPLE_IMAGES_DIR, file));
    });
    
    // Xử lý công việc đồng thời với giới hạn
    const startTime = Date.now();
    const results = await processConcurrent(tasks, CONCURRENT_LIMIT);
    const totalTime = Date.now() - startTime;
    
    // Tạo báo cáo tổng hợp
    const summary = {
      totalImages: results.length,
      successfulProcesses: results.filter(r => r.success).length,
      failedProcesses: results.filter(r => !r.success).length,
      averageTime: results.filter(r => r.success)
        .reduce((sum, r) => sum + r.processingTime, 0) / 
        (results.filter(r => r.success).length || 1),
      totalTime,
      concurrentLimit: CONCURRENT_LIMIT,
      results
    };
    
    await fs.writeFile(
      path.join(RESULTS_DIR, `benchmark_summary_${Date.now()}.json`),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('Benchmark hoàn thành!');
    console.log(`Tổng cộng: ${summary.totalImages} ảnh`);
    console.log(`Thành công: ${summary.successfulProcesses}`);
    console.log(`Thất bại: ${summary.failedProcesses}`);
    console.log(`Thời gian trung bình: ${summary.averageTime.toFixed(2)}ms`);
    console.log(`Thời gian tổng cộng: ${totalTime}ms`);
  } catch (error) {
    console.error('Lỗi trong quá trình benchmark:', error);
  }
}

// Thực hiện benchmark
runBenchmark();