export default async function globalSetup() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-!!';
  process.env.LOG_LEVEL = 'error';
}
