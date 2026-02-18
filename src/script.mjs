import { getAuthorizationHeader, getBaseURL, SGNL_USER_AGENT } from '@sgnl-actions/utils';

class RetryableError extends Error {
  constructor(message) {
    super(message);
    this.retryable = true;
  }
}

class FatalError extends Error {
  constructor(message) {
    super(message);
    this.retryable = false;
  }
}

function validateInputs(params) {
  if (!params.userId || typeof params.userId !== 'string' || params.userId.trim() === '') {
    throw new FatalError('Invalid or missing userId parameter');
  }
}

async function revokeUserToken(userId, authHeader, baseUrl) {
  const url = `${baseUrl}/v2/users/${encodeURIComponent(userId)}/token`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'User-Agent': SGNL_USER_AGENT
    }
  });

  // Zoom API returns 204 No Content on success for DELETE endpoints
  if (response.status === 204) {
    return { success: true };
  }

  if (!response.ok) {
    const responseText = await response.text();

    if (response.status === 429) {
      throw new RetryableError('Zoom API rate limit exceeded');
    }

    if (response.status === 401) {
      throw new FatalError('Invalid or expired authentication token');
    }

    if (response.status === 403) {
      throw new FatalError('Insufficient permissions to revoke user token');
    }

    if (response.status === 404) {
      throw new FatalError(`User not found: ${userId}`);
    }

    if (response.status >= 500) {
      throw new RetryableError(`Zoom API server error: ${response.status}`);
    }

    throw new FatalError(`Failed to revoke user token: ${response.status} ${response.statusText} - ${responseText}`);
  }

  return { success: true };
}

export default {
  /**
   * Main execution handler - revokes SSO token for a Zoom user
   * @param {Object} params - Job input parameters
   * @param {string} params.userId - The Zoom user ID to revoke SSO token for (required)
   * @param {string} params.address - Optional Zoom API base URL
   *
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.environment.ADDRESS - Zoom API base URL
   *
   * The configured auth type will determine which of the following environment variables and secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   *
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   *
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   *
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   *
   * @returns {Promise<Object>} Action result
   */
  invoke: async (params, context) => {
    console.log('Starting Zoom Revoke Session action');

    try {
      validateInputs(params);

      const { userId } = params;

      console.log(`Processing user ID: ${userId}`);

      // Get authorization header
      const authHeader = await getAuthorizationHeader(context);

      // Get base URL
      const baseUrl = getBaseURL(params, context);

      // Revoke the user's SSO token
      console.log(`Revoking SSO token for user: ${userId}`);
      await revokeUserToken(userId, authHeader, baseUrl);

      const result = {
        userId,
        tokenRevoked: true,
        revokedAt: new Date().toISOString()
      };

      console.log(`Successfully revoked SSO token for user: ${userId}`);
      return result;

    } catch (error) {
      console.error(`Error revoking Zoom user token: ${error.message}`);

      if (error instanceof RetryableError || error instanceof FatalError) {
        throw error;
      }

      throw new FatalError(`Unexpected error: ${error.message}`);
    }
  },

  /**
   * Error recovery handler - handles errors during token revocation
   *
   * @param {Object} params - Original params plus error information
   * @param {Object} context - Execution context
   *
   * @returns {Object} Recovery results
   */
  error: async (params, _context) => {
    const { error } = params;
    console.error(`Error handler invoked: ${error?.message}`);

    // Re-throw to let framework handle retries
    throw error;
  },

  /**
   * Halt handler - handles graceful shutdown
   *
   * @param {Object} params - Halt parameters including reason
   * @param {Object} context - Execution context
   *
   * @returns {Object} Halt results
   */
  halt: async (params, _context) => {
    const { reason, userId } = params;
    console.log(`Job is being halted (${reason})`);

    return {
      userId: userId || 'unknown',
      reason: reason || 'unknown',
      haltedAt: new Date().toISOString(),
      cleanupCompleted: true
    };
  }
};