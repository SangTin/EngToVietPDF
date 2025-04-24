const { consumeQueue, QUEUES, processTranslation } = require('../utils/queue');
const ocr = require('../utils/ocr');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');
const crypto = require('crypto');
const fs = require('fs').promises;
const monitor = require('../utils/monitoring');
const { Semaphore } = require('async-mutex');

// Sử dụng semaphore để giới hạn số lượng worker đồng thời
const MAX_CONCURRENT_WORKERS = 3;
const semaphore = new Semaphore(MAX_CONCURRENT_WORKERS);

// Tạo hash của file để làm key cache
function generateFileHash(filePath) {
    return new Promise(async (resolve, reject) => {
        try {
            const fileBuffer = await fs.readFile(filePath);
            const hashSum = crypto.createHash('md5');
            hashSum.update(fileBuffer);
            const hex = hashSum.digest('hex');
            resolve(hex);
        } catch (error) {
            reject(error);
        }
    });
}

async function processOCRJob(data) {
    const { imagePath, jobId } = data;

    try {
        // Bắt đầu đo hiệu năng
        monitor.startMeasure('ocr_process', jobId);
        
        await JobManager.updateJobStatus(jobId, 'processing', 'ocr');

        return await semaphore.runExclusive(async () => {
            // Tạo key cache dựa trên hash của file
            const fileHash = await generateFileHash(imagePath);
            const cacheKey = cache.generateCacheKey(fileHash, cache.CACHE_TYPES.OCR);

            // Kiểm tra cache
            const cachedText = await cache.get(cacheKey);

            let extractedText;
            if (cachedText) {
                console.log(`Sử dụng kết quả OCR từ cache cho: ${imagePath}`);
                extractedText = cachedText;
                await monitor.recordMetric('cache_hit', 1, jobId);
            } else {
                console.log(`Đang thực hiện OCR cho ảnh: ${imagePath}`);
                monitor.startMeasure('ocr_execution', jobId);
                extractedText = await ocr.image2text(imagePath);
                await monitor.endMeasure('ocr_execution', jobId);
                await monitor.recordMetric('cache_miss', 1, jobId);

                // Lưu kết quả vào cache
                await cache.set(cacheKey, extractedText);
            }

            // Lưu kết quả OCR cho job hiện tại
            const jobKey = `job_${jobId}_ocr`;
            await cache.set(jobKey, extractedText);

            // Chuyển tiếp dữ liệu đến hàng đợi dịch thuật
            await processTranslation(extractedText, jobId);
            await JobManager.updateJobStatus(jobId, 'processing', 'translate');

            // Kết thúc đo thời gian
            const totalTime = await monitor.endMeasure('ocr_process', jobId);
            
            // Kiểm tra totalTime có phải là số hay không
            if (typeof totalTime === 'number') {
                console.log(`OCR cho job ${jobId} hoàn thành trong ${totalTime.toFixed(2)}ms`);
            } else {
                console.log(`OCR cho job ${jobId} hoàn thành`);
            }
        });
    } catch (error) {
        console.error('Lỗi trong quá trình OCR:', error);
        // Ghi nhận lỗi
        await monitor.recordMetric('ocr_error', error.message, jobId);
        throw error;
    }
}

async function startOCRWorker() {
    await consumeQueue(QUEUES.OCR, processOCRJob, MAX_CONCURRENT_WORKERS);
    console.log('OCR Worker đã bắt đầu');
}

// Bắt đầu worker
startOCRWorker().catch(console.error);