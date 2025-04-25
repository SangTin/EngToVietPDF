const amqp = require('amqplib');

let cachedConnection = null;
let cachedChannel = null;

// Các hàng đợi
const EXCHANGE = 'ocr_app_exchange';
const QUEUES = {
    PREPROCESS: 'preprocess_queue',
    OCR: 'ocr_queue',
    TRANSLATE: 'translate_queue',
    PDF: 'pdf_queue'
};

// Kết nối đến RabbitMQ
async function connect() {
    try {
        if (cachedConnection && cachedChannel) {
            return { connection: cachedConnection, channel: cachedChannel };
        }

        const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        // Tạo exchange và các hàng đợi
        await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
        await channel.assertQueue(QUEUES.PREPROCESS, { durable: true});
        await channel.assertQueue(QUEUES.OCR, { durable: true });
        await channel.assertQueue(QUEUES.TRANSLATE, { durable: true });
        await channel.assertQueue(QUEUES.PDF, { durable: true });

        // Liên kết các hàng đợi với exchange
        await channel.bindQueue(QUEUES.PREPROCESS, EXCHANGE, QUEUES.PREPROCESS);
        await channel.bindQueue(QUEUES.OCR, EXCHANGE, QUEUES.OCR);
        await channel.bindQueue(QUEUES.TRANSLATE, EXCHANGE, QUEUES.TRANSLATE);
        await channel.bindQueue(QUEUES.PDF, EXCHANGE, QUEUES.PDF);

        cachedConnection = connection;
        cachedChannel = channel;

        // Xử lý sự kiện đóng kết nối
        connection.on('close', () => {
            cachedConnection = null;
            cachedChannel = null;
            console.log('RabbitMQ connection closed');
        });

        // Xử lý lỗi kết nối
        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
            cachedConnection = null;
            cachedChannel = null;
        });

        return { connection, channel };
    } catch (error) {
        console.error('Lỗi kết nối RabbitMQ:', error);
        cachedConnection = null;
        cachedChannel = null;
        throw error;
    }
}

// Gửi tin nhắn đến hàng đợi
async function publishToExchange(routingKey, data, options = {}) {
    try {
        const { channel } = await connect();

        const success = channel.publish(
            EXCHANGE,
            routingKey,
            Buffer.from(JSON.stringify(data)),
            { persistent: true, ...options }
        );
        
        return success;
    } catch (error) {
        console.error('Lỗi khi gửi tin nhắn:', error);
        throw error;
    }
}

// Bắt đầu quy trình tiền xử lý ảnh
async function processPreprocess(imagePath, jobId) {
    const data = { imagePath, jobId };
    return await publishToExchange(QUEUES.PREPROCESS, data);
}

// Bắt đầu xử lý OCR
async function processOCR(imagePath, jobId) {
    const data = { imagePath, jobId };
    return await publishToExchange(QUEUES.OCR, data);
}

// Bắt đầu xử lý dịch thuật
async function processTranslation(text, jobId) {
    const data = { text, jobId };
    return await publishToExchange(QUEUES.TRANSLATE, data);
}

// Bắt đầu tạo PDF
async function processPDF(text, jobId) {
    const data = { text, jobId };
    return await publishToExchange(QUEUES.PDF, data);
}

// Lắng nghe hàng đợi và xử lý tin nhắn
async function consumeQueue(queueName, callback, maxConcurrent = 1) {
    try {
        const { channel } = await connect();

        console.log(`Đang chờ tin nhắn từ hàng đợi ${queueName}...`);

        channel.prefetch(maxConcurrent);

        channel.consume(queueName, async (msg) => {
            if (msg !== null) {
                const data = JSON.parse(msg.content.toString());

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
    } catch (error) {
        console.error(`Lỗi khi tiêu thụ hàng đợi ${queueName}:`, error);
        // Thử kết nối lại sau 5 giây nếu có lỗi
        setTimeout(() => consumeQueue(queueName, callback), 5000);
    }
}

// Đóng kết nối an toàn
async function closeConnection() {
    if (cachedChannel) {
        try {
            await cachedChannel.close();
        } catch (err) {
            console.error('Lỗi khi đóng channel:', err);
        }
        cachedChannel = null;
    }
    
    if (cachedConnection) {
        try {
            await cachedConnection.close();
        } catch (err) {
            console.error('Lỗi khi đóng connection:', err);
        }
        cachedConnection = null;
    }
}

// Xử lý sự kiện đóng chương trình
process.on('SIGINT', async () => {
    console.log('Đang đóng kết nối RabbitMQ...');
    await closeConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Đang đóng kết nối RabbitMQ...');
    await closeConnection();
    process.exit(0);
});

module.exports = {
    QUEUES,
    EXCHANGE,
    connect,
    publishToExchange,
    processPreprocess,
    processOCR,
    processTranslation,
    processPDF,
    consumeQueue,
    closeConnection
};