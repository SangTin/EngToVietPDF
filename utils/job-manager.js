const { v4: uuidv4 } = require('uuid');
const { processOCR } = require('./queue');
const cache = require('./cache');

const instance = {
    // Tạo công việc mới
    async createJob() {
        const jobId = uuidv4();
        const createdAt = Date.now();

        await cache.set(`job_${jobId}`, {
            id: jobId,
            status: 'pending',
            currentStep: null,
            createdAt,
            updatedAt: createdAt
        });
        console.log('Tạo job mới:', jobId);

        return jobId;
    },

    // Bắt đầu quy trình xử lý ảnh
    async startImageProcessing(imagePath, jobId) {
        try {
            // Cập nhật trạng thái job
            await this.updateJobStatus(jobId, 'processing');

            // Bắt đầu quy trình OCR -> Translate -> PDF
            await processOCR(imagePath, jobId);

            return jobId;
        } catch (error) {
            await this.updateJobStatus(jobId, 'error', null, error.message);
            throw error;
        }
    },

    // Cập nhật trạng thái job
    async updateJobStatus(jobId, status, currentStep = null, message = null) {
        const jobKey = `job_${jobId}`;
        const job = await cache.get(jobKey) || {};

        const updatedJob = {
            ...job,
            status,
            updatedAt: Date.now()
        };

        if (currentStep !== undefined) {
            updatedJob.currentStep = currentStep;
        }

        if (message) {
            updatedJob.message = message;
        }

        await cache.set(jobKey, updatedJob);

        return updatedJob;
    },

    // Lấy thông tin job
    async getJob(jobId) {
        const jobKey = `job_${jobId}`;
        const job = await cache.get(jobKey);

        if (!job) {
            return null;
        }
        
        return {
            ...job,
            currentStep: job.currentStep || null
        };
    },

    // Lấy kết quả job
    async getJobResult(jobId) {
        const job = await this.getJob(jobId);

        if (!job) {
            return null;
        }

        const currentStep = job.currentStep || null;

        const completed = await cache.get(`job_${jobId}_completed`);

        if (!completed) {
            return {
                ...job,
                currentStep,
                result: null
            };
        }

        // Lấy các kết quả trung gian
        const ocrResult = await cache.get(`job_${jobId}_ocr`);
        const translateResult = await cache.get(`job_${jobId}_translate`);
        const pdfResult = await cache.get(`job_${jobId}_pdf`);

        return {
            ...job,
            status: 'completed',
            currentStep,
            result: {
                ocr: ocrResult,
                translate: translateResult,
                pdf: pdfResult
            }
        };
    }
}

module.exports = instance;