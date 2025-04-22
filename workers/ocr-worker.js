const { consumeQueue, QUEUES, processTranslation } = require('../utils/queue');
const ocr = require('../utils/ocr');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');

async function processOCRJob(data) {
    const { imagePath, jobId } = data;

    try {
        await JobManager.updateJobStatus(jobId, 'processing', 'ocr');

        // Kiểm tra cache
        const cacheKey = cache.generateCacheKey(imagePath, 'ocr');
        const cachedText = await cache.get(cacheKey);

        if (cachedText) {
            console.log(`Sử dụng kết quả OCR từ cache cho: ${imagePath}`);
            return cachedText;
        }

        console.log(`Đang thực hiện OCR cho ảnh: ${imagePath}`);
        const extractedText = await ocr.image2text(imagePath);

        // Lưu kết quả vào cache
        cache.set(cacheKey, extractedText);

        // Lưu kết quả OCR cho job hiện tại
        const jobKey = `job_${jobId}_ocr`;
        await cache.set(jobKey, extractedText);

        // Chuyển tiếp dữ liệu đến hàng đợi dịch thuật
        await processTranslation(extractedText, jobId);
        await JobManager.updateJobStatus(jobId, 'processing', 'translate');

        console.log(`Hoàn thành OCR cho job ${jobId}`);
    } catch (error) {
        console.error('Lỗi trong quá trình OCR:', error);
        throw error;
    }
}

async function startOCRWorker() {
    await consumeQueue(QUEUES.OCR, processOCRJob);
    console.log('OCR Worker đã bắt đầu');
}

// Bắt đầu worker
startOCRWorker().catch(console.error);