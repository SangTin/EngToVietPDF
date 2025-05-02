document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileProcessingList = document.getElementById('fileProcessingList');
    const totalFiles = document.getElementById('totalFiles');
    const totalSize = document.getElementById('totalSize');
    const uploadButton = document.getElementById('uploadButton');
    const currentFiles = [];

    // Elements for session management
    const sessionInfo = document.getElementById('sessionInfo');
    const sessionId = document.getElementById('sessionId');
    const recentJobsList = document.getElementById('recentJobsList');
    const refreshRecentBtn = document.getElementById('refreshRecentBtn');

    // Load session info
    loadSessionInfo();

    // Load recent jobs
    loadRecentJobs();

    // Add refresh event
    refreshRecentBtn.addEventListener('click', loadRecentJobs);

    // Load session information
    async function loadSessionInfo() {
        try {
            // Get session info from server
            const response = await fetch('/api/user/settings', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Không thể tải thông tin phiên');
            }

            const data = await response.json();

            // Get session ID from cookie
            const sessionIdValue = getCookie('sessionId');

            if (sessionIdValue) {
                // Display truncated session ID
                const shortSessionId = sessionIdValue.substring(0, 8) + '...';
                sessionId.textContent = shortSessionId;

                // Update session info text
                const date = new Date();
                sessionInfo.innerHTML = `Phiên hoạt động từ ${date.getHours()}:${(date.getMinutes() < 10 ? '0' : '') + date.getMinutes()}`;
            } else {
                sessionInfo.textContent = 'Phiên mới';
                sessionId.textContent = 'Mới';
            }
        } catch (error) {
            console.error('Lỗi tải thông tin phiên:', error);
            sessionInfo.textContent = 'Không thể tải thông tin phiên';
        }
    }

    // Load recent jobs
    async function loadRecentJobs() {
        try {
            // Show loading state
            recentJobsList.innerHTML = `
                <div class="animate-pulse space-y-3">
                    <div class="flex space-x-4">
                        <div class="flex-1 space-y-2 py-1">
                            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div class="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                    </div>
                    <div class="flex space-x-4">
                        <div class="flex-1 space-y-2 py-1">
                            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div class="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                    </div>
                </div>
            `;

            // Get recent jobs from server
            const response = await fetch('/api/user/history', {
                method: 'GET',
                credentials: 'include' // Important to send cookies
            });

            if (!response.ok) {
                throw new Error('Không thể tải lịch sử');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Không thể tải lịch sử');
            }

            // Process jobs data
            if (!data.history || data.history.length === 0) {
                recentJobsList.innerHTML = `
                    <div class="text-center py-6 text-gray-500">
                        <i class="fas fa-inbox text-3xl mb-2"></i>
                        <p>Chưa có file nào được xử lý</p>
                    </div>
                `;
                return;
            }

            // Sort by most recent first
            const sortedJobs = data.history.sort((a, b) => b.createdAt - a.createdAt);

            // Limit to 5 most recent
            const recentJobs = sortedJobs.slice(0, 5);

            // Create HTML
            let jobsHTML = '';

            recentJobs.forEach(job => {
                const jobInfo = job.info || {};
                const status = jobInfo.status || 'pending';
                const jobName = job.name || `File ${job.jobId.substring(0, 8)}`;

                let statusBadge = '';
                let statusClass = '';

                switch (status) {
                    case 'completed':
                        statusBadge = '<span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Hoàn thành</span>';
                        statusClass = 'completed';
                        break;
                    case 'processing':
                        statusBadge = '<span class="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">Đang xử lý</span>';
                        statusClass = 'processing';
                        break;
                    case 'error':
                        statusBadge = '<span class="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Lỗi</span>';
                        statusClass = 'error';
                        break;
                    default:
                        statusBadge = '<span class="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">Chờ xử lý</span>';
                }

                jobsHTML += `
                    <div class="recent-job ${statusClass} bg-white p-3 rounded-lg shadow-sm">
                        <div class="flex justify-between items-center">
                            <div class="truncate max-w-xs">
                                <p class="font-medium text-gray-700 truncate">${jobName}</p>
                                <p class="text-xs text-gray-500">${formatTimestamp(job.createdAt)}</p>
                            </div>
                            ${statusBadge}
                        </div>
                        ${status === 'completed' ? `
                            <div class="mt-2">
                                <a href="/api/download/${job.jobId}" class="text-blue-500 hover:text-blue-700 text-sm flex items-center" title="Tải xuống">
                                    <i class="fas fa-download mr-1"></i> Tải PDF
                                </a>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            // Add view all button
            jobsHTML += `
                <div class="text-center mt-4">
                    <a href="/history.html" class="text-blue-500 hover:text-blue-700 text-sm">
                        Xem tất cả <i class="fas fa-arrow-right ml-1"></i>
                    </a>
                </div>
            `;

            recentJobsList.innerHTML = jobsHTML;
        } catch (error) {
            console.error('Lỗi tải lịch sử:', error);
            recentJobsList.innerHTML = `
                <div class="text-center py-4 text-red-500">
                    <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                    <p>Không thể tải lịch sử: ${error.message}</p>
                </div>
            `;
        }
    }

    // Helper function to format timestamp
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${(date.getMinutes() < 10 ? '0' : '') + date.getMinutes()}`;
    }

    // Helper function to get cookie value
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    // Handle click on upload area
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle dropped files
    uploadArea.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFiles, false);

    // Handle paste event
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        const files = Array.from(items).filter(item => item.kind === 'file').map(item => item.getAsFile());
        handleFiles(files);
    }, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        uploadArea.classList.add('drag-over');
    }

    function unhighlight() {
        uploadArea.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        // Normalize files input (support both event and FileList)
        files = files.target ? files.target.files : files;

        // Validate files first
        const validFiles = validateFiles(files);

        // If no valid files, don't do anything further
        if (validFiles.length === 0) {
            return;
        }

        // Get existing files - need to convert to real array to keep reference
        let startIdx = currentFiles.length;
        let totalFileSize = getTotalSize(currentFiles);

        // Add new files and create UI elements
        validFiles.forEach((file, i) => {
            const newIndex = startIdx + i;
            currentFiles.push(file);
            totalFileSize += file.size;

            const fileItem = createFileItem(file, newIndex);
            fileProcessingList.appendChild(fileItem);
        });

        // Update file count and size
        const totalFilesCount = currentFiles.length;
        totalFiles.textContent = `${totalFilesCount} tệp`;
        totalSize.textContent = formatFileSize(totalFileSize);

        // Enable upload button
        updateUploadButtonState();
    }

    function getTotalSize(files) {
        return Array.from(files).reduce((total, file) => total + file.size, 0);
    }

    function createFileItem(file, index) {
        const fileId = `file-${Date.now()}-${index}`;
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item flex flex-wrap items-center bg-gray-100 p-3 rounded-lg';
        fileItem.id = fileId;
        fileItem.dataset.index = index;
        fileItem.dataset.filename = file.name;
        fileItem.title = file.name;
        fileItem.dataset.processed = 'false';
        fileItem.dataset.processing = 'false';

        // Determine icon based on file type
        const fileTypeIcon = getFileTypeIcon(file.type);

        fileItem.innerHTML = `
            <div class="mr-4 text-2xl text-gray-500">${fileTypeIcon}</div>
            <div class="flex-grow flex items-center">
                <div class="flex-grow">
                    <p class="font-semibold text-sm filename">${file.name}</p>
                    <p class="text-xs text-gray-500">${formatFileSize(file.size)}</p>
                </div>
                <!-- Status and download area - initially hidden -->
                <div class="status-area hidden flex items-center mr-4 flex-1 justify-end">
                    <div class="w-40 bg-gray-200 rounded-full h-2.5 mr-4">
                        <div class="bg-blue-600 h-2.5 rounded-full progress-bar" style="width: 0%"></div>
                    </div>
                    <div class="flex items-center w-24">
                        <span class="text-xs text-gray-600 whitespace-nowrap job-status flex-grow">Đang chờ</span>
                        <button class="btn btn-sm btn-outline-primary preview-btn ml-2 hidden text-blue-500 hover:text-blue-800" title="Xem trước">
                            <i class="fas fa-eye"></i>
                        </button>
                        <a href="#" class="download-link text-green-600 hover:text-green-800 ml-2 hidden" title="Tải xuống">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>
                </div>
            </div>
            <button class="text-red-500 hover:text-red-700 remove-btn ml-2">
                <i class="fas fa-trash"></i>
            </button>
        `;

        // Add event listener for remove button
        fileItem.querySelector('.remove-btn').addEventListener('click', () => {
            removeFile(fileId);
        });

        return fileItem;
    }

    function getFileTypeIcon(fileType) {
        if (fileType.startsWith('image/')) return '<i class="fas fa-image"></i>';
        if (fileType === 'application/pdf') return '<i class="fas fa-file-pdf"></i>';
        return '<i class="fas fa-file"></i>';
    }

    function removeFile(fileId) {
        const itemToRemove = document.getElementById(fileId);
        const fileIndex = parseInt(itemToRemove.dataset.index);

        // Check if file is currently processing
        if (itemToRemove && itemToRemove.dataset.processing === 'true') {
            alert('Không thể xóa tệp đang xử lý!');
            return;
        }

        // Remove the specific file at the given index
        currentFiles.splice(fileIndex, 1);

        // Remove the item from the DOM
        if (itemToRemove) {
            fileProcessingList.removeChild(itemToRemove);
        }

        // If no files left, reset everything
        if (currentFiles.length === 0) {
            fileInput.value = ''; // Clear the input
            totalFiles.textContent = '0 tệp';
            totalSize.textContent = '0 KB';
            uploadButton.disabled = true;
            uploadButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Chuyển đổi';
            fileProcessingList.innerHTML = ''; // Clear the list
            return;
        }

        // Create a new DataTransfer object and add remaining files
        const dt = new DataTransfer();
        let size = 0;

        // Get all remaining file items and sort them by their current index
        const remainingItems = Array.from(fileProcessingList.querySelectorAll('.file-item'))
            .sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index));

        remainingItems.forEach((item, i) => {
            const file = currentFiles[i];

            if (file) {
                item.dataset.index = i;
                size += file.size;
                dt.items.add(file);
            }
        });

        // Update file count and size
        totalFiles.textContent = `${currentFiles.length} tệp`;
        totalSize.textContent = formatFileSize(size);

        // Update upload button state
        updateUploadButtonState();
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Upload functionality
    uploadButton.addEventListener('click', uploadFiles);

    function showInvalidFilesModal(invalidFiles) {
        // Tạo modal hiển thị file không hợp lệ
        const errorModal = document.createElement('div');
        errorModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';

        errorModal.innerHTML = `
            <div class="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
                <div class="flex items-center mb-4 text-red-600">
                    <i class="fas fa-exclamation-triangle mr-3 text-2xl"></i>
                    <h2 class="text-xl font-bold">File không hợp lệ</h2>
                </div>
                <div class="max-h-64 overflow-y-auto">
                    <p class="text-gray-600 mb-4">
                        ${invalidFiles.length > 1
                ? `${invalidFiles.length} file sau không được xử lý do không phải là định dạng hình ảnh hợp lệ:`
                : 'File sau không được xử lý do không phải là định dạng hình ảnh hợp lệ:'}
                    </p>
                    <ul class="space-y-2">
                        ${invalidFiles.map(file => `
                            <li class="flex justify-between items-center bg-red-50 p-3 rounded-lg">
                                <span class="font-medium truncate mr-3">${file.name}</span>
                                <span class="text-red-600 text-sm whitespace-nowrap">${file.reason}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <div class="mt-6 flex justify-end">
                    <button class="bg-gradient-to-r from-red-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:opacity-90 transition">
                        Đóng
                    </button>
                </div>
            </div>
        `;

        // Thêm vào body
        document.body.appendChild(errorModal);

        // Xử lý đóng modal
        const closeButton = errorModal.querySelector('button');
        closeButton.addEventListener('click', () => {
            document.body.removeChild(errorModal);
        });

        // Đóng khi click bên ngoài
        errorModal.addEventListener('click', (e) => {
            if (e.target === errorModal) {
                document.body.removeChild(errorModal);
            }
        });
    }

    async function uploadFiles() {
        fileInput.value = ''; // Clear the input to allow re-uploading the same file

        const fileItemsToProcess = Array.from(
            fileProcessingList.querySelectorAll('.file-item')
        ).filter(item =>
            item.dataset.processed === 'false' &&
            item.dataset.processing !== 'true'
        );

        if (fileItemsToProcess.length > 10) {
            alert('Chỉ có thể xử lý tối đa 10 tệp cùng một lúc!');
            return;
        }

        if (fileItemsToProcess.length === 0) {
            alert('Không có tệp nào cần xử lý!');
            return;
        }

        // Update UI to processing state
        uploadButton.disabled = true;
        uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý';

        // Show progress sections for files being processed
        fileItemsToProcess.forEach(item => {
            const statusArea = item.querySelector('.status-area');
            if (statusArea) {
                statusArea.classList.remove('hidden');
            }
            item.dataset.processing = 'true';
        });

        const formData = new FormData();
        fileItemsToProcess.forEach((fileItem, i) => {
            const fileIndex = parseInt(fileItem.dataset.index);
            const file = currentFiles[fileIndex];

            formData.append(`images`, file);
            formData.append('indexes[]', fileIndex);
        });

        try {
            const response = await fetch('/api/process-images', {
                method: 'POST',
                body: formData,
                credentials: 'include' // Thêm credentials để gửi cookie
            });

            const data = await response.json();

            if (data.invalidFiles && data.invalidFiles.length > 0) {
                invalidFiles = data.invalidFiles.map(file => ({
                    name: currentFiles[file.index]?.name,
                    reason: file.reason
                }));
                console.log('Invalid files:', invalidFiles);

                showInvalidFilesModal(invalidFiles);

                // Đánh dấu các file không hợp lệ trong giao diện
                fileItemsToProcess.forEach(item => {
                    if (data.invalidFiles.some(file => file.index == item.dataset.index)) {
                        item.dataset.processed = 'failed';
                        item.dataset.processing = 'false';
                        const statusArea = item.querySelector('.status-area');
                        if (statusArea) {
                            statusArea.classList.remove('hidden');
                            const statusEl = statusArea.querySelector('.job-status');
                            const progressBar = statusArea.querySelector('.progress-bar');
                            if (statusEl) {
                                statusEl.textContent = 'File không hợp lệ';
                                statusEl.classList.add('text-red-600');
                            }
                            if (progressBar) {
                                progressBar.classList.remove('bg-blue-600');
                                progressBar.classList.add('bg-red-600');
                                progressBar.style.width = '100%';
                            }
                        }
                    }
                });
            }

            if (!data.success) {
                throw new Error(data.message || 'Lỗi tải lên');
            }

            // Monitor job status for each file
            data.jobs.forEach((jobInfo, index) => {
                // Find the corresponding file item that matches this job's index
                const fileItemIndex = fileItemsToProcess.findIndex(item =>
                    item.dataset.index == jobInfo.index &&
                    (!data.invalidFiles ||
                        !data.invalidFiles.some(file => file.index == item.dataset.index))
                );

                if (fileItemIndex !== -1) {
                    const fileItem = fileItemsToProcess[fileItemIndex];
                    fileItem.dataset.jobId = jobInfo.jobId;
                    monitorJobStatus(jobInfo.jobId, fileItem);

                    // Remove the processed item from the array to avoid processing it again
                    fileItemsToProcess.splice(fileItemIndex, 1);
                }
            });

            // Reset UI after upload
            uploadButton.innerHTML = '<i class="fas fa-check mr-2"></i>Đã tải lên';

            // Update upload button state
            setTimeout(() => {
                uploadButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Chuyển đổi';
                updateUploadButtonState();
            }, 3000);

            // Refresh recent jobs after upload
            setTimeout(() => {
                loadRecentJobs();
            }, 3000);

        } catch (error) {
            console.error('Lỗi:', error);
            alert('Đã có lỗi xảy ra: ' + error.message);

            // Reset UI and mark files as not processed
            fileItemsToProcess.forEach(item => {
                if (item.dataset.processed !== 'failed') {
                    item.dataset.processing = 'false';
                    const statusArea = item.querySelector('.status-area');
                    if (statusArea) {
                        statusArea.classList.add('hidden');
                    }
                }
            });

            uploadButton.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Chuyển đổi';
            updateUploadButtonState();
        }
    }

    function updateUploadButtonState() {
        // Check if there are any unprocessed files
        const unprocessedFiles = Array.from(
            fileProcessingList.querySelectorAll('.file-item')
        ).filter(item =>
            item.dataset.processed === 'false' &&
            item.dataset.processing !== 'true'
        );

        const hasUnprocessedFiles = unprocessedFiles.length > 0;

        // Enable/disable button
        uploadButton.disabled = !hasUnprocessedFiles;

        // Update button text to show count
        if (hasUnprocessedFiles) {
            uploadButton.innerHTML = `<i class="fas fa-paper-plane mr-2"></i>Chuyển đổi (${unprocessedFiles.length})`;
        } else {
            uploadButton.innerHTML = `<i class="fas fa-paper-plane mr-2"></i>Chuyển đổi`;
        }

        return hasUnprocessedFiles;
    }

    async function monitorJobStatus(jobId, fileItem) {
        if (!fileItem) return;

        const statusEl = fileItem.querySelector('.job-status');
        const progressBar = fileItem.querySelector('.progress-bar');
        const downloadLink = fileItem.querySelector('.download-link');
        const previewBtn = fileItem.querySelector('.preview-btn');

        const steps = ['preprocess', 'ocr', 'translate', 'pdf'];

        try {
            while (true) {
                const response = await fetch(`/api/job/${jobId}`, {
                    credentials: 'include' // Thêm credentials để gửi cookie
                });

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.message || 'Lỗi lấy trạng thái');
                }

                const job = data.job;

                // Update status and progress bar
                const currentStepIndex = steps.indexOf(job.currentStep || '');
                const progress = currentStepIndex >= 0 ?
                    ((currentStepIndex + 1) / steps.length * 100) : 0;

                progressBar.style.width = `${progress}%`;

                // Update status text
                statusEl.textContent = getStatusText(job.status, job.currentStep);

                // If job is completed
                if (job.status === 'completed') {
                    progressBar.style.width = '100%';
                    progressBar.classList.remove('bg-blue-600');
                    progressBar.classList.add('bg-green-600');

                    // Display download link and preview button
                    if (job.result && job.result.pdf) {
                        downloadLink.href = `/api/download/${jobId}`;
                        downloadLink.classList.remove('hidden');

                        previewBtn.classList.remove('hidden');
                        previewBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // Show preview popup
                            if (window.historyPreviewManager) {
                                window.historyPreviewManager.showPopup(jobId);
                            }
                        });
                    }

                    // Mark file as completely processed
                    fileItem.dataset.processing = 'false';
                    fileItem.dataset.processed = 'true';

                    loadRecentJobs();

                    // Update upload button state - might be other files waiting
                    updateUploadButtonState();
                    break;
                }

                // If job failed
                if (job.status === 'error') {
                    progressBar.classList.remove('bg-blue-600');
                    progressBar.classList.add('bg-red-600');
                    statusEl.textContent = `Lỗi: ${job.message || 'Xử lý thất bại'}`;

                    // Mark file as not processed so it can be retried
                    fileItem.dataset.processing = 'false';
                    fileItem.dataset.processed = 'false';

                    // Update upload button state
                    updateUploadButtonState();
                    break;
                }

                // Wait 1 second before checking again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Lỗi theo dõi job:', error);
            statusEl.textContent = `Lỗi: ${error.message}`;
            progressBar.classList.remove('bg-blue-600');
            progressBar.classList.add('bg-red-600');

            // Mark file as not processed so it can be retried
            fileItem.dataset.processing = 'false';
            fileItem.dataset.processed = 'false';

            // Update upload button state
            updateUploadButtonState();
        }
    }

    function getStatusText(status, currentStep) {
        const statusMap = {
            'pending': 'Đang chờ xử lý',
            'processing': getProcessingStepText(currentStep),
            'completed': 'Hoàn thành',
            'error': 'Lỗi'
        };

        return statusMap[status] || status;
    }

    function getProcessingStepText(step) {
        const stepMap = {
            'preprocess': 'Tiền xử lý ảnh',
            'ocr': 'Nhận dạng chữ',
            'translate': 'Dịch thuật',
            'pdf': 'Tạo PDF'
        };

        return stepMap[step] || 'Đang xử lý';
    }

    // File validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = [
        'image/jpeg',
        'image/png',
        'image/jpg',
    ];

    function validateFiles(files) {
        const invalidFiles = [];

        // Validate each file
        const validFiles = Array.from(files).filter(file => {
            // Check file type
            if (!ALLOWED_TYPES.includes(file.type)) {
                invalidFiles.push({
                    name: file.name,
                    reason: 'Định dạng không được hỗ trợ'
                });
                return false;
            }

            // Check file size
            if (file.size > MAX_FILE_SIZE) {
                invalidFiles.push({
                    name: file.name,
                    reason: 'Kích thước vượt quá 10MB'
                });
                return false;
            }

            return true;
        });

        // Show error notification for invalid files
        if (invalidFiles.length > 0) {
            showFileValidationErrors(invalidFiles);
        }

        return validFiles;
    }

    function showFileValidationErrors(invalidFiles) {
        // Create error modal
        const errorModal = document.createElement('div');
        errorModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';

        errorModal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full">
                <div class="flex items-center mb-4 text-red-600">
                    <i class="fas fa-exclamation-triangle mr-3 text-2xl"></i>
                    <h2 class="text-xl font-bold">Lỗi Tải Tệp</h2>
                </div>
                <div class="max-h-64 overflow-y-auto">
                    <ul class="space-y-2">
                        ${invalidFiles.map(file => `
                            <li class="grid grid-cols-10 gap-2 bg-red-50 p-2 rounded items-center">
                                <span class="font-medium truncate col-span-7" title="${file.name}">${file.name}</span>
                                <span class="text-red-600 text-sm text-right col-span-3">${file.reason}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <div class="mt-4 flex justify-end">
                    <button class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
                        Đóng
                    </button>
                </div>
            </div>
        `;

        // Add close functionality
        const closeButton = errorModal.querySelector('button');
        closeButton.addEventListener('click', () => {
            document.body.removeChild(errorModal);
        });

        // Add to body
        document.body.appendChild(errorModal);
    }

    // Global error handling
    window.addEventListener('error', function (event) {
        console.error('Unhandled error:', event.error);

        // Create error notification
        const errorNotification = document.createElement('div');
        errorNotification.className = 'fixed top-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50';
        errorNotification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-exclamation-triangle mr-3"></i>
                <span>Đã xảy ra lỗi không mong muốn</span>
            </div>
            <button class="mt-2 text-sm underline">Chi tiết</button>
        `;

        const detailButton = errorNotification.querySelector('button');
        detailButton.addEventListener('click', () => {
            alert(event.error.stack || 'Không có thông tin chi tiết');
        });

        document.body.appendChild(errorNotification);

        // Remove notification after 5 seconds
        setTimeout(() => {
            if (document.body.contains(errorNotification)) {
                document.body.removeChild(errorNotification);
            }
        }, 5000);
    });
});