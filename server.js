const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const crypto = require('crypto');

// Import các module hiện có
const ocr = require("./utils/ocr");
const { createPDF } = require("./utils/pdf");
const { translate } = require("./utils/translate");
const cache = require("./utils/cache");
const { memoryCache } = cache;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/output', express.static('output'));

// Cấu hình multer để xử lý upload file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Đảm bảo thư mục data tồn tại
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        cb(null, './data')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Chỉ cho phép upload ảnh
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Chỉ cho phép tải lên các file hình ảnh!'));
        }
        cb(null, true);
    }
});

// Đảm bảo thư mục output tồn tại
if (!fs.existsSync('./output')) {
    fs.mkdirSync('./output');
}

// Hàm tính image hash để làm cache key
async function getImageHash(imagePath) {
    return new Promise((resolve, reject) => {
        try {
            const fileBuffer = fs.readFileSync(imagePath);
            const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
            resolve(hash);
        } catch (error) {
            reject(error);
        }
    });
}

// API endpoint để xử lý tải lên và chuyển đổi hình ảnh với cache
app.post('/process-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file nào được tải lên' });
        }

        const imagePath = req.file.path;
        const startTime = Date.now(); // Bắt đầu đo thời gian xử lý

        // Tính hash của hình ảnh để làm key cache
        const imageHash = await getImageHash(imagePath);
        const cacheKey = cache.generateCacheKey(imageHash, 'ocr_translate');

        // Kiểm tra cache
        const cachedResult = cache.get(cacheKey);

        let extractedText, translatedText, pdfFile;
        let cacheHit = false;

        if (cachedResult) {
            // Nếu có cache, sử dụng kết quả từ cache
            console.log('Cache hit! Sử dụng kết quả từ cache');
            extractedText = cachedResult.extractedText;
            translatedText = cachedResult.translatedText;
            cacheHit = true;
        } else {
            // Nếu không có cache, thực hiện OCR và dịch
            console.log('Cache miss! Thực hiện OCR và dịch thuật');
            extractedText = await ocr.image2text(imagePath);
            translatedText = await translate(extractedText);

            // Lưu kết quả vào cache
            cache.set(cacheKey, {
                extractedText,
                translatedText
            });
        }

        // Tạo PDF (luôn tạo mới để đảm bảo tên file là duy nhất)
        const outputFilename = 'output-' + Date.now() + '.pdf';
        const outputPath = './output/' + outputFilename;

        // Cache cho PDF (sử dụng nội dung đã dịch làm key)
        const pdfCacheKey = cache.generateCacheKey(translatedText, 'pdf');
        const cachedPdfPath = cache.get(pdfCacheKey);

        if (cachedPdfPath && fs.existsSync(cachedPdfPath)) {
            // Sao chép file PDF từ cache
            fs.copyFileSync(cachedPdfPath, outputPath);
            pdfFile = outputPath;
            console.log('Sử dụng PDF từ cache');
        } else {
            // Tạo PDF mới
            pdfFile = await createPDFWithPath(translatedText, outputPath);
            // Lưu đường dẫn PDF vào cache
            cache.set(pdfCacheKey, pdfFile);
            console.log('Tạo PDF mới');
        }

        const processingTime = Date.now() - startTime; // Tính thời gian xử lý

        res.json({
            success: true,
            originalText: extractedText,
            translatedText: translatedText,
            pdfUrl: `/output/${outputFilename}`,
            fromCache: cacheHit,
            processingTime: processingTime + 'ms'
        });

        // Xóa file hình ảnh sau khi xử lý xong để tiết kiệm không gian
        setTimeout(() => {
            try {
                fs.unlinkSync(imagePath);
                console.log(`Đã xóa file hình ảnh tạm: ${imagePath}`);
            } catch (err) {
                console.error(`Không thể xóa file: ${imagePath}`, err);
            }
        }, 5000); // Đợi 5 giây trước khi xóa

    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi khi xử lý hình ảnh' });
    }
});

