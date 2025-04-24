# Sử dụng image cơ sở NVIDIA CUDA
FROM nvidia/cuda:12.0.1-devel-ubuntu22.04

# Tránh các câu hỏi tương tác trong quá trình cài đặt
ENV DEBIAN_FRONTEND=noninteractive

# Cài đặt Node.js và npm
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt các gói phụ thuộc cho Tesseract và OpenCL
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    libleptonica-dev \
    pkg-config \
    libpng-dev \
    libjpeg-dev \
    libtiff-dev \
    zlib1g-dev \
    ocl-icd-opencl-dev \
    ocl-icd-libopencl1 \
    clinfo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Thiết lập biến môi trường để Tesseract sử dụng GPU qua OpenCL
ENV TESSERACT_OPENCL=1

# Thư mục làm việc
WORKDIR /app

# Sao chép package.json và package-lock.json
COPY package*.json ./

# Cài đặt các gói npm
RUN npm install

# Sao chép toàn bộ mã nguồn
COPY . .

# Tạo các thư mục cần thiết
RUN mkdir -p uploads output cache reports

# Mở cổng 3000
EXPOSE 3000

# Lệnh khởi động ứng dụng
CMD ["npm", "start"]