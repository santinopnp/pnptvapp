const logger = require('./logger');

const s3Service = {
  async uploadFile(buffer, key, contentType) {
    logger.info(`[s3Service] uploadFile stub for key: ${key}`);
    return {
      Location: `/uploads/${key}`,
      Key: key,
      Bucket: process.env.S3_BUCKET || 'pnptv-media',
    };
  },
  async uploadTelegramFileToS3(ctx, fileId, destKey) {
    logger.info(`[s3Service] uploadTelegramFileToS3 stub for fileId: ${fileId}`);
    return {
      Location: `/uploads/${destKey || fileId}`,
      Key: destKey || fileId,
    };
  },
  async getSignedUrl(key, expiresIn = 3600) {
    return `/uploads/${key}`;
  },
  async deleteFile(key) {
    logger.info(`[s3Service] deleteFile stub for key: ${key}`);
    return true;
  }
};

module.exports = s3Service;
