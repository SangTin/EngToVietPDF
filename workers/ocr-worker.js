const { consumeQueue, QUEUES, processTranslation } = require('../utils/queue');
const ocr = require('../utils/ocr');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');
const crypto = require('crypto');
const fs = require('fs').promises;

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
        await JobManager.updateJobStatus(jobId, 'processing', 'ocr');

        // Tạo key cache dựa trên hash của file
        const fileHash = await generateFileHash(imagePath);
        const cacheKey = `ocr_${fileHash}`;

        // Kiểm tra cache
        const cachedText = await cache.get(cacheKey);

        let extractedText;
        if (cachedText) {
            console.log(`Sử dụng kết quả OCR từ cache cho: ${imagePath}`);
            extractedText = cachedText;
        } else {
            console.log(`Đang thực hiện OCR cho ảnh: ${imagePath}`);
            extractedText = await ocr.image2text(imagePath);

            // Lưu kết quả vào cache
            // Sử dụng thời gian hết hạn mặc định hoặc có thể tùy chỉnh
            await cache.set(cacheKey, extractedText);
        }

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