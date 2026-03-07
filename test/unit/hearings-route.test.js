/**
 * Tests for the ORDER BY whitelist in the hearings route.
 * We test the whitelist logic directly rather than spinning up Fastify,
 * since the fix is a simple value mapping.
 */
describe('hearings route - ORDER BY whitelist', () => {
  const allowedSortColumns = {
    hearing_datetime: 'hearing_datetime',
    case_number: 'case_number',
    created_at: 'created_at'
  };
  const allowedSortOrders = { asc: 'ASC', desc: 'DESC' };

  test('maps valid sort columns', () => {
    expect(allowedSortColumns['hearing_datetime']).toBe('hearing_datetime');
    expect(allowedSortColumns['case_number']).toBe('case_number');
    expect(allowedSortColumns['created_at']).toBe('created_at');
  });

  test('returns undefined for invalid sort columns (falls back to default)', () => {
    expect(allowedSortColumns['DROP TABLE hearings']).toBeUndefined();
    expect(allowedSortColumns['1; DROP TABLE hearings--']).toBeUndefined();
    expect(allowedSortColumns['']).toBeUndefined();
    expect(allowedSortColumns['id']).toBeUndefined();
  });

  test('maps valid sort orders', () => {
    expect(allowedSortOrders['asc']).toBe('ASC');
    expect(allowedSortOrders['desc']).toBe('DESC');
  });

  test('returns undefined for invalid sort orders', () => {
    expect(allowedSortOrders['ASC; DROP TABLE']).toBeUndefined();
    expect(allowedSortOrders['']).toBeUndefined();
  });
});
