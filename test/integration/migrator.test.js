/**
 * Tests for getMigrationStatus(), which backs the admin system-info panel.
 * Runs against the migrated test database.
 */
const { getMigrationStatus } = require('../../src/db/migrator');
const { closePool } = require('../helpers/db');

afterAll(async () => {
  await closePool();
});

describe('getMigrationStatus', () => {
  test('reports a consistent applied/total/pending summary', async () => {
    const status = await getMigrationStatus();

    expect(status.applied).toBeGreaterThan(0);
    expect(status.total).toBeGreaterThanOrEqual(status.applied);
    // pending is exactly the files on disk not yet recorded as applied
    expect(status.pending).toBe(status.total - status.applied);
    expect(status.pendingVersions).toHaveLength(status.pending);
  });

  test('reports the latest applied migration', async () => {
    const status = await getMigrationStatus();

    expect(status.latest).not.toBeNull();
    expect(typeof status.latest.version).toBe('string');
    expect(status.latest.version.length).toBeGreaterThan(0);
  });
});
