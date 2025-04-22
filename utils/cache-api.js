const express = require('express');
const cache = require('./cache');
const { connect, QUEUES } = require('./queue');

const router = express.Router();

// API endpoint để lấy thống kê cache
router.get('/api/cache-stats', async (req, res) => {
    try {
        // Lấy thông tin từ bộ nhớ cache
        const memoryCache = cache.getMemoryCache();
        const totalItems = memoryCache.size;

        // Tính kích thước bộ nhớ (xấp xỉ)
        let memorySize = 0;
        let oldestCache = null;
        let newestCache = null;
        let typeCounts = {
            ocr: 0,
            translate: 0,
            job: 0
        };

        // Lặp qua tất cả các mục trong cache để thu thập thông tin
        for (const [key, value] of memoryCache.entries()) {
            // Ước tính kích thước
            const jsonStr = JSON.stringify(value.data);
            memorySize += jsonStr.length * 2; // Ước tính byte

            // Xác định cache cũ nhất và mới nhất
            if (oldestCache === null || value.expiry < oldestCache) {
                oldestCache = value.expiry;
            }
            if (newestCache === null || value.expiry > newestCache) {
                newestCache = value.expiry;
            }

            // Phân loại cache
            if (key.startsWith('ocr_')) {
                typeCounts.ocr++;
            } else if (key.startsWith('translate_')) {
                typeCounts.translate++;
            } else if (key.startsWith('job_')) {
                typeCounts.job++;
            }
        }

        // Format kích thước bộ nhớ
        let memorySizeFormatted;
        if (memorySize < 1024) {
            memorySizeFormatted = `${memorySize} bytes`;
        } else if (memorySize < 1024 * 1024) {
            memorySizeFormatted = `${(memorySize / 1024).toFixed(2)} KB`;
        } else {
            memorySizeFormatted = `${(memorySize / (1024 * 1024)).toFixed(2)} MB`;
        }

        // Lấy thông tin từ hàng đợi RabbitMQ
        let queueCounts = {
            ocr: 0,
            translate: 0,
            pdf: 0
        };

        try {
            const { channel } = await connect();

            // Lấy số lượng tin nhắn trong mỗi hàng đợi
            const ocrQueue = await channel.checkQueue(QUEUES.OCR);
            const translateQueue = await channel.checkQueue(QUEUES.TRANSLATE);
            const pdfQueue = await channel.checkQueue(QUEUES.PDF);

            queueCounts.ocr = ocrQueue.messageCount;
            queueCounts.translate = translateQueue.messageCount;
            queueCounts.pdf = pdfQueue.messageCount;

            await channel.close();
        } catch (error) {
            console.error('Lỗi khi kiểm tra hàng đợi:', error);
            // Không trả về lỗi, chỉ ghi log
        }

        res.json({
            success: true,
            totalItems,
            memorySize: memorySizeFormatted,
            oldestCache,
            newestCache,
            typeCounts,
            queueCounts
        });
    } catch (error) {
        console.error('Lỗi khi lấy thống kê cache:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê cache',
            error: error.message
        });
    }
});

// API endpoint để xóa tất cả cache
router.post('/api/clear-cache', (req, res) => {
    try {
        const status = cache.clear();

        res.json({
            success: status,
            message: 'Đã xóa tất cả cache'
        });
    } catch (error) {
        console.error('Lỗi khi xóa cache:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa cache',
            error: error.message
        });
    }
});

module.exports = router;