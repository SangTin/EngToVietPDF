const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const SERVER_URL = 'http://localhost:3000';
const SAMPLE_IMAGES_DIR = './benchmark/images';
const RESULTS_DIR = './benchmark/results';
const CONCURRENT_LIMIT = 5; // Tăng số lượng file xử lý đồng thời

// Đảm bảo thư mục kết quả tồn tại
async function ensureDirectories() {
  await fs.mkdir(SAMPLE_IMAGES_DIR, { recursive: true });
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

// Tải file lên và theo dõi tiến trình
async function processImages(imagePaths) {
  console.log(`Đang xử lý ${imagePaths.length} ảnh...`);
  
  const startTime = Date.now();
  const formData = new FormData();
  // Thêm tất cả các file vào FormData
  imagePaths.forEach(imagePath => {
    formData.append('images', fsSync.createReadStream(imagePath), path.basename(imagePath));
  });
  
  try {
    // Tải file lên
    const uploadResponse = await axios.post(
      `${SERVER_URL}/api/process-images`,
      formData,
      { headers: formData.getHeaders() }
    );
    
    const { jobs } = uploadResponse.data;
    console.log('Các job được tạo:', jobs.map(job => job.jobId));
    
    // Theo dõi trạng thái từng job
    const jobResults = await Promise.all(jobs.map(async (jobInfo) => {
      const { jobId, filename } = jobInfo;
      console.log(`Theo dõi job ${jobId} cho file ${filename}`);
      
      let job = null;
      while (!job || job.status !== 'completed') {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi 1 giây
        
        const statusResponse = await axios.get(`${SERVER_URL}/api/job/${jobId}`);
        job = statusResponse.data.job;
        
        console.log(`${filename} - Trạng thái: ${job.status}, Bước: ${job.currentStep || 'chưa bắt đầu'}`);
        
        if (job.status === 'error') {
          throw new Error(`Job lỗi: ${job.message}`);
        }
      }
      
      return {
        filename,
        jobId,
        result: job.result
      };
    }));
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Lưu kết quả
    const resultData = {
      startTime,
      endTime,
      processingTime,
      results: jobResults
    };
    
    await fs.writeFile(
      path.join(RESULTS_DIR, `batch_result_${Date.now()}.json`),
      JSON.stringify(resultData, null, 2)
    );
    
    return resultData;
  } catch (error) {
    console.error('Lỗi xử lý batch:', error.message);
    throw error;
  }
}

// Xử lý các batch ảnh với giới hạn đồng thời
async function processBatchConcurrent(imagePaths, batchSize = 10) {
  const results = [];
  
  // Chia các ảnh thành các batch
  for (let i = 0; i < imagePaths.length; i += batchSize) {
    const batchPaths = imagePaths.slice(i, i + batchSize);
    
    try {
      const batchResult = await processImages(batchPaths);
      results.push(batchResult);
    } catch (error) {
      console.error(`Lỗi khi xử lý batch từ ${i} đến ${i + batchSize}:`, error);
    }
  }
  
  return results;
}

// Thực hiện benchmark với tất cả các ảnh
async function runBenchmark() {
  await ensureDirectories();
  
  try {
    const files = await fs.readdir(SAMPLE_IMAGES_DIR);
    const imageFiles = files.filter(file => 
      ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(path.extname(file).toLowerCase())
    );
    
    const fullImagePaths = imageFiles.map(file => path.join(SAMPLE_IMAGES_DIR, file));
    
    console.log(`Tìm thấy ${imageFiles.length} ảnh để benchmark`);
    
    const startTime = Date.now();
    const results = await processBatchConcurrent(fullImagePaths);
    const totalTime = Date.now() - startTime;
    
    // Tạo báo cáo tổng hợp
    const summary = {
      totalImages: fullImagePaths.length,
      totalTime,
      batchCount: results.length,
      batchResults: results
    };
    
    const summaryPath = path.join(RESULTS_DIR, `benchmark_summary_${Date.now()}.json`);
    await fs.writeFile(
      summaryPath,
      JSON.stringify(summary, null, 2)
    );
    
    console.log('Benchmark hoàn thành!');
    console.log(`Tổng cộng: ${summary.totalImages} ảnh`);
    console.log(`Thời gian tổng cộng: ${totalTime}ms`);
    console.log(`Chi tiết báo cáo: ${summaryPath}`);
  } catch (error) {
    console.error('Lỗi trong quá trình benchmark:', error);
  }
}

// Thực hiện benchmark
runBenchmark();