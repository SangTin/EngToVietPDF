document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const progressContainer = document.querySelector('.progress-container');
    const resultContainer = document.querySelector('.result-container');
    const uploadContainer = document.querySelector('.upload-container');
    const statusMessage = document.getElementById('statusMessage');
    const progressBar = document.querySelector('.progress-bar');
    const ocrText = document.getElementById('ocrText');
    const translatedText = document.getElementById('translatedText');
    const downloadBtn = document.getElementById('downloadBtn');
    const newProcessBtn = document.getElementById('newProcessBtn');

    let currentJobId = null;
    let pollingInterval = null;

    // Xử lý form upload
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(uploadForm);
        const imageFile = formData.get('image');

        if (!imageFile || !imageFile.size) {
            alert('Vui lòng chọn một file ảnh!');
            return;
        }

        try {
            // Hiển thị phần tiến trình và ẩn form upload
            uploadContainer.style.display = 'none';
            progressContainer.style.display = 'block';
            progressBar.style.width = '10%';
            statusMessage.textContent = 'Đang tải ảnh lên...';

            // Gửi file đến server
            const response = await fetch('/api/process-image', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Lỗi xử lý ảnh');
            }

            // Lưu jobId để theo dõi tiến trình
            currentJobId = data.jobId;

            // Cập nhật trạng thái
            progressBar.style.width = '25%';
            statusMessage.textContent = 'Đang OCR ảnh...';

            // Bắt đầu polling để kiểm tra trạng thái job
            startPolling();

        } catch (error) {
            console.error('Lỗi:', error);
            alert(`Lỗi: ${error.message}`);
            resetUI();
        }
    });

    // Bắt đầu kiểm tra trạng thái job định kỳ
    function startPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }

        pollingInterval = setInterval(checkJobStatus, 2000); // Kiểm tra mỗi 2 giây
    }

    // Kiểm tra trạng thái job
    async function checkJobStatus() {
        if (!currentJobId) return;

        try {
            const response = await fetch(`/api/job/${currentJobId}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Lỗi kiểm tra trạng thái');
            }

            const { job } = data;

            // Cập nhật UI dựa trên trạng thái job
            updateProgressUI(job);

            // Nếu job hoàn thành, hiển thị kết quả và dừng polling
            if (job.status === 'completed') {
                displayResults(job);
                stopPolling();
            }
            // Nếu job bị lỗi, hiển thị thông báo và dừng polling
            else if (job.status === 'error') {
                throw new Error(job.message || 'Có lỗi xảy ra trong quá trình xử lý');
            }
        } catch (error) {
            console.error('Lỗi kiểm tra trạng thái:', error);
            alert(`Lỗi: ${error.message}`);
            resetUI();
            stopPolling();
        }
    }

    // Cập nhật giao diện tiến trình
    function updateProgressUI(job) {
        // Cập nhật thanh tiến trình dựa trên trạng thái
        if (job.result) {
            if (job.result.ocr && !job.result.translate) {
                progressBar.style.width = '50%';
                statusMessage.textContent = 'Đang dịch văn bản...';
            } else if (job.result.ocr && job.result.translate && !job.result.pdf) {
                progressBar.style.width = '75%';
                statusMessage.textContent = 'Đang tạo file PDF...';
            }
        }
    }

    // Hiển thị kết quả khi job hoàn thành
    function displayResults(job) {
        // Hiển thị container kết quả và ẩn container tiến trình
        progressContainer.style.display = 'none';
        resultContainer.style.display = 'block';

        // Hiển thị văn bản OCR và văn bản đã dịch
        if (job.result) {
            ocrText.textContent = job.result.ocr || 'Không có dữ liệu';
            translatedText.textContent = job.result.translate || 'Không có dữ liệu';

            // Cập nhật URL tải xuống PDF
            downloadBtn.href = `/api/download/${currentJobId}`;
        }
    }

    // Dừng polling
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Reset giao diện về trạng thái ban đầu
    function resetUI() {
        uploadContainer.style.display = 'block';
        progressContainer.style.display = 'none';
        resultContainer.style.display = 'none';
        uploadForm.reset();
        currentJobId = null;
    }

    // Xử lý nút "Xử lý ảnh mới"
    newProcessBtn.addEventListener('click', () => {
        resetUI();
    });
});