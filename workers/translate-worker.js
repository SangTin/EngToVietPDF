const { consumeQueue, QUEUES, processPDF } = require('../utils/queue');
const { translate } = require('../utils/translate');
const cache = require('../utils/cache');
const JobManager = require('../utils/job-manager');
const { Semaphore } = require('async-mutex');
const monitor = require('../utils/monitoring');

const MAX_CONCURRENT_WORKERS = parseInt(process.env.MAX_CONCURRENT_TRANSLATE_WORKERS, 10) || 3;
const semaphore = new Semaphore(MAX_CONCURRENT_WORKERS);

async function processTranslationJob(data) {
    const { text, jobId } = data;

    try {
        monitor.startMeasure('translate_process', jobId);
        await JobManager.updateJobStatus(jobId, 'processing', 'translate');
        console.log(`Bắt đầu dịch văn bản cho job ${jobId}:`);

        return await semaphore.runExclusive(async () => {
            // Kiểm tra cache
            const cacheKey = cache.generateCacheKey(text, cache.CACHE_TYPES.TRANSLATE);
            let translatedText = await cache.get(cacheKey);

            if (translatedText) {
                await monitor.recordMetric('cache_hit', 1, jobId);
                console.log(`Sử dụng kết quả dịch từ cache cho job ${jobId}`);
            } else {
                console.log(`Đang dịch văn bản cho job ${jobId}`);
                monitor.startMeasure('translate_execution', jobId);
                const newTranslation = await translate(text);
                await monitor.endMeasure('translate_execution', jobId);
                await monitor.recordMetric('cache_miss', 1, jobId);

                // Lưu kết quả vào cache
                await cache.setWithPriority(cacheKey, newTranslation);
                translatedText = newTranslation;
            }

            // Lưu kết quả dịch cho job hiện tại
            const jobKey = `job_${jobId}_translate`;
            await cache.setWithPriority(jobKey, translatedText);
            await monitor.endMeasure('translate_process', jobId);

            // Lưu kết quả dịch cho toàn bộ quy trình
            try {
                const fileHash = await cache.get(`job_${jobId}_filehash`);
                const fileKey = cache.generateCacheKey(fileHash, cache.CACHE_TYPES.TRANSLATE);
                await cache.setWithPriority(fileKey, {
                    ocrText: text,
                    translatedText: translatedText
                });
                console.log('Cache toàn bộ quá trình thành công');
            } catch (err) {
                console.log('Không thể cache toàn bộ quy trình:', err.message);
            }

            // Chuyển tiếp dữ liệu đến hàng đợi tạo PDF
            await processPDF(translatedText, jobId);
            await JobManager.updateJobStatus(jobId, 'processing', 'pdf');

            console.log(`Hoàn thành dịch cho job ${jobId}`);
        });
    } catch (error) {
        console.error('Lỗi trong quá trình dịch:', error);
        throw error;
    }
}

async function startTranslateWorker() {
    await consumeQueue(QUEUES.TRANSLATE, processTranslationJob, 5);
    console.log('Translate Worker đã bắt đầu');
}

// Bắt đầu worker
startTranslateWorker().catch(console.error);