module.exports = {
  apps: [
    {
      name: "booqly-server",
      script: "dist/index.js",
      watch: false,
      instances: 1,
      autorestart: true,
      env_file: ".env",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "document-worker",
      script: "dist/utils/verification-worker.js",
      instances: 1,
      exec_mode: "fork",
      env_file: ".env",
      env: {
        NODE_ENV: "development",
        AWS_REGION: "eu-west-1",
        SQS_QUEUE_URL:
          "https://sqs.eu-west-1.amazonaws.com/705977866150/doc-verification-queue-2",
      },
      env_production: {
        NODE_ENV: "production",
        AWS_REGION: "eu-west-1",
        SQS_QUEUE_URL:
          "https://sqs.eu-west-1.amazonaws.com/705977866150/doc-verification-queue-2",
      },
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "500M",
      // Do not use wait_ready — verification-worker never process.send('ready'),
      // which caused PM2 to SIGINT-restart it every listen_timeout.
    },
  ],
};
