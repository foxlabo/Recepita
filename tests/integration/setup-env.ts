// Runs in every integration test worker before the test file is imported, so
// lib/prisma.ts connects to the test database.
import { testDatabaseUrl } from '../support/test-db';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET ||= 'integration-test-secret-0123456789abcdef';
