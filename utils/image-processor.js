const sharp = require('sharp');
sharp.simd(true);
sharp.concurrency(4);

const path = require('path');
const fs = require('fs').promises;

async function preprocessTransparentImage(inputPath, transformer) {
  try {
    const dirname = path.dirname(inputPath);
    const filename = path.basename(inputPath);
    const preprocessedPath = path.join(dirname, `preprocessed_${filename}`);
    
    // Đọc thông tin ảnh
    const metadata = await transformer.metadata();
    
    // Kiểm tra xem ảnh có kênh alpha không (transparent)
    const hasAlpha = metadata.channels === 4 || metadata.hasAlpha;
    
    // Đối với ảnh trong suốt, thêm nền trắng
    transformer = transformer.flatten({ background: { r: 255, g: 255, b: 255 } });
    
    // Tính toán kích thước mới
    const targetWidth = Math.min(metadata.width * 2.5, 3000);
    const targetHeight = Math.round(targetWidth * metadata.height / metadata.width);
    
    // Tiếp tục quy trình xử lý
    await transformer
      .grayscale()
      .resize(targetWidth, targetHeight)
      // Nhẹ nhàng hơn với việc làm sắc nét và tăng độ tương phản
      .sharpen({
        sigma: 0.8,
        flat: 0.8,
        jagged: 1.5
      })
      // Tăng độ tương phản nhẹ
      .normalise()
      // Không sử dụng threshold để tránh mất thông tin chi tiết
      // Sử dụng định dạng png để giữ chất lượng tốt nhất
      .png()
      .toFile(preprocessedPath);
    
    return preprocessedPath;
  } catch (error) {
    console.error('Lỗi khi tiền xử lý ảnh trong suốt:', error);
    return inputPath;
  }
}

// Xử lý đặc biệt cho ảnh có chữ màu trắng trên nền trong suốt
async function preprocessWhiteTextImage(inputPath, transformer) {
  try {
    const dirname = path.dirname(inputPath);
    const filename = path.basename(inputPath);
    const preprocessedPath = path.join(dirname, `preprocessed_${filename}`);
    
    // Đọc thông tin ảnh
    const metadata = await transformer.metadata();
    
    // Kiểm tra màu chủ đạo của ảnh
    const stats = await transformer.stats();
    
    // Kiểm tra xem có phải ảnh sáng không (có thể là chữ trắng)
    const isLightImage = stats.channels.every(channel => channel.mean > 200);
    
    // Tính toán kích thước mới
    const targetWidth = Math.min(metadata.width * 2.5, 3000);
    const targetHeight = Math.round(targetWidth * metadata.height / metadata.width);
    
    // Pipeline xử lý ảnh
    let pipeline = transformer;
    
    if (isLightImage) {
      // Đối với chữ trắng, thêm nền đen để tạo độ tương phản
      pipeline = pipeline.flatten({ background: { r: 0, g: 0, b: 0 } });
    } else {
      // Đối với ảnh tối, thêm nền trắng
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
      
      // Nghịch đảo màu (chuyển màu đen thành trắng và ngược lại)
      pipeline = pipeline.negate();
    }
    
    // Tiếp tục quy trình xử lý
    await pipeline
      .grayscale()
      .resize(targetWidth, targetHeight)
      .sharpen({
        sigma: 1.0,
        flat: 1.0,
        jagged: 2.0
      })
      // Tăng độ tương phản mạnh
      .normalise({ lower: 10, upper: 90 })
      // Lưu ảnh
      .png()
      .toFile(preprocessedPath);
    
    return preprocessedPath;
  } catch (error) {
    console.error('Lỗi khi tiền xử lý ảnh chữ trắng:', error);
    return inputPath;
  }
}

// Cải tiến hàm xử lý ảnh thông minh
async function smartImagePreprocessing(inputPath) {
  try {
    const transformer = sharp(inputPath);

    // Đọc thông tin ảnh
    const metadata = await transformer.metadata();

    if (metadata.width > 3000 || metadata.height > 3000) {
      transformer.resize(Math.min(metadata.width, 3000), null, { 
        fit: 'inside', 
        withoutEnlargement: false 
      });
    }
    
    const hasAlpha = metadata.channels === 4 || metadata.hasAlpha;
    
    // Phân tích ảnh để xác định loại ảnh
    const stats = await transformer.stats();
    
    // Kiểm tra độ sáng trung bình
    const avgBrightness = stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length;
    
    // Tính toán độ tương phản trung bình
    const avgContrast = Math.max(
      Math.abs(stats.channels[0].mean - 128),
      metadata.channels > 1 ? Math.abs(stats.channels[1].mean - 128) : 0,
      metadata.channels > 2 ? Math.abs(stats.channels[2].mean - 128) : 0
    ) / 128;
    
    // Xác định loại ảnh dựa trên các chỉ số
    if (hasAlpha && avgBrightness > 200) {
      // Ảnh có kênh alpha và độ sáng cao - có thể là chữ trắng trên nền trong suốt
      console.log(`Xử lý ảnh chữ trắng trên nền trong suốt: ${inputPath}`);
      return await preprocessWhiteTextImage(inputPath, transformer);
    } else if (hasAlpha) {
      // Ảnh trong suốt thông thường
      console.log(`Xử lý ảnh không có nền: ${inputPath}`);
      return await preprocessTransparentImage(inputPath, transformer);
    } else if (avgContrast < 0.2) {
      // Ảnh có độ tương phản thấp
      console.log(`Xử lý ảnh có độ tương phản thấp: ${inputPath}`);
      return await preprocessLowContrastImage(inputPath, transformer);
    } else {
      // Ảnh thông thường
      console.log(`Xử lý ảnh thông thường: ${inputPath}`);
      return await preprocessImage(inputPath, transformer);
    }
  } catch (error) {
    console.error('Lỗi khi phân tích và tiền xử lý ảnh:', error);
    return inputPath;
  }
}

