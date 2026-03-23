const { signPayload, verifySignature } = require('../src/utils/hmac');

// Simulate what MockPay sends
const secret = 'my-tenant-secret-key';
const payload = JSON.stringify({
  payment_id: 'pay-abc-123',
  status: 'success',
  amount: 5000,
  currency: 'INR',
  timestamp: '2026-03-24T10:00:00.000Z'
});

const signature = signPayload(payload, secret);
console.log('\n--- MockPay sends this webhook ---');
console.log('Payload:', payload);
console.log('X-MockPay-Signature:', `sha256=${signature}`);

// Simulate client verifying a VALID webhook
console.log('\n--- Client verifies VALID webhook ---');
const isValid = verifySignature(payload, secret, signature);
console.log('Signature valid?', isValid ? 'YES ✓' : 'NO ✗');

// Simulate attacker tampering with the payload
console.log('\n--- Attacker tampers with amount ---');
const tamperedPayload = JSON.stringify({
  payment_id: 'pay-abc-123',
  status: 'success',
  amount: 999999,    // ← attacker changed this
  currency: 'INR',
  timestamp: '2026-03-24T10:00:00.000Z'
});
const tamperedValid = verifySignature(tamperedPayload, secret, signature);
console.log('Tampered signature valid?', tamperedValid ? 'YES ✓' : 'NO ✗');

// Simulate attacker with wrong secret
console.log('\n--- Attacker tries with wrong secret ---');
const wrongSecret = verifySignature(payload, 'wrong-secret', signature);
console.log('Wrong secret valid?', wrongSecret ? 'YES ✓' : 'NO ✗');