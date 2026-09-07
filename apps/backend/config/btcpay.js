/**
 * BTCPay Server Configuration / Retired Provider Stub
 * BTCPay / Dash payment processor retired 2026-07-31.
 */
'use strict';

const logger = require('../utils/logger');

module.exports = {
  validateWebhookSignature: () => false,
  checkInvoiceProcessed: async () => false,
  markInvoiceProcessed: async () => {},
  getInvoice: async (invoiceId) => {
    logger.warn('[btcpay] getInvoice called on retired provider', { invoiceId });
    return null;
  },
  getInvoicePaymentMethods: async (invoiceId) => {
    logger.warn('[btcpay] getInvoicePaymentMethods called on retired provider', { invoiceId });
    return [];
  },
  createInvoice: async (opts) => {
    logger.warn('[btcpay] createInvoice called on retired provider', { opts });
    const err = new Error('BTCPay provider retired');
    err.code = 'PROVIDER_RETIRED';
    throw err;
  }
};
