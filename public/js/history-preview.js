/**
 * History Preview Popup
 * 
 * This script adds preview popup functionality to the history list.
 * It shows the original image when hovering over or clicking on history items.
 */

class HistoryPreviewManager {
    constructor() {
        this.popup = null;
        this.currentJobId = null;
        this.previewCache = {};
        this.init();
    }

    init() {
        // Create popup element
        this.createPopupElement();

        // Add event listeners to history items
        this.attachEventListeners();
    }

    createPopupElement() {
        // Xóa popup hiện có nếu có
        const existingPopup = document.querySelector('.popup-wrapper');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Tạo wrapper container
        const wrapper = document.createElement('div');
        wrapper.className = 'popup-wrapper';
        wrapper.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.5);
          opacity: 0;
          transition: opacity 0.2s ease;
          display: none;
        `;

        // Tạo popup container
        this.popup = document.createElement('div');
        this.popup.className = 'history-preview-popup';
        this.popup.style.cssText = `
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
          overflow: hidden;
          transition: transform 0.2s ease;
          transform: scale(0.95);
        `;

        // Thêm nội dung popup
        this.popup.innerHTML = `
          <div class="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-3 flex justify-between items-center">
            <h3 class="text-lg font-medium">Xem trước</h3>
            <button class="close-preview text-white hover:text-gray-200">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="preview-content p-4 overflow-y-auto" style="max-height: calc(80vh - 56px);">
            <div class="preview-image-container mb-4 bg-gray-100 rounded-lg p-2 text-center">
              <div class="flex justify-center items-center h-40">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span class="ml-2 text-gray-500">Đang tải...</span>
              </div>
            </div>
          </div>
        `;

        // Thêm popup vào wrapper
        wrapper.appendChild(this.popup);

        // Thêm wrapper vào body
        document.body.appendChild(wrapper);

        // Lưu tham chiếu đến wrapper
        this.wrapper = wrapper;

        // Thêm sự kiện đóng popup
        this.popup.querySelector('.close-preview').addEventListener('click', () => {
            this.hidePopup();
        });

        // Đóng popup khi click vào backdrop
        wrapper.addEventListener('click', (event) => {
            if (event.target === wrapper) {
                this.hidePopup();
            }
        });

        // Đóng popup khi nhấn phím Escape
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && wrapper.style.display === 'flex') {
                this.hidePopup();
            }
        });
    }

    attachEventListeners() {
        // Delegate event listeners to handle dynamically added history items
        document.addEventListener('click', (event) => {
            const historyItem = event.target.closest('.history-item');
            if (historyItem) {
                const jobId = historyItem.dataset.jobId;
                if (jobId) {
                    this.togglePopup(jobId);
                }
            }
        });

        // Optional: Add hover preview
        let hoverTimer;
        document.addEventListener('mouseover', (event) => {
            const historyItem = event.target.closest('.history-item');
            if (historyItem) {
                const jobId = historyItem.dataset.jobId;
                if (jobId) {
                    // Show preview after a short delay (prevent flicker on quick mouse movements)
                    clearTimeout(hoverTimer);
                    hoverTimer = setTimeout(() => {
                        // Skip if popup is already visible (from a click)
                        if (this.popup.style.display === 'none') {
                            this.showPopup(jobId);
                        }
                    }, 300);
                }
            }
        });

        document.addEventListener('mouseout', (event) => {
            const historyItem = event.target.closest('.history-item');
            if (historyItem) {
                clearTimeout(hoverTimer);
                // Only hide if this is a hover popup (not from a click)
                if (this.popup.dataset.mode === 'hover') {
                    this.hidePopup();
                }
            }
        });
    }

    async showPopup(jobId) {
        console.log('Showing preview popup for job:', jobId);

        // Đặt jobId hiện tại
        this.currentJobId = jobId;

        // Hiển thị trạng thái loading
        this.showLoadingState();

        // Hiển thị wrapper
        this.wrapper.style.display = 'flex';

        // Kích hoạt animation
        setTimeout(() => {
            this.wrapper.style.opacity = '1';
            this.popup.style.transform = 'scale(1)';
        }, 10);

        // Tải dữ liệu preview
        await this.loadPreviewData(jobId);
    }

    hidePopup() {
        // Fade out và scale down
        this.wrapper.style.opacity = '0';
        this.popup.style.transform = 'scale(0.95)';

        // Ẩn sau khi transition hoàn tất
        setTimeout(() => {
            this.wrapper.style.display = 'none';
            this.currentJobId = null;
        }, 200);
    }

    togglePopup(jobId) {
        if (this.currentJobId === jobId && this.popup.style.display === 'block') {
            this.hidePopup();
        } else {
            this.showPopup(jobId);
        }
    }

    async loadPreviewData(jobId) {
        try {
            // Use cached data if available
            if (this.previewCache[jobId]) {
                this.updatePopupContent(this.previewCache[jobId]);
                return;
            }

            // Show loading state
            this.showLoadingState();

            // Fetch preview data from server
            const response = await fetch(`/api/preview/${jobId}`);

            if (!response.ok) {
                throw new Error('Không thể tải dữ liệu xem trước');
            }

            const data = await response.json();

            if (data.success) {
                // Cache the preview data
                this.previewCache[jobId] = data.preview;

                // Update popup content
                this.updatePopupContent(data.preview);
            } else {
                throw new Error(data.message || 'Lỗi khi tải dữ liệu xem trước');
            }
        } catch (error) {
            console.error('Lỗi khi tải dữ liệu xem trước:', error);
            this.showErrorState(error.message);
        }
    }

    showLoadingState() {
        const imageContainer = this.popup.querySelector('.preview-image-container');

        imageContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Đang tải...</div>';
    }

    showErrorState(message) {
        const imageContainer = this.popup.querySelector('.preview-image-container');

        imageContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #e53935;">Không thể tải ảnh</div>';
    }

    updatePopupContent(preview) {
        try {
            const imageContainer = this.popup.querySelector('.preview-image-container');

            // Kiểm tra xem container có tồn tại không
            if (!imageContainer) {
                console.error('Image container not found');
                return;
            }

            // Cập nhật hình ảnh nếu có
            if (preview.imageUrl) {
                // Tạo wrapper cho hình ảnh để thêm chức năng click
                imageContainer.innerHTML = '';

                // Tạo link bao quanh hình ảnh
                const imageLink = document.createElement('a');
                imageLink.href = preview.imageUrl;
                imageLink.target = '_blank'; // Mở trong tab mới
                imageLink.title = 'Nhấp để xem ảnh đầy đủ trong tab mới';
                imageLink.style.cssText = 'display: inline-block; cursor: pointer;';

                // Tạo phần tử hình ảnh
                const imageElement = document.createElement('img');
                imageElement.className = 'preview-image max-h-60 inline-block rounded hover:opacity-90 transition';
                imageElement.style.maxWidth = '100%';

                // Thêm sự kiện loading và error
                imageElement.onload = () => {
                    console.log('Image loaded successfully');
                };

                imageElement.onerror = () => {
                    console.error('Error loading image:', preview.imageUrl);
                    imageContainer.innerHTML = `
                <div class="flex justify-center items-center h-40 text-red-500">
                  <i class="fas fa-exclamation-circle text-2xl"></i>
                  <span class="ml-2">Không thể tải ảnh</span>
                </div>
              `;
                };

                // Đặt src và thêm vào DOM
                imageElement.src = preview.imageUrl;
                imageLink.appendChild(imageElement);

                // Thêm icon và chỉ dẫn nhỏ 
                const hintContainer = document.createElement('div');
                hintContainer.className = 'text-xs text-gray-500 mt-2';
                hintContainer.innerHTML = `
              <i class="fas fa-external-link-alt mr-1"></i> Nhấp vào ảnh để xem kích thước đầy đủ
            `;

                // Thêm phần tử vào container
                imageContainer.appendChild(imageLink);
                imageContainer.appendChild(hintContainer);
            } else {
                imageContainer.innerHTML = `
              <div class="flex justify-center items-center h-40 text-gray-500">
                <i class="fas fa-image text-2xl"></i>
                <span class="ml-2">Ảnh không khả dụng</span>
              </div>
            `;
            }
        } catch (error) {
            console.error('Error updating popup content:', error);

            // Hiển thị thông báo lỗi
            try {
                const container = this.popup.querySelector('.preview-content');
                if (container) {
                    container.innerHTML = `
                <div class="bg-red-50 p-6 rounded-lg text-center">
                  <i class="fas fa-exclamation-triangle text-red-500 text-3xl mb-3"></i>
                  <p class="text-red-700">Lỗi hiển thị: ${error.message}</p>
                </div>
              `;
                }
            } catch (e) {
                console.error('Failed to show error message in popup:', e);
            }
        }
    }
}

// Initialize the preview manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.historyPreviewManager = new HistoryPreviewManager();
});