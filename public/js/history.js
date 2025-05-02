// Global variables
let allJobs = [];
let filteredJobs = [];
let currentFilter = 'all';
let currentPage = 1;
const itemsPerPage = 10;
const renameModal = document.getElementById('renameModal');

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Load session info
    loadSessionInfo();

    // Load job history
    loadJobHistory();

    // Add filter events
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            filterJobs();
        });
    });

    // Add search input event
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        filterJobs();
    });

    // Set up rename modal events
    document.getElementById('closeRenameModal').addEventListener('click', closeRenameModal);
    document.getElementById('cancelRename').addEventListener('click', closeRenameModal);
    document.getElementById('saveRename').addEventListener('click', saveJobRename);
});

// Load session information
async function loadSessionInfo() {
    try {
        // Get session info from server
        const response = await fetch('/api/user/settings', {
            method: 'GET',
            credentials: 'include' // Important to send cookies
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
            document.getElementById('sessionId').textContent = shortSessionId;

            // Update session info text
            const date = new Date();
            document.getElementById('sessionInfo').innerHTML = `Phiên hoạt động từ ${date.getHours()}:${(date.getMinutes() < 10 ? '0' : '') + date.getMinutes()}`;
        } else {
            document.getElementById('sessionInfo').textContent = 'Phiên mới';
            document.getElementById('sessionId').textContent = 'Mới';
        }
    } catch (error) {
        console.error('Lỗi tải thông tin phiên:', error);
        document.getElementById('sessionInfo').textContent = 'Không thể tải thông tin phiên';
    }
}

// Load job history
async function loadJobHistory() {
    try {
        // Show loading state
        document.getElementById('historyList').innerHTML = `
            <div class="animate-pulse space-y-4">
                <div class="bg-gray-100 rounded-lg p-4">
                    <div class="flex justify-between">
                        <div class="w-1/3 h-5 bg-gray-200 rounded"></div>
                        <div class="w-1/5 h-5 bg-gray-200 rounded"></div>
                    </div>
                    <div class="w-1/4 h-4 bg-gray-200 rounded mt-2"></div>
                </div>
                <div class="bg-gray-100 rounded-lg p-4">
                    <div class="flex justify-between">
                        <div class="w-1/3 h-5 bg-gray-200 rounded"></div>
                        <div class="w-1/5 h-5 bg-gray-200 rounded"></div>
                    </div>
                    <div class="w-1/4 h-4 bg-gray-200 rounded mt-2"></div>
                </div>
                <div class="bg-gray-100 rounded-lg p-4">
                    <div class="flex justify-between">
                        <div class="w-1/3 h-5 bg-gray-200 rounded"></div>
                        <div class="w-1/5 h-5 bg-gray-200 rounded"></div>
                    </div>
                    <div class="w-1/4 h-4 bg-gray-200 rounded mt-2"></div>
                </div>
            </div>
        `;

        // Get job history from server
        const response = await fetch('/api/user/history', {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Không thể tải lịch sử');
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Lỗi tải lịch sử');
        }

        // Sort jobs by creation time (newest first)
        allJobs = data.history || [];
        allJobs.sort((a, b) => b.createdAt - a.createdAt);

        // Apply filters and render
        filterJobs();
    } catch (error) {
        console.error('Lỗi tải lịch sử:', error);
        document.getElementById('historyList').innerHTML = `
            <div class="bg-red-50 p-6 rounded-lg text-center">
                <i class="fas fa-exclamation-triangle text-red-500 text-3xl mb-3"></i>
                <p class="text-red-700">Không thể tải lịch sử: ${error.message}</p>
                <button id="retryButton" class="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">
                    Thử lại
                </button>
            </div>
        `;

        document.getElementById('retryButton').addEventListener('click', loadJobHistory);
    }
}

// Filter jobs based on current filter and search
function filterJobs() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();

    filteredJobs = allJobs.filter(job => {
        // Filter by status
        if (currentFilter !== 'all') {
            const jobStatus = job.info?.status || 'pending';
            if (currentFilter === 'completed' && jobStatus !== 'completed') return false;
            if (currentFilter === 'processing' && jobStatus !== 'processing') return false;
            if (currentFilter === 'error' && jobStatus !== 'error') return false;
        }

        // Filter by search query
        if (searchQuery) {
            const jobName = job.name || '';
            const fileId = job.jobId || '';
            return jobName.toLowerCase().includes(searchQuery) ||
                fileId.toLowerCase().includes(searchQuery);
        }

        return true;
    });

    // Update count
    document.getElementById('itemCount').textContent = filteredJobs.length;

    // Render current page
    renderCurrentPage();
}

// Render current page of jobs
function renderCurrentPage() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageJobs = filteredJobs.slice(startIndex, endIndex);

    const historyList = document.getElementById('historyList');

    // If no jobs after filtering
    if (filteredJobs.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state bg-gray-50 p-8 rounded-lg text-center">
                <i class="fas fa-search text-gray-300 text-5xl mb-4"></i>
                <h3 class="text-xl font-medium text-gray-700 mb-2">Không tìm thấy kết quả</h3>
                <p class="text-gray-500">Không có tệp nào phù hợp với tìm kiếm của bạn</p>
            </div>
        `;

        // Clear pagination
        document.getElementById('pagination').innerHTML = '';
        return;
    }

    // Create HTML for jobs
    let jobsHTML = '';

    pageJobs.forEach(job => {
        const jobInfo = job.info || {};
        const status = jobInfo.status || 'pending';
        const jobName = job.name || `File ${job.jobId.substring(0, 8)}`;

        // Determine status class and badge
        let statusClass = '';
        let statusBadge = '';

        switch (status) {
            case 'completed':
                statusClass = 'completed';
                statusBadge = '<span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Hoàn thành</span>';
                break;
            case 'processing':
                statusClass = 'processing';
                statusBadge = '<span class="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">Đang xử lý</span>';
                break;
            case 'error':
                statusClass = 'error';
                statusBadge = '<span class="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">Lỗi</span>';
                break;
            default:
                statusClass = 'pending';
                statusBadge = '<span class="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">Chờ xử lý</span>';
        }

        jobsHTML += `
            <div class="file-item ${statusClass} bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition" x-data="{ open: false }" @mouseleave="open = false">
                <div class="flex flex-wrap justify-between items-center">
                    <div class="mb-2 md:mb-0">
                        <h3 class="font-medium text-gray-800 truncate max-w-sm">${jobName}</h3>
                        <div class="text-xs text-gray-500 mt-1 flex items-center">
                            <span class="mr-3"><i class="far fa-clock mr-1"></i> ${formatTimestamp(job.createdAt)}</span>
                            <span class="mr-3" title="${job.jobId}"><i class="fas fa-fingerprint mr-1"></i> ${job.jobId.substring(0, 8)}...</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        ${statusBadge}
                        <div class="dropdown relative">
                            <button class="text-gray-500 hover:text-gray-700 p-1" @click="open = !open">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="dropdown-menu absolute right-0 w-48 bg-white rounded-lg shadow-lg py-2 z-10" x-show="open" x-transition>
                                <a href="#" class="rename-btn block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-job-id="${job.jobId}" data-job-name="${jobName}">
                                    <i class="fas fa-edit mr-2"></i> Đổi tên
                                </a>
                                <template x-if="'${status}' === 'completed'">
                                    <a href="/api/download/${job.jobId}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" title="Tải xuống">
                                        <i class="fas fa-download mr-2"></i> Tải xuống
                                    </a>
                                    
                                </template>
                            </div>
                        </div>
                        ${status === 'completed' ? `
                            <a href="/api/download/${job.jobId}" class="bg-gradient-to-r from-green-500 to-blue-500 text-white px-3 py-1 rounded-full text-sm hover:opacity-90 transition" title="Tải xuống">
                                <i class="fas fa-download mr-1"></i> Tải
                            </a>
                            <button class="btn btn-sm btn-outline-primary preview-btn text-blue-500 hover:text-blue-800" title="Xem trước">
                                <i class="fas fa-eye"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                ${status === 'processing' ? `
                    <div class="mt-3">
                        <div class="w-full bg-gray-200 rounded-full h-1.5">
                            <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${getProgressWidth(jobInfo.currentStep)}"></div>
                        </div>
                        <div class="mt-1 text-xs text-blue-600">
                            ${getStepName(jobInfo.currentStep)}
                        </div>
                    </div>
                ` : ''}
                
                ${status === 'error' ? `
                    <div class="mt-3 text-xs text-red-600">
                        <i class="fas fa-exclamation-circle mr-1"></i> ${jobInfo.message || 'Lỗi không xác định'}
                    </div>
                ` : ''}
            </div>
        `;
    });

    historyList.innerHTML = jobsHTML;

    // Add rename button functionality
    document.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const jobId = btn.dataset.jobId;
            const jobName = btn.dataset.jobName;
            openRenameModal(jobId, jobName);
        });
    });

    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const historyItem = btn.closest('.file-item');
            const jobId = historyItem.querySelector('.rename-btn').dataset.jobId;
            console.log('Preview button clicked for job ID:', jobId);
            
            // Show preview popup
            if (window.historyPreviewManager) {
                window.historyPreviewManager.showPopup(jobId, historyItem);
            }
        });
    });

    // Update pagination
    updatePagination();
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
    const paginationElement = document.getElementById('pagination');

    if (totalPages <= 1) {
        paginationElement.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    // Previous button
    paginationHTML += `
        <button class="px-3 py-1 rounded-lg ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-200'}"
                ${currentPage === 1 ? 'disabled' : 'onclick="changePage(' + (currentPage - 1) + ')"'}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    // Page numbers
    const maxPages = 5; // Max number of page buttons to show
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);

    if (endPage - startPage + 1 < maxPages) {
        startPage = Math.max(1, endPage - maxPages + 1);
    }

    // First page button if not starting from page 1
    if (startPage > 1) {
        paginationHTML += `
            <button class="px-3 py-1 rounded-lg text-gray-700 hover:bg-gray-200" onclick="changePage(1)">1</button>
        `;

        if (startPage > 2) {
            paginationHTML += `<span class="px-3 py-1">...</span>`;
        }
    }

    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="px-3 py-1 rounded-lg ${i === currentPage ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'text-gray-700 hover:bg-gray-200'}" 
                    onclick="changePage(${i})">
                ${i}
            </button>
        `;
    }

    // Last page button if not ending with the last page
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="px-3 py-1">...</span>`;
        }

        paginationHTML += `
            <button class="px-3 py-1 rounded-lg text-gray-700 hover:bg-gray-200" onclick="changePage(${totalPages})">
                ${totalPages}
            </button>
        `;
    }

    // Next button
    paginationHTML += `
        <button class="px-3 py-1 rounded-lg ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-200'}"
                ${currentPage === totalPages ? 'disabled' : 'onclick="changePage(' + (currentPage + 1) + ')"'}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    paginationElement.innerHTML = paginationHTML;
}

