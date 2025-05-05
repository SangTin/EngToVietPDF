# OCR-Translate-PDF Web Service

Dịch vụ web tích hợp OCR, dịch thuật và tạo PDF với kiến trúc microservice và hệ thống hàng đợi.

## Tổng quan hệ thống

Hệ thống OCR-Translate-PDF là một ứng dụng web cho phép người dùng tải lên hình ảnh có chứa văn bản tiếng Anh, thực hiện nhận dạng ký tự quang học (OCR), dịch văn bản sang tiếng Việt và tạo tệp PDF với nội dung đã dịch.

### Đặc điểm chính:

- Tiền xử lý hình ảnh thông minh để cải thiện kết quả OCR
- Nhận dạng văn bản tiếng Anh bằng Tesseract OCR
- Dịch văn bản từ tiếng Anh sang tiếng Việt
- Tạo file PDF với nội dung đã dịch
- Kiến trúc phân tán sử dụng RabbitMQ để xử lý bất đồng bộ
- Hệ thống cache thông minh sử dụng Redis
- Containerization với Docker và Docker Compose

## Kiến trúc hệ thống

Hệ thống được thiết kế theo mô hình microservice với các thành phần sau:

### 1. Web Server

Máy chủ Express.js cung cấp API RESTful:
- Xử lý tải lên file ảnh
- Quản lý phiên làm việc người dùng
- Theo dõi trạng thái job
- Cung cấp API để tải xuống PDF

### 2. Worker Services

Hệ thống chia quá trình xử lý thành các worker riêng biệt:

- **Preprocess Worker**: Tiền xử lý hình ảnh để tối ưu cho OCR
- **OCR Worker**: Trích xuất văn bản từ hình ảnh
- **Translate Worker**: Dịch văn bản từ tiếng Anh sang tiếng Việt
- **PDF Worker**: Tạo file PDF từ văn bản đã dịch

### 3. Hệ thống Queue

RabbitMQ được sử dụng làm hệ thống hàng đợi để phân phối công việc giữa các worker:
- `preprocess_queue`: Hàng đợi tiền xử lý hình ảnh
- `ocr_queue`: Hàng đợi xử lý OCR
- `translate_queue`: Hàng đợi dịch thuật
- `pdf_queue`: Hàng đợi tạo PDF

### 4. Caching

Redis được sử dụng làm hệ thống cache:
- Cache kết quả tiền xử lý
- Cache kết quả OCR
- Cache kết quả dịch
- Cache vị trí file PDF
- Lưu trữ thông tin phiên và job
- Ưu tiên cache thông minh (LOW, MEDIUM, HIGH)

### 5. Monitoring

Hệ thống tích hợp theo dõi hiệu suất:
- Đo thời gian xử lý từng giai đoạn
- Ghi nhận tỷ lệ cache hit/miss
- Tạo báo cáo hiệu suất

## Quy trình xử lý

1. **Tiếp nhận yêu cầu**:
   - Người dùng tải lên một hoặc nhiều hình ảnh
   - Server kiểm tra tính hợp lệ của file
   - Server tạo job mới cho mỗi ảnh và lưu vào phiên làm việc
   - Server gửi job đến `preprocess_queue`

2. **Tiền xử lý hình ảnh** (Preprocess Worker):
   - Nhận job từ hàng đợi
   - Kiểm tra cache
   - Phân tích loại ảnh (trong suốt, độ tương phản thấp, v.v.)
   - Áp dụng thuật toán xử lý phù hợp (tăng độ tương phản, tăng độ phân giải, v.v.)
   - Lưu kết quả vào cache
   - Gửi đến `ocr_queue`

3. **OCR** (OCR Worker):
   - Nhận job từ hàng đợi
   - Kiểm tra cache
   - Thực hiện OCR với Tesseract
   - Lưu kết quả vào cache
   - Gửi đến `translate_queue`

4. **Dịch thuật** (Translate Worker):
   - Nhận job từ hàng đợi
   - Kiểm tra cache
   - Dịch văn bản từ tiếng Anh sang tiếng Việt
   - Lưu kết quả vào cache
   - Gửi đến `pdf_queue`

5. **Tạo PDF** (PDF Worker):
   - Nhận job từ hàng đợi
   - Kiểm tra cache
   - Tạo file PDF với nội dung đã dịch
   - Lưu đường dẫn vào cache
   - Đánh dấu job hoàn thành

6. **Hoàn thành**:
   - Người dùng có thể xem trạng thái job qua API
   - Người dùng tải xuống kết quả PDF khi hoàn thành

## Các tính năng đặc biệt

### Tiền xử lý hình ảnh thông minh

