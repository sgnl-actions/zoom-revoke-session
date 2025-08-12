import script from '../src/script.mjs';

describe('Zoom Revoke Session Script', () => {
  const mockContext = {
    env: {
      ENVIRONMENT: 'test'
    },
    secrets: {
      ZOOM_TOKEN: 'Bearer test-zoom-token-123456'
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

    test('should throw error for missing ZOOM_TOKEN', async () => {
      const params = {
        userId: 'user123'
      };

      const contextWithoutToken = {
        ...mockContext,
        secrets: {}
      };

      await expect(script.invoke(params, contextWithoutToken))
        .rejects.toThrow('Missing required secret: ZOOM_TOKEN');
    });

    test('should validate empty userId', async () => {
      const params = {
        userId: '   '
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userId parameter');
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