const { consumeQueue, QUEUES, processPDF } = require('../utils/queue');
const { translate } = require('../utils/translate');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');

async function processTranslationJob(data) {
    const { text, jobId } = data;

    try {
        // Cập nhật trạng thái là đang xử lý dịch
        await JobManager.updateJobStatus(jobId, 'processing', 'translate');

        // Kiểm tra cache
        const cacheKey = cache.generateCacheKey(text, 'translate');
        let translatedText = await cache.get(cacheKey);

        if (translatedText) {
            console.log(`Sử dụng kết quả dịch từ cache cho job ${jobId}`);
        } else {
            console.log(`Đang dịch văn bản cho job ${jobId}`);
            const newTranslation = await translate(text);

            // Lưu kết quả vào cache
            cache.set(cacheKey, newTranslation);
            translatedText = newTranslation;
        }

        // Lưu kết quả dịch cho job hiện tại
        const jobKey = `job_${jobId}_translate`;
        await cache.set(jobKey, translatedText);

        // Chuyển tiếp dữ liệu đến hàng đợi tạo PDF
        await processPDF(translatedText, jobId);
        await JobManager.updateJobStatus(jobId, 'processing', 'pdf');

        console.log(`Hoàn thành dịch cho job ${jobId}`);
    } catch (error) {
        console.error('Lỗi trong quá trình dịch:', error);
        throw error;
    }
}

async function startTranslateWorker() {
    await consumeQueue(QUEUES.TRANSLATE, processTranslationJob);
    console.log('Translate Worker đã bắt đầu');
}

// Bắt đầu worker
startTranslateWorker().catch(console.error);