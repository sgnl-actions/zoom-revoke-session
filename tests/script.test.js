import script from '../src/script.mjs';
import { SGNL_USER_AGENT } from '@sgnl-actions/utils';

describe('Zoom Revoke Session Script', () => {
  const mockContext = {
    environment: {
      ADDRESS: 'https://api.zoom.us'
    },
    secrets: {
      BEARER_AUTH_TOKEN: 'Bearer test-zoom-token-123456'
    },
    outputs: {}
  };

  beforeEach(() => {
    // Mock console to avoid noise in tests
    global.console.log = () => {};
    global.console.error = () => {};
  });

  describe('invoke handler', () => {
    test('should throw error for missing userId', async () => {
      const params = {};

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userId parameter');
    });

    test('should throw error for invalid userId', async () => {
      const params = {
        userId: ''
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userId parameter');
    });

    test('should throw error for missing authentication', async () => {
      const params = {
        userId: 'user123'
      };

      const contextWithoutToken = {
        ...mockContext,
        secrets: {}
      };

      await expect(script.invoke(params, contextWithoutToken))
        .rejects.toThrow('No authentication configured');
    });

    test('should validate empty userId', async () => {
      const params = {
        userId: '   '
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userId parameter');
    });

    test('should include User-Agent header in API calls', async () => {
      const params = {
        userId: 'testuser'
      };

      let capturedOptions;
      global.fetch = async (url, options) => {
        capturedOptions = options;
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: 'Zoom Session revoked' }),
          text: async () => 'Zoom Session revoked'
        };
      };

      await script.invoke(params, mockContext);

      expect(capturedOptions.headers['User-Agent']).toBe(SGNL_USER_AGENT);
    });


    // Note: Testing actual Zoom API calls would require mocking fetch
    // or integration tests with real Zoom credentials
  });

  describe('error handler', () => {
    test('should re-throw error for framework to handle', async () => {
      const params = {
        userId: 'user123',
        error: new Error('Network timeout')
      };

      await expect(script.error(params, mockContext))
        .rejects.toThrow('Network timeout');
    });
  });

  describe('halt handler', () => {
    test('should handle graceful shutdown', async () => {
      const params = {
        userId: 'user123',
        reason: 'timeout'
      };

      const result = await script.halt(params, mockContext);

      expect(result.userId).toBe('user123');
      expect(result.reason).toBe('timeout');
      expect(result.haltedAt).toBeDefined();
      expect(result.cleanupCompleted).toBe(true);
    });

    test('should handle halt with missing params', async () => {
      const params = {
        reason: 'system_shutdown'
      };

      const result = await script.halt(params, mockContext);

      expect(result.userId).toBe('unknown');
      expect(result.reason).toBe('system_shutdown');
      expect(result.cleanupCompleted).toBe(true);
    });
  });
});