Hệ thống phân tích đặc điểm của từng hình ảnh và áp dụng các thuật toán xử lý phù hợp:
- Xử lý ảnh trong suốt
- Xử lý ảnh có chữ trắng trên nền trong suốt
- Xử lý ảnh có độ tương phản thấp
- Tăng độ phân giải cho ảnh nhỏ
- Giảm kích thước cho ảnh lớn

### Hệ thống Cache thông minh

- Cache theo độ ưu tiên (LOW, MEDIUM, HIGH)
- Cache theo loại nội dung (preprocess, ocr, translate, pdf)
- Tránh xử lý lặp cho văn bản giống nhau
- Cache toàn quy trình: khi gặp hình ảnh đã xử lý trước đó, hệ thống có thể bỏ qua các bước OCR và dịch

### Xử lý đồng thời

- Xử lý nhiều hình ảnh cùng lúc
- Hạn chế số lượng worker đồng thời bằng semaphore
- Phân bổ tài nguyên hợp lý (CPU, memory) cho từng loại worker

### Quản lý phiên người dùng

- Lưu lịch sử xử lý của người dùng
- Cho phép đặt tên job
- Lưu cài đặt người dùng

### Xử lý lỗi

- Thử lại tự động khi xử lý thất bại
- Đưa tin nhắn trở lại hàng đợi nếu xử lý không thành công
- Thông báo lỗi chi tiết cho người dùng

## Cài đặt và Triển khai

### Yêu cầu

- Docker và Docker Compose
- Node.js (phát triển)
- Redis
- RabbitMQ
- Tesseract OCR

### Cài đặt với Docker

```bash
# Clone repository
git clone https://github.com/SangTin/EngToVietPDF.git
cd EngToVietPDF

# Khởi động các container
docker-compose up -d
```

### Cài đặt thủ công

```bash
# Clone repository
git clone https://github.com/SangTin/EngToVietPDF.git
cd EngToVietPDF

# Cài đặt dependencies
npm install

# Khởi động server và các worker
npm run start-all
```

### Khởi động từng worker riêng biệt

```bash
npm run preprocess-worker
npm run ocr-worker
npm run translate-worker
npm run pdf-worker
```

## API Endpoints

### Xử lý ảnh

```
POST /api/process-images
```
- Tải lên và xử lý một hoặc nhiều ảnh
- Nhận danh sách jobId để theo dõi tiến trình

### Theo dõi tiến trình

```
GET /api/job/:jobId
```
- Lấy thông tin về trạng thái của job

### Tải xuống PDF

```
GET /api/download/:jobId
```
- Tải xuống file PDF kết quả

### Lịch sử xử lý

```
GET /api/user/history
```
- Lấy lịch sử xử lý của người dùng

### Quản lý cache

```
POST /api/clear-cache
```
- Xóa tất cả cache

```
POST /api/clear-cache/:type
```
- Xóa cache theo loại (preprocess, ocr, translate, pdf)

### Theo dõi hiệu suất

```
GET /api/performance-report
```
- Tạo báo cáo hiệu suất dưới dạng JSON

```
GET /api/performance-report/html
```
- Tạo báo cáo hiệu suất dưới dạng HTML

```
GET /api/performance-report/pdf
```
- Tạo báo cáo hiệu suất dưới dạng PDF

## Cấu trúc thư mục

```
EngToVietPDF/
│
├── public/                # Tài nguyên static
├── uploads/               # Thư mục lưu file tải lên
├── output/                # Thư mục lưu file PDF output
├── reports/               # Thư mục lưu báo cáo hiệu suất
│
├── utils/                 # Các tiện ích
│   ├── auth.js            # Quản lý phiên người dùng
│   ├── cache.js           # Hệ thống cache
│   ├── image-processor.js # Xử lý hình ảnh
│   ├── job-manager.js     # Quản lý job
│   ├── monitoring.js      # Theo dõi hiệu suất
│   ├── ocr.js             # Xử lý OCR
│   ├── pdf.js             # Tạo PDF
│   ├── queue.js           # Giao tiếp với RabbitMQ
│   └── translate.js       # Dịch thuật
│
├── workers/               # Các worker
│   ├── preprocess-worker.js  # Worker tiền xử lý
│   ├── ocr-worker.js         # Worker OCR
│   ├── translate-worker.js    # Worker dịch thuật
│   └── pdf-worker.js         # Worker tạo PDF
│
├── server.js              # Máy chủ Express
├── wait-for-rabbitmq.js   # Script chờ RabbitMQ
├── benchmark.js           # Script kiểm tra hiệu suất
├── Dockerfile             # Cấu hình Docker
├── docker-compose.yml     # Cấu hình Docker Compose
├── package.json           # Thông tin package
└── README.md              # Tài liệu
```