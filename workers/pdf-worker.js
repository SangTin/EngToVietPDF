const { consumeQueue, QUEUES } = require('../utils/queue');
const { createPDF } = require('../utils/pdf');
const cache = require('../utils/cache');
const path = require('path');
const JobManager = require('../utils/job-manager');

async function processPDFJob(data) {
    const { text, jobId } = data;

    try {
        await JobManager.updateJobStatus(jobId, 'processing', 'pdf');
        console.log(`Đang tạo PDF cho job ${jobId}`);

        // Tạo tên file duy nhất dựa vào jobId
        const outputFile = path.join('./output', `output_${jobId}.pdf`);

        // Tùy chỉnh hàm createPDF để nhận đường dẫn file
        const pdfFile = await createPDF(text, outputFile);

        // Lưu đường dẫn file PDF vào cache
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