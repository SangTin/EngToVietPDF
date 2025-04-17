const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Đảm bảo thư mục output tồn tại
const OUTPUT_DIR = "./output";
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DEFAULT_OUT_FILE = path.join(OUTPUT_DIR, "output.pdf");

function createPDF(text, outputPath = DEFAULT_OUT_FILE) {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(outputPath));
    doc.font('font/Roboto-Regular.ttf')
        .fontSize(14)
        .text(text, 100, 100);
    doc.end();
    return outputPath;
}

module.exports = {
    createPDF
}