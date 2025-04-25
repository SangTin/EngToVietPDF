const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const cache = require('./cache'); // Sử dụng Redis cache của bạn

class PerformanceMonitor {
  constructor() {
    this.startTimes = {};
    this.metricsPrefix = 'monitoring:metrics:';
  }

  // Bắt đầu đo một metric
  startMeasure(name, jobId) {
    const key = `${name}_${jobId}`;
    this.startTimes[key] = performance.now();
  }

  // Kết thúc đo và lưu kết quả
  async endMeasure(name, jobId) {
    const key = `${name}_${jobId}`;
    if (!this.startTimes[key]) {
      console.warn(`Không tìm thấy thời điểm bắt đầu cho ${key}`);
      return;
    }

    const duration = performance.now() - this.startTimes[key];
    
    // Lưu metric vào Redis
    await this.recordMetricToRedis(name, {
      jobId,
      duration,
      timestamp: new Date().toISOString()
    });

    delete this.startTimes[key];
    return duration;
  }

  // Lưu metric không liên quan đến thời gian
  async recordMetric(name, value, jobId = null) {
    await this.recordMetricToRedis(name, {
      jobId,
      value,
      timestamp: new Date().toISOString()
    });
  }

  // Lưu metric vào Redis
  async recordMetricToRedis(name, data) {
    const redisKey = `${this.metricsPrefix}${name}`;
    
    // Lấy danh sách metric hiện tại
    let metrics = await cache.get(redisKey) || [];
    
    // Thêm metric mới
    metrics.push(data);
    
    // Giới hạn số lượng metric lưu trữ để tránh quá tải
    if (metrics.length > 1000) {
      metrics = metrics.slice(metrics.length - 1000);
    }
    
    // Lưu lại vào Redis
    await cache.setWithPriority(redisKey, metrics, 'LOW'); // TTL 24 giờ
  }

  // Lấy tất cả metrics từ Redis
  async getAllMetrics() {
    const keys = await cache.getAllKeys();
    const metricKeys = keys.filter(key => key.startsWith(this.metricsPrefix));
    
    const metrics = {};
    for (const key of metricKeys) {
      const name = key.replace(this.metricsPrefix, '');
      metrics[name] = await cache.get(key) || [];
    }
    
    return metrics;
  }

  // Xuất báo cáo hiệu năng
  async generateReport() {
    const metrics = await this.getAllMetrics();
    
    const report = {
      summary: {},
      details: metrics,
      timestamp: new Date().toISOString()
    };

    // Tính toán tổng quát cho các metric thời gian
    for (const [name, values] of Object.entries(metrics)) {
      if (values.length === 0) continue;
      
      if (values[0].duration !== undefined) {
        const durations = values.map(v => v.duration);
        report.summary[name] = {
          min: Math.min(...durations),
          max: Math.max(...durations),
          avg: durations.reduce((sum, val) => sum + val, 0) / durations.length,
          count: durations.length
        };
      }
    }

    // Lưu báo cáo vào file
    const reportDir = './reports';
    await fs.mkdir(reportDir, { recursive: true });
    
    const filename = `${reportDir}/performance_${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(report, null, 2), 'utf8');
    
    return { filename, report };
  }
}

const monitor = new PerformanceMonitor();
module.exports = monitor;