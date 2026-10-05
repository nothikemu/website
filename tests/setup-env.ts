// Test environment — isolated database and storage directory.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://forgebase:forgebase@localhost:5432/forgebase_test";
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef0123456789abcdef";
process.env.ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef0123456789";
process.env.APP_URL = "http://localhost:3000";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = ".storage-test";
process.env.EMAIL_DRIVER = "console";
process.env.AI_PROVIDER = "none";
process.env.FORGEBASE_DISABLE_RATE_LIMIT = "1";
process.env.GITHUB_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_ID = "";
