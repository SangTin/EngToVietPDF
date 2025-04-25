const { consumeQueue, QUEUES, processTranslation } = require('../utils/queue');
const ocr = require('../utils/ocr');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');
const crypto = require('crypto');
const fs = require('fs').promises;
const monitor = require('../utils/monitoring');
const { Semaphore } = require('async-mutex');
const imageProcessor = require('../utils/image-processor');

// Sử dụng semaphore để giới hạn số lượng worker đồng thời
const MAX_CONCURRENT_WORKERS = 3;
const semaphore = new Semaphore(MAX_CONCURRENT_WORKERS);

async function processOCRJob(data) {
    const { imagePath, jobId } = data;

    try {
        // Bắt đầu đo hiệu năng
        monitor.startMeasure('ocr_process', jobId);
        
        await JobManager.updateJobStatus(jobId, 'processing', 'ocr');
        console.log(`Bắt đầu xử lý OCR cho job ${jobId}: ${imagePath}`);

        return await semaphore.runExclusive(async () => {
            // Kiểm tra xem có ảnh đã tiền xử lý không
            const preprocessedKey = `job_${jobId}_preprocessed`;
            const preprocessedPath = await cache.get(preprocessedKey) || imagePath;
            
            const cacheKey = cache.generateCacheKey(preprocessedPath, cache.CACHE_TYPES.OCR);
            
            // Kiểm tra cache
            let extractedText = await cache.get(cacheKey);

            if (extractedText) {
                console.log(`Sử dụng kết quả OCR từ cache cho job ${jobId}`);
                await monitor.recordMetric('cache_hit', 1, jobId);
            } else {
                // Thực hiện OCR
                console.log(`Đang thực hiện OCR cho ảnh: ${preprocessedPath}`);
                monitor.startMeasure('ocr_execution', jobId);
                
                extractedText = await ocr.image2text(preprocessedPath);
                
                const ocrTime = await monitor.endMeasure('ocr_execution', jobId);
                console.log(`Thực hiện OCR hoàn thành trong ${ocrTime?.toFixed(2) || '?'}ms`);
                
                // Lưu kết quả vào cache
                await cache.setWithPriority(cacheKey, extractedText);
                await monitor.recordMetric('cache_miss', 1, jobId);
            }

            // Lưu kết quả OCR cho job hiện tại
            const jobKey = `job_${jobId}_ocr`;
            await cache.setWithPriority(jobKey, extractedText, 'HIGH');

            // Chuyển tiếp dữ liệu đến hàng đợi dịch thuật
            console.log(`Đang gửi job ${jobId} đến translate_queue`);
            await processTranslation(extractedText, jobId);
            await JobManager.updateJobStatus(jobId, 'processing', 'translate');

            // Kết thúc đo thời gian
            const totalTime = await monitor.endMeasure('ocr_process', jobId);
            
            console.log(`OCR cho job ${jobId} hoàn thành trong ${totalTime?.toFixed(2) || '?'}ms`);
            return extractedText;
        });
    } catch (error) {
        console.error(`Lỗi trong quá trình OCR job ${jobId}:`, error);
        throw error;
    }
}

async function startOCRWorker() {
    await consumeQueue(QUEUES.OCR, processOCRJob, MAX_CONCURRENT_WORKERS);
    console.log('OCR Worker đã bắt đầu');
}

// Bắt đầu worker
startOCRWorker().catch(console.error);