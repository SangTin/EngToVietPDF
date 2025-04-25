const { v4: uuidv4 } = require('uuid');
const { processPreprocess } = require('./queue');
const cache = require('./cache');
const fs = require('fs').promises;

async function getOrSetCache(key, dataFn, ttl) {
    // Kiểm tra cache trước
    const cachedData = await cache.get(key);
    if (cachedData) return cachedData;
    
    // Nếu không có trong cache, gọi hàm để lấy dữ liệu
    const newData = await dataFn();
    
    // Lưu vào cache và trả về
    await cache.set(key, newData, ttl);
    return newData;
}

const instance = {
    // Tạo công việc mới
    async createJob() {
        const jobId = uuidv4();
        const createdAt = Date.now();

        await cache.setWithPriority(`job_${jobId}`, {
            id: jobId,
            status: 'pending',
            currentStep: null,
            createdAt,
            updatedAt: createdAt
        });
        console.log('Tạo job mới:', jobId);

        return jobId;
    },

    async cleanupCompletedJob(jobId) {
        try {
            const job = await this.getJob(jobId);
            
            if (job && job.status === 'completed') {
                // Xóa tập tin gốc và tiền xử lý nếu có
                const imagePath = await cache.get(`job_${jobId}_original`);
                const preprocessedPath = await cache.get(`job_${jobId}_preprocessed`);
                
                if (imagePath && imagePath !== preprocessedPath) {
                    try {
                        await fs.access(imagePath);
                        await fs.unlink(imagePath);
                        console.log(`Đã xóa tập tin gốc: ${imagePath}`);
                    } catch (err) {
                        // Tập tin không tồn tại hoặc không thể xóa
                        console.error(`Không thể xóa tập tin gốc ${imagePath}:`, err);
                    }
                }
                
                if (preprocessedPath && preprocessedPath === imagePath) {
                    try {
                        await fs.access(preprocessedPath);
                        await fs.unlink(preprocessedPath);
                        console.log(`Đã xóa tập tin tiền xử lý: ${preprocessedPath}`);
                    } catch (err) {
                        // Tập tin không tồn tại hoặc không thể xóa
                        console.error(`Không thể xóa tập tin tiền xử lý ${preprocessedPath}:`, err);
                    }
                }
                
                // Chỉ giữ lại kết quả PDF và xóa các cache trung gian
                await cache.remove(`job_${jobId}_ocr`);
                await cache.remove(`job_${jobId}_preprocessed`);
                
                // Cập nhật thông tin job
                await this.updateJobStatus(jobId, 'archived');
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`Lỗi khi dọn dẹp job ${jobId}:`, error);
            return false;
        }
    },

    // Bắt đầu quy trình xử lý ảnh
    async startImageProcessing(imagePath, jobId) {
        try {
            // Cập nhật trạng thái job
            await this.updateJobStatus(jobId, 'processing');

            // Bắt đầu quy trình Preprocess -> OCR -> Translate -> PDF
            await processPreprocess(imagePath, jobId);

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

        await cache.setWithPriority(jobKey, updatedJob);

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

        const completed = job.status === 'completed' || job.status === 'archived';

        if (!completed) {
            return {
                ...job,
                currentStep,
                result: null
            };
        }

        // Lấy các kết quả trung gian
        const pdfResult = await cache.get(`job_${jobId}_pdf`);

        return {
            ...job,
            status: 'completed',
            currentStep,
            result: {
                pdf: pdfResult
            }
        };
    }
}

module.exports = instance;