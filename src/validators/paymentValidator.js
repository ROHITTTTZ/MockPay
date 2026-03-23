const { z } = require('zod');

const SUPPORTED_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'AED',
  'SGD', 'AUD', 'CAD', 'JPY', 'MYR'
];


const createPaymentSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'amount must be a number' })
    .positive('amount must be greater than 0')
    .max(10000000, 'amount cannot exceed 1,00,00,000'),

  currency: z
    .string({ required_error: 'currency is required' })
    .toUpperCase()
    .refine(
      val => SUPPORTED_CURRENCIES.includes(val),
      val => ({ message: `${val} is not a supported currency. Use one of: ${SUPPORTED_CURRENCIES.join(', ')}` })
    ),

  webhook_url: z
    .string({ required_error: 'webhook_url is required' })
    .url('webhook_url must be a valid URL starting with http:// or https://')
    .refine(
      val => val.startsWith('https://') || val.startsWith('http://'),
      'webhook_url must start with http:// or https://'
    ),
});


const simulatePaymentSchema = z.object({
  status: z.enum(['success', 'failed'], {
    errorMap: () => ({ message: 'status must be either success or failed' })
  }),
});


const refundPaymentSchema = z.object({
  refund_amount: z
    .number({ invalid_type_error: 'refund_amount must be a number' })
    .positive('refund_amount must be greater than 0'),

  reason: z
    .string()
    .max(255, 'reason cannot exceed 255 characters')
    .optional(),
});


module.exports = {
  createPaymentSchema,
  simulatePaymentSchema,
  refundPaymentSchema,
};