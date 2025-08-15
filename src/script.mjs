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

async function revokeUserToken(userId, token) {
  const url = `https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/token`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json'
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
  invoke: async (params, context) => {
    console.log('Starting Zoom Revoke Session action');

    try {
      validateInputs(params);

      const { userId } = params;

      console.log(`Processing user ID: ${userId}`);

      if (!context.secrets?.ZOOM_TOKEN) {
        throw new FatalError('Missing required secret: ZOOM_TOKEN');
      }

      // Revoke the user's SSO token
      console.log(`Revoking SSO token for user: ${userId}`);
      await revokeUserToken(userId, context.secrets.ZOOM_TOKEN);

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

  error: async (params, _context) => {
    const { error } = params;
    console.error(`Error handler invoked: ${error?.message}`);

    // Re-throw to let framework handle retries
    throw error;
  },

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