const { consumeQueue, QUEUES } = require('../utils/queue');
const { createPDF } = require('../utils/pdf');
const cache = require('../utils/cache');
const path = require('path');
const crypto = require('crypto');
const JobManager = require('../utils/job-manager');
const { Semaphore } = require('async-mutex');
const monitor = require('../utils/monitoring');

const MAX_CONCURRENT_WORKERS = 3;
const semaphore = new Semaphore(MAX_CONCURRENT_WORKERS);

// Tạo key cache duy nhất cho văn bản
function generateTextCacheKey(text) {
    const hashSum = crypto.createHash('md5');
    hashSum.update(text);
    return `pdf_${hashSum.digest('hex')}`;
}

async function processPDFJob(data) {
    const { text, jobId } = data;

    try {
        monitor.startMeasure('pdf_process', jobId);
        await JobManager.updateJobStatus(jobId, 'processing', 'pdf');
        console.log(`Đang tạo PDF cho job ${jobId}`);

        return await semaphore.runExclusive(async () => {
            // Tạo key cache dựa trên nội dung văn bản
            const cacheKey = cache.generateCacheKey(text, cache.CACHE_TYPES.PDF);

            // Kiểm tra xem PDF đã được tạo từ văn bản này chưa
            let pdfFile = await cache.get(cacheKey);

            if (!pdfFile) {
                monitor.startMeasure('pdf_execution', jobId);
                // Tạo tên file duy nhất dựa vào jobId
                const outputFile = path.join('./output', `output_${jobId}.pdf`);

                // Tạo PDF mới
                pdfFile = await createPDF(text, outputFile);
                await monitor.endMeasure('pdf_execution', jobId);
                await monitor.recordMetric('cache_miss', 1, jobId);

                // Lưu đường dẫn file PDF vào cache
                await cache.setWithPriority(cacheKey, pdfFile);
            } else {
                await monitor.recordMetric('cache_hit', 1, jobId);
                console.log(`Sử dụng PDF từ cache cho job ${jobId}`);
            }

            // Lưu đường dẫn PDF cho job hiện tại
            const jobKey = `job_${jobId}_pdf`;
            await cache.setWithPriority(jobKey, pdfFile);

            // Đánh dấu job hoàn thành
            await cache.setWithPriority(`job_${jobId}_completed`, true);
            await monitor.endMeasure('pdf_process', jobId);

            console.log(`Hoàn thành tạo PDF cho job ${jobId}: ${pdfFile}`);
            return pdfFile;
        });
    } catch (error) {
        console.error('Lỗi trong quá trình xử lý job PDF:', error);
        throw error;
    }
}

async function startPDFWorker() {
    await consumeQueue(QUEUES.PDF, processPDFJob, 5);
    console.log('PDF Worker đã bắt đầu');
}

// Bắt đầu worker
startPDFWorker().catch(console.error);