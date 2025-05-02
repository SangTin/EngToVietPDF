const { redisClient, REDIS_PREFIX } = require('./utils/cache');
const fs = require('fs').promises;
const path = require('path');
const UPLOAD_DIR = './uploads';
const OUTPUT_DIR = './output';
const MAX_AGE_DAYS = {
    PREPROCESSED: 1, // Xóa file tiền xử lý sau 1 ngày
    ORIGINAL: 1,     // Xóa file gốc sau 1 ngày
    PDF: 1           // Xóa file PDF sau 1 ngày
};

// Lấy danh sách các file trong thư mục
async function getFilesInDirectory(directory) {
    try {
        const files = await fs.readdir(directory);
        return files.map(file => path.join(directory, file));
    } catch (error) {
        console.error(`Lỗi khi đọc thư mục ${directory}:`, error);
        return [];
    }
}

// Kiểm tra xem file có đang được sử dụng trong cache không
async function isFileInUse(client, filePath) {
    try {
        // Kiểm tra tất cả các key có thể liên quan đến file này
        const fileBasename = path.basename(filePath);

        // Tìm tất cả các key có chứa tên file
        const keys = await client.keys(`${REDIS_PREFIX}*${fileBasename}*`);

        // Nếu có key nào đó, file vẫn đang được sử dụng
        return keys.length > 0;
    } catch (error) {
        console.error(`Lỗi khi kiểm tra file ${filePath} trong cache:`, error);
        // Nếu không thể kiểm tra, coi như file đang được sử dụng để an toàn
        return true;
    }
}

// Kiểm tra tuổi của file dựa trên thời gian sửa đổi
async function isFileExpired(filePath, maxAgeDays) {
    try {
        const stats = await fs.stat(filePath);
        const fileModifiedTime = stats.mtime.getTime();
        const currentTime = Date.now();
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000; // Chuyển đổi ngày thành mili giây

        return (currentTime - fileModifiedTime) > maxAgeMs;
    } catch (error) {
        console.error(`Lỗi khi kiểm tra tuổi của file ${filePath}:`, error);
        // Nếu không thể kiểm tra, không coi là hết hạn để an toàn
        return false;
    }
}

// Xóa file nếu nó hết hạn và không còn được sử dụng
async function deleteIfExpired(client, filePath, maxAgeDays) {
    try {
        const isExpired = await isFileExpired(filePath, maxAgeDays);

        if (isExpired) {
            // Nếu file đã hết hạn, kiểm tra xem nó có còn được sử dụng trong cache không
            const inUse = await isFileInUse(client, filePath);

            if (!inUse) {
                // Nếu file không còn được sử dụng, xóa nó
                await fs.unlink(filePath);
                console.log(`Đã xóa file hết hạn: ${filePath}`);
                return true;
            } else {
                console.log(`File hết hạn nhưng vẫn đang được sử dụng: ${filePath}`);
            }
        }

        return false;
    } catch (error) {
        console.error(`Lỗi khi xóa file ${filePath}:`, error);
        return false;
    }
}

// Hàm xử lý chính
async function cleanupExpiredFiles() {
    console.log('Bắt đầu quá trình dọn dẹp file hết hạn...');

    try {
        if (!redisClient.isOpen) {
            console.log('Kết nối Redis chưa được thiết lập, đang kết nối...');
            await redisClient.connect();
        }

        // Xử lý thư mục uploads (ảnh gốc và tiền xử lý)
        const uploadFiles = await getFilesInDirectory(UPLOAD_DIR);
        console.log(`Tìm thấy ${uploadFiles.length} file trong thư mục uploads`);

        let deletedCount = 0;

        // Xử lý các file tiền xử lý (có tiền tố 'preprocessed_')
        for (const file of uploadFiles) {
            const basename = path.basename(file);

            if (basename.startsWith('preprocessed_')) {
                // File tiền xử lý
                if (await deleteIfExpired(redisClient, file, MAX_AGE_DAYS.PREPROCESSED)) {
                    deletedCount++;
                }
            } else {
                // File ảnh gốc
                if (await deleteIfExpired(redisClient, file, MAX_AGE_DAYS.ORIGINAL)) {
                    deletedCount++;
                }
            }
        }

        // Xử lý thư mục output (PDF)
        const outputFiles = await getFilesInDirectory(OUTPUT_DIR);
        console.log(`Tìm thấy ${outputFiles.length} file trong thư mục output`);

        for (const file of outputFiles) {
            if (path.extname(file).toLowerCase() === '.pdf') {
                if (await deleteIfExpired(redisClient, file, MAX_AGE_DAYS.PDF)) {
                    deletedCount++;
                }
            }
        }

        console.log(`Quá trình dọn dẹp hoàn tất. Đã xóa ${deletedCount} file hết hạn.`);
    } catch (error) {
        console.error('Lỗi trong quá trình dọn dẹp file:', error);
    }
}

// Chạy hàm xử lý
cleanupExpiredFiles()
    .then(async () => {
        // Đóng kết nối Redis nếu script chạy độc lập
        if (process.env.NODE_ENV !== 'production' || process.argv.includes('--standalone')) {
            console.log('Đóng kết nối Redis...');
            await redisClient.quit();
        }
        console.log('Script hoàn tất.');
    })
    .catch(async (error) => {
        console.error('Lỗi không xử lý được:', error);
        // Đóng kết nối Redis trong trường hợp lỗi
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
        process.exit(1);
    });