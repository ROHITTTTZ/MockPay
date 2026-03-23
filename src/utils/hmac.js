const crypto = require('crypto');

const signPayload = (payload, secret) => {
  return crypto
    .createHmac('sha256', secret)   
    .update(payload)               
    .digest('hex');              
};

const verifySignature = (payload, secret, receivedSignature) => {
  const expectedSignature = signPayload(payload, secret);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
};

module.exports = { signPayload, verifySignature };