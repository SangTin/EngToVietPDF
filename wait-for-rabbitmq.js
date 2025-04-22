const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

const waitForRabbitMQ = async () => {
  const maxRetries = 10;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      await conn.close();
      console.log('✅ RabbitMQ is ready!');
      return;
    } catch (err) {
      console.log(`⏳ Waiting for RabbitMQ (${retryCount + 1}/${maxRetries})...`);
      await new Promise((res) => setTimeout(res, 3000));
      retryCount++;
    }
  }

  console.error('❌ Failed to connect to RabbitMQ after multiple retries.');
  process.exit(1);
};

waitForRabbitMQ();
