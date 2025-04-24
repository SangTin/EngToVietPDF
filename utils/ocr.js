const tesseract = require("node-tesseract-ocr");
const { execSync } = require('child_process');

async function image2text(path) {
  try {
    let useOpenCL = process.env.TESSERACT_OPENCL === '1';
    
    if (useOpenCL) {
      try {
        // Kiểm tra thiết bị OpenCL
        const gpuInfo = execSync('clinfo | grep "Number of platforms" || echo "0"').toString();
        if (gpuInfo.includes('0')) {
          console.log('Không phát hiện GPU hỗ trợ OpenCL, chuyển sang CPU');
          useOpenCL = false;
        } else {
          console.log('Phát hiện GPU hỗ trợ OpenCL, sử dụng tăng tốc GPU');
        }
      } catch (err) {
        console.log('Lỗi khi kiểm tra OpenCL, chuyển sang CPU:', err.message);
        useOpenCL = false;
      }
    }

    // Cấu hình Tesseract với OpenCL
    const config = {
      lang: "eng",
      oem: 1,
      psm: 3,
      opencl: useOpenCL,
    };

    return await tesseract.recognize(path, config);
  } catch (error) {
    console.error("Lỗi khi xử lý OCR:", error);
    throw error;
  }
}

module.exports = {
  image2text
}