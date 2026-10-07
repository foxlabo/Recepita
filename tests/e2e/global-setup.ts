import { migrateTestDatabase, testDatabaseUrl } from '../support/test-db';
import { seed } from './seed';

export default async function globalSetup() {
  migrateTestDatabase(testDatabaseUrl());
  await seed();
}
