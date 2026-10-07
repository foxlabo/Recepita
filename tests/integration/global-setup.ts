import { migrateTestDatabase, testDatabaseUrl } from '../support/test-db';

/** Runs once before the integration project: brings the test database schema up to date. */
export default function setup() {
  migrateTestDatabase(testDatabaseUrl());
}
