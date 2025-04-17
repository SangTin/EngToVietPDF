const amqp = require('amqplib');

// Các hàng đợi
const QUEUES = {
    OCR: 'ocr_queue',
    TRANSLATE: 'translate_queue',
    PDF: 'pdf_queue'
};

// Kết nối đến RabbitMQ
async function connect() {
    try {
        const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        // Đảm bảo các hàng đợi tồn tại
        await channel.assertQueue(QUEUES.OCR, { durable: true });
        await channel.assertQueue(QUEUES.TRANSLATE, { durable: true });
        await channel.assertQueue(QUEUES.PDF, { durable: true });

        return { connection, channel };
    } catch (error) {
        console.error('Lỗi kết nối RabbitMQ:', error);
        throw error;
    }
}

// Gửi tin nhắn đến hàng đợi
async function sendToQueue(queueName, data, options = {}) {
    const { channel } = await connect();

    const success = channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(data)),
        { persistent: true, ...options }
    );

    await channel.close();
    return success;
}

// Bắt đầu xử lý OCR
async function processOCR(imagePath, jobId) {
    const data = {
        imagePath,
        jobId
    };

    return await sendToQueue(QUEUES.OCR, data);
}

// Bắt đầu xử lý dịch thuật
async function processTranslation(text, jobId) {
    const data = {
        text,
        jobId
    };

    return await sendToQueue(QUEUES.TRANSLATE, data);
}

// Bắt đầu tạo PDF
async function processPDF(text, jobId) {
    const data = {
        text,
        jobId
    };

    return await sendToQueue(QUEUES.PDF, data);
}

// Lắng nghe hàng đợi và xử lý tin nhắn
async function consumeQueue(queueName, callback) {
    const { channel } = await connect();

    console.log(`Đang chờ tin nhắn từ hàng đợi ${queueName}...`);

    channel.prefetch(1);

    channel.consume(queueName, async (msg) => {
        if (msg !== null) {
            const data = JSON.parse(msg.content.toString());
            console.log(`Nhận tin nhắn từ ${queueName}:`, data);

            try {
                await callback(data);
                channel.ack(msg);
            } catch (error) {
                console.error(`Lỗi xử lý tin nhắn từ ${queueName}:`, error);
                // Nếu xử lý lỗi, đưa tin nhắn trở lại hàng đợi sau 5 giây
                setTimeout(() => {
                    channel.nack(msg, false, true);
                }, 5000);
            }
        }
    });
}

module.exports = {
    QUEUES,
    connect,
    sendToQueue,
    processOCR,
    processTranslation,
    processPDF,
    consumeQueue
};