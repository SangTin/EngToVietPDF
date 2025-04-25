const { consumeQueue, QUEUES, processOCR, processPDF } = require('../utils/queue');
const imageProcessor = require('../utils/image-processor');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');
const crypto = require('crypto');
const fs = require('fs').promises;
const monitor = require('../utils/monitoring');
const { Semaphore } = require('async-mutex');

// Giới hạn xử lý đồng thời
const MAX_CONCURRENT = 3;
const semaphore = new Semaphore(MAX_CONCURRENT);

// Tạo hash của file để làm key cache
async function generateFileHash(filePath) {
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

async function processPreprocessJob(data) {
    const { imagePath, jobId } = data;

    try {
        monitor.startMeasure('preprocess', jobId);
        await JobManager.updateJobStatus(jobId, 'processing', 'preprocess');
        console.log(`Bắt đầu tiền xử lý ảnh cho job ${jobId}: ${imagePath}`);

        return await semaphore.runExclusive(async () => {
            // Tạo key cache dựa trên hash của file gốc
            const fileHash = await generateFileHash(imagePath);
            const cacheKey = cache.generateCacheKey(fileHash, cache.CACHE_TYPES.PREPROCESS);

            // Kiểm tra cache
            const cachedPath = await cache.get(cacheKey);

            let processedPath;
            if (cachedPath && await fs.access(cachedPath).then(() => true).catch(() => false)) {
                console.log(`Sử dụng ảnh đã tiền xử lý từ cache cho job ${jobId}`);
                processedPath = cachedPath;
                await monitor.recordMetric('cache_hit', 1, jobId);
                
                // Kiểm tra xem toàn bộ quy trình đã được cache chưa
                const translateKey = cache.generateCacheKey(fileHash, cache.CACHE_TYPES.TRANSLATE);
                const cachedTranslation = await cache.get(translateKey);
                
                if (cachedTranslation) {
                    // Nếu đã có kết quả dịch trong cache, trả về luôn
                    console.log(`Tìm thấy kết quả đầy đủ trong cache cho job ${jobId}, bỏ qua OCR và dịch`);
                    
                    // Lưu kết quả trực tiếp
                    await cache.setWithPriority(`job_${jobId}_ocr`, cachedTranslation.ocrText);
                    await cache.setWithPriority(`job_${jobId}_translate`, cachedTranslation.translatedText);
                    
                    // Cập nhật trạng thái job
                    await JobManager.updateJobStatus(jobId, 'processing', 'pdf');
                    
                    // Chuyển thẳng đến bước tạo PDF
                    await processPDF(cachedTranslation.translatedText, jobId);
                    
                    return processedPath;
                }
            } else {
                // Thực hiện tiền xử lý ảnh
                console.log(`Đang tiền xử lý ảnh cho job ${jobId}`);
                processedPath = await imageProcessor.smartImagePreprocessing(imagePath);
                
                // Lưu vào cache
                await cache.setWithPriority(cacheKey, processedPath);
                await monitor.recordMetric('cache_miss', 1, jobId);
            }

            // Lưu filehash và đường dẫn ảnh đã xử lý cho job hiện tại
            await cache.setWithPriority(`job_${jobId}_filehash`, fileHash, 'HIGH');
            await cache.setWithPriority(`job_${jobId}_preprocessed`, processedPath);

            // Đo thời gian và kết thúc
            const totalTime = await monitor.endMeasure('preprocess', jobId);
            console.log(`Tiền xử lý ảnh cho job ${jobId} hoàn thành trong ${totalTime?.toFixed(2) || '?'}ms`);

            // Chuyển tiếp đến OCR worker
            await processOCR(processedPath, jobId);
            await JobManager.updateJobStatus(jobId, 'processing', 'ocr');

            return processedPath;
        });
    } catch (error) {
        console.error(`Lỗi trong quá trình tiền xử lý ảnh job ${jobId}:`, error);
        throw error;
    }
}

async function startPreprocessWorker() {
    await consumeQueue(QUEUES.PREPROCESS, processPreprocessJob, MAX_CONCURRENT);
    console.log('Preprocess Worker đã bắt đầu');
}

// Bắt đầu worker
startPreprocessWorker().catch(console.error);