// API endpoint để xóa cache
app.post('/clear-cache', (req, res) => {
    try {
        cache.clear();
        res.json({ success: true, message: 'Đã xóa toàn bộ cache' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi xóa cache' });
    }
});

// API endpoint để xem trạng thái cache
// API endpoint để xem trạng thái cache
app.get('/cache-stats', (req, res) => {
    try {
        // Định nghĩa đường dẫn đến thư mục cache
        const cacheDir = path.join(__dirname, 'cache');
        // Đường dẫn đến file cache-data.json
        const cacheFile = path.join(cacheDir, 'cache-data.json');

        if (!fs.existsSync(cacheFile)) {
            return res.json({
                totalCacheItems: 0,
                fileCacheEntries: 0,
                memoryCacheEntries: 0,
                cacheSize: '0 MB',
                cacheDirectory: cacheDir,
                oldestCache: null,
                newestCache: null
            });
        }

        // Đọc dữ liệu cache từ file
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const cacheKeys = Object.keys(cacheData);
        const cacheFileSize = fs.statSync(cacheFile).size;

        // Tính toán thời gian cũ nhất và mới nhất
        let oldestDate = Date.now();
        let newestDate = 0;

        for (const key in cacheData) {
            const expiry = cacheData[key].expiry;
            const creationTime = expiry - (24 * 60 * 60 * 1000); // Ước tính thời gian tạo từ expiry

            if (creationTime < oldestDate) {
                oldestDate = creationTime;
            }

            if (creationTime > newestDate) {
                newestDate = creationTime;
            }
        }

        // Lấy thống kê từ memory cache
        // Chúng ta không thể truy cập trực tiếp memoryCache từ module cache
        // nên chỉ có thể ước tính dựa trên số lượng key trong cache

        res.json({
            totalCacheItems: cacheKeys.length,
            fileCacheEntries: cacheKeys.length,
            memoryCacheEntries: 0, // Không thể biết chính xác số lượng memory cache entries
            cacheSize: (cacheFileSize / (1024 * 1024)).toFixed(2) + ' MB',
            cacheDirectory: cacheDir,
            oldestCache: cacheKeys.length > 0 ? new Date(oldestDate).toISOString() : null,
            newestCache: cacheKeys.length > 0 ? new Date(newestDate).toISOString() : null
        });
    } catch (error) {
        console.error('Error getting cache stats:', error);
        res.status(500).json({ error: 'Không thể lấy thống kê cache: ' + error.message });
    }
});

// Hàm tạo PDF với đường dẫn tùy chỉnh
function createPDFWithPath(text, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            doc.pipe(fs.createWriteStream(outputPath));
            doc.font('font/Roboto-Regular.ttf')
                .fontSize(14)
                .text(text, 100, 100);
            doc.end();

            // Đợi để PDF được tạo xong
            doc.on('end', () => {
                resolve(outputPath);
            });

            doc.on('error', (err) => {
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

// Lên lịch dọn dẹp các file tạm và cache cũ
function cleanupOldFiles() {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 ngày

    // Dọn dẹp thư mục output
    if (fs.existsSync('./output')) {
        fs.readdirSync('./output').forEach(file => {
            const filePath = path.join('./output', file);
            const stats = fs.statSync(filePath);
            if (Date.now() - stats.mtime.getTime() > maxAge) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Đã xóa file PDF cũ: ${filePath}`);
                } catch (err) {
                    console.error(`Không thể xóa file: ${filePath}`, err);
                }
            }
        });
    }

    // Dọn dẹp thư mục data nếu có file sót lại
    if (fs.existsSync('./data')) {
        fs.readdirSync('./data').forEach(file => {
            const filePath = path.join('./data', file);
            const stats = fs.statSync(filePath);
            if (Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) { // 1 ngày
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Đã xóa file hình ảnh cũ: ${filePath}`);
                } catch (err) {
                    console.error(`Không thể xóa file: ${filePath}`, err);
                }
            }
        });
    }

    // Dọn dẹp cache cũ
    cache.prune();
}

// Lên lịch dọn dẹp file mỗi ngày
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);

// Chạy dọn dẹp khi khởi động server
cleanupOldFiles();

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log(`Cache đã được kích hoạt để tăng hiệu suất`);
});