// Change current page
function changePage(page) {
    currentPage = page;
    renderCurrentPage();
    // Scroll to top of list
    document.getElementById('historyList').scrollIntoView({ behavior: 'smooth' });
}

// Open rename modal
function openRenameModal(jobId, jobName) {
    document.getElementById('renameJobId').value = jobId;
    document.getElementById('jobName').value = jobName;
    renameModal.classList.remove('hidden');
}

// Close rename modal
function closeRenameModal() {
    renameModal.classList.add('hidden');
}

// Save job rename
async function saveJobRename() {
    const jobId = document.getElementById('renameJobId').value;
    const name = document.getElementById('jobName').value;

    if (!name.trim()) {
        alert('Tên không được để trống!');
        return;
    }

    try {
        const response = await fetch(`/api/user/rename/${jobId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name }),
            credentials: 'include'
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Lỗi đổi tên');
        }

        // Update job name in list
        const job = allJobs.find(j => j.jobId === jobId);
        if (job) {
            job.name = name;
        }

        // Close modal
        closeRenameModal();

        // Re-render current page
        renderCurrentPage();
    } catch (error) {
        console.error('Lỗi đổi tên:', error);
        alert('Đã xảy ra lỗi khi đổi tên: ' + error.message);
    }
}

// Helper function to get cookie value
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Helper function to format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${(date.getMinutes() < 10 ? '0' : '') + date.getMinutes()}`;
}

// Helper function to get progress width based on current step
function getProgressWidth(currentStep) {
    const steps = ['preprocess', 'ocr', 'translate', 'pdf'];
    const index = steps.indexOf(currentStep);

    if (index === -1) return '0%';

    const percentComplete = ((index + 1) / steps.length) * 100;
    return `${percentComplete}%`;
}

// Helper function to get step name
function getStepName(step) {
    const stepMap = {
        'preprocess': 'Đang tiền xử lý ảnh',
        'ocr': 'Đang nhận dạng chữ',
        'translate': 'Đang dịch thuật',
        'pdf': 'Đang tạo PDF'
    };

    return stepMap[step] || 'Đang xử lý';
}

// Make functions accessible to inline event handlers
window.changePage = changePage;