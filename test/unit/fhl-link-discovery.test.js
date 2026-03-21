const { discoverFHLLink, toContentApiUrl } = require('../../src/scrapers/fhl-link-discovery');

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger and email service to suppress output
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../src/services/email-service', () => ({
  sendDataError: jest.fn()
}));

jest.mock('../../src/config/config', () => ({
  scraping: {
    requestTimeout: 5000,
    userAgent: 'Test-Agent/1.0'
  }
}));

const BASE_URL =
  'https://www.gov.uk/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division';

const ATTACHMENT_PATH =
  '/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division/court-of-appeal-cases-fixed-for-hearing-criminal-division--3';

function mockJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(body)
  };
}

describe('fhl-link-discovery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('toContentApiUrl', () => {
    test('converts a GOV.UK page URL to Content API URL', () => {
      expect(toContentApiUrl(BASE_URL)).toBe(
        'https://www.gov.uk/api/content/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division'
      );
    });

    test('handles URLs with trailing slashes', () => {
      expect(toContentApiUrl(BASE_URL + '/')).toBe(
        'https://www.gov.uk/api/content/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division/'
      );
    });
  });

  describe('discoverFHLLink', () => {
    const publicationResponse = {
      public_updated_at: '2026-03-20T16:30:02+00:00',
      details: {
        attachments: [
          {
            attachment_type: 'html',
            id: '9198170',
            title: 'Court of Appeal cases fixed for hearing (Criminal Division)',
            url: ATTACHMENT_PATH
          }
        ]
      }
    };

    const attachmentResponse = {
      details: {
        body: '<table><thead><tr><th>Surname</th><th>Forenames</th><th>CAO Reference number</th><th>Hearing Date</th><th>Court</th><th>Time</th><th>Reporting Restriction</th><th>Crown Court</th></tr></thead><tbody><tr><td>Smith</td><td>John</td><td>202500054 A4</td><td>10 March 2026</td><td>6</td><td>10:30am</td><td></td><td>Woolwich</td></tr></tbody></table>'
      }
    };

    test('discovers FHL document via Content API', async () => {
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(publicationResponse))
        .mockResolvedValueOnce(mockJsonResponse(attachmentResponse));

      const result = await discoverFHLLink(BASE_URL);

      expect(result.success).toBe(true);
      expect(result.publicUpdatedAt).toBe('2026-03-20T16:30:02+00:00');
      expect(result.link.url).toBe(`https://www.gov.uk${ATTACHMENT_PATH}`);
      expect(result.link.linkText).toBe(
        'Court of Appeal cases fixed for hearing (Criminal Division)'
      );
      expect(result.body).toContain('<table>');
      expect(result.body).toContain('Smith');
    });

    test('makes two API calls: publication then attachment', async () => {
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(publicationResponse))
        .mockResolvedValueOnce(mockJsonResponse(attachmentResponse));

      await discoverFHLLink(BASE_URL);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: publication metadata
      const firstCallUrl = mockFetch.mock.calls[0][0];
      expect(firstCallUrl).toContain('/api/content/government/publications/');

      // Second call: attachment content
      const secondCallUrl = mockFetch.mock.calls[1][0];
      expect(secondCallUrl).toContain('/api/content/government/publications/');
      expect(secondCallUrl).toContain('--3');
    });

    test('throws when publication has no attachments', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          public_updated_at: '2026-03-20T16:30:02+00:00',
          details: { attachments: [] }
        })
      );

      await expect(discoverFHLLink(BASE_URL)).rejects.toThrow(
        'No attachments found in FHL publication metadata'
      );
    });

    test('throws when publication details.attachments is missing', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          public_updated_at: '2026-03-20T16:30:02+00:00',
          details: {}
        })
      );

      await expect(discoverFHLLink(BASE_URL)).rejects.toThrow(
        'No attachments found in FHL publication metadata'
      );
    });

    test('throws when attachment has no body', async () => {
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(publicationResponse))
        .mockResolvedValueOnce(mockJsonResponse({ details: {} }));

      await expect(discoverFHLLink(BASE_URL)).rejects.toThrow('FHL attachment has no body content');
    });

    test('throws on 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(discoverFHLLink(BASE_URL)).rejects.toThrow('not found (404)');
    });

    test('handles attachment URL that is already absolute', async () => {
      const responseWithAbsoluteUrl = {
        ...publicationResponse,
        details: {
          attachments: [
            {
              title: 'FHL Document',
              url: 'https://www.gov.uk/some/absolute/path'
            }
          ]
        }
      };

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(responseWithAbsoluteUrl))
        .mockResolvedValueOnce(mockJsonResponse(attachmentResponse));

      const result = await discoverFHLLink(BASE_URL);

      expect(result.link.url).toBe('https://www.gov.uk/some/absolute/path');
    });

    test('returns publicUpdatedAt as null when not present', async () => {
      const responseWithoutTimestamp = {
        details: publicationResponse.details
      };

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(responseWithoutTimestamp))
        .mockResolvedValueOnce(mockJsonResponse(attachmentResponse));

      const result = await discoverFHLLink(BASE_URL);

      expect(result.publicUpdatedAt).toBeNull();
    });
  });
});
