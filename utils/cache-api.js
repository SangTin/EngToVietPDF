const express = require('express');
const cache = require('./cache');
const { connect, QUEUES } = require('./queue');

const router = express.Router();

// API endpoint để xóa tất cả cache
router.post('/api/clear-cache', (req, res) => {
    try {
        const status = cache.clear();

        res.json({
            success: status,
            message: 'Đã xóa tất cả cache'
        });
    } catch (error) {
        console.error('Lỗi khi xóa cache:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa cache',
            error: error.message
        });
    }
});

router.post('/api/clear-cache/:type', (req, res) => {
    try {
      const { type } = req.params;
      const status = cache.clearByPattern(type);
  
      res.json({
        success: status,
        message: `Đã xóa cache loại ${type}`
      });
    } catch (error) {
      console.error(`Lỗi khi xóa cache loại ${type}:`, error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xóa cache',
        error: error.message
      });
    }
});

module.exports = router;