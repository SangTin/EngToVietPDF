const { consumeQueue, QUEUES } = require('../utils/queue');
const { createPDF } = require('../utils/pdf');
const cache = require('../utils/cache');
const path = require('path');
const crypto = require('crypto');
const JobManager = require('../utils/job-manager');

// Tạo key cache duy nhất cho văn bản
function generateTextCacheKey(text) {
    const hashSum = crypto.createHash('md5');
    hashSum.update(text);
    return `pdf_${hashSum.digest('hex')}`;
}

async function processPDFJob(data) {
    const { text, jobId } = data;

    try {
        await JobManager.updateJobStatus(jobId, 'processing', 'pdf');
        console.log(`Đang tạo PDF cho job ${jobId}`);

        // Tạo key cache dựa trên nội dung văn bản
        const textCacheKey = generateTextCacheKey(text);

        // Kiểm tra xem PDF đã được tạo từ văn bản này chưa
        let pdfFile = await cache.get(textCacheKey);

        if (!pdfFile) {
            // Tạo tên file duy nhất dựa vào jobId
            const outputFile = path.join('./output', `output_${jobId}.pdf`);

            // Tạo PDF mới
            pdfFile = await createPDF(text, outputFile);

            // Lưu đường dẫn file PDF vào cache
            await cache.set(textCacheKey, pdfFile);
        } else {
            console.log(`Sử dụng PDF từ cache cho job ${jobId}`);
        }

        // Lưu đường dẫn PDF cho job hiện tại
        const jobKey = `job_${jobId}_pdf`;
        await cache.set(jobKey, pdfFile);

        // Đánh dấu job hoàn thành
        await cache.set(`job_${jobId}_completed`, true);

        console.log(`Hoàn thành tạo PDF cho job ${jobId}: ${pdfFile}`);
        return pdfFile;
    } catch (error) {
        console.error('Lỗi trong quá trình tạo PDF:', error);
        throw error;
    }
}

async function startPDFWorker() {
    await consumeQueue(QUEUES.PDF, processPDFJob);
    console.log('PDF Worker đã bắt đầu');
}

// Bắt đầu worker
startPDFWorker().catch(console.error);