// Xử lý ảnh có độ tương phản thấp
async function preprocessLowContrastImage(inputPath, transformer) {
  try {
    const dirname = path.dirname(inputPath);
    const filename = path.basename(inputPath);
    const preprocessedPath = path.join(dirname, `preprocessed_${filename}`);
    
    await transformer
      .grayscale()
      // Tăng độ phân giải
      .resize({
        width: null,
        height: null,
        fit: 'inside',
        factor: 2.5
      })
      // Tăng độ tương phản mạnh
      .normalise({ lower: 5, upper: 95 })
      // Làm sắc nét nhiều hơn
      .sharpen({
        sigma: 1.5,
        flat: 1.0,
        jagged: 2.5
      })
      // Lưu ảnh
      .png()
      .toFile(preprocessedPath);
    
    return preprocessedPath;
  } catch (error) {
    console.error('Lỗi khi tiền xử lý ảnh độ tương phản thấp:', error);
    return inputPath;
  }
}

async function preprocessImage(inputPath, transformer) {
  try {
    const dirname = path.dirname(inputPath);
    const filename = path.basename(inputPath);
    const preprocessedPath = path.join(dirname, `preprocessed_${filename}`);
    
    console.log(`Bắt đầu tiền xử lý ảnh: ${inputPath}`);
    
    // Đọc thông tin ảnh
    const metadata = await transformer.metadata();
    console.log(`Kích thước ảnh gốc: ${metadata.width}x${metadata.height}`);
    
    // Tính toán kích thước mới (tăng độ phân giải ~3x)
    const targetWidth = Math.min(metadata.width * 3, 3000);
    const targetHeight = Math.round(targetWidth * metadata.height / metadata.width);
    
    console.log(`Điều chỉnh kích thước ảnh thành: ${targetWidth}x${targetHeight}`);
    
    // Áp dụng các bước tiền xử lý
    await transformer
      // Chuyển sang grayscale
      .grayscale()
      
      // Tăng độ phân giải
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        withoutEnlargement: false
      })
      
      // Loại bỏ nhiễu
      .median(1)
      
      // Làm sắc nét (unsharp mask)
      .sharpen({
        sigma: 1.2,   // Bán kính
        flat: 1.0,    // Hiệu ứng trên vùng phẳng
        jagged: 2.0   // Hiệu ứng trên cạnh
      })
      
      // Tăng độ tương phản
      .normalize()
      
      // Điều chỉnh ngưỡng để làm nổi bật văn bản (tùy chọn)
      .threshold(225)
      
      // Lưu ảnh đã xử lý với chất lượng cao
      .toFormat('png')
      .toFile(preprocessedPath);
    
    console.log(`Tiền xử lý ảnh hoàn thành: ${preprocessedPath}`);
    return preprocessedPath;
  } catch (error) {
    console.error('Lỗi khi tiền xử lý ảnh:', error);
    // Nếu xử lý thất bại, trả về đường dẫn ảnh gốc
    return inputPath;
  }
}

// Hàm xử lý tối ưu cho ảnh lớn
async function processLargeImage(inputPath, threshold = 1500) {
  try {
    // Lấy thông tin ảnh
    const metadata = await transformer.metadata();
    
    // Nếu ảnh không quá lớn, xử lý bình thường
    if (metadata.width < threshold && metadata.height < threshold) {
      return await preprocessImage(inputPath);
    }
    
    console.log(`Phát hiện ảnh lớn (${metadata.width}x${metadata.height}), xử lý tối ưu`);
    
    // Cho ảnh lớn, tạm thời giảm kích thước trước khi xử lý
    const tempPath = path.join(path.dirname(inputPath), `temp_${path.basename(inputPath)}`);
    
    // Giảm kích thước về mức hợp lý trước
    await transformer
      .resize(Math.min(metadata.width, 3000), null, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .toFile(tempPath);
    
    // Xử lý ảnh đã giảm kích thước
    const result = await preprocessImage(tempPath);
    
    // Xóa file tạm
    await fs.unlink(tempPath).catch(() => {});
    
    return result;
  } catch (error) {
    console.error('Lỗi khi xử lý ảnh lớn:', error);
    return inputPath;
  }
}

module.exports = {
  preprocessImage,
  preprocessTransparentImage,
  preprocessWhiteTextImage,
  preprocessLowContrastImage,
  smartImagePreprocessing,
  processLargeImage
};