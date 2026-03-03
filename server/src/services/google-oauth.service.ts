/**
 * Google OAuth Service.
 *
 * Handles the full Google OAuth 2.0 authorization-code flow: building the
 * consent URL, exchanging the authorization code for tokens, fetching the
 * user profile from Google, and finding or creating a local user record.
 *
 * Uses the Node.js built-in `https` module for all outgoing HTTP requests
 * so no additional HTTP client dependency is required.
 */

import crypto from 'crypto';
import https from 'https';
import { pool } from '../config/database';
import {
  generateId,
  hashPassword,
} from '../utils/helpers';
import {
  AuthenticationError,
  ExternalServiceError,
} from '../utils/errors';
import {
  generateToken,
  generateRefreshToken,
} from '../middleware/auth';
import { withTransaction } from '../utils/transaction';
import logger from '../utils/logger';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Makes an HTTPS request and returns the parsed JSON response body.
 * Uses the Node.js built-in `https` module.
 */
function httpsRequest<T>(
  url: string,
  options: https.RequestOptions,
  body?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');

        try {
          const parsed = JSON.parse(raw) as T & { error?: string; error_description?: string };

          if (res.statusCode && res.statusCode >= 400) {
            const errorMsg =
              parsed.error_description || parsed.error || `HTTP ${res.statusCode}`;
            reject(new ExternalServiceError('Google OAuth', errorMsg));
            return;
          }

          resolve(parsed as T);
        } catch {
          reject(
            new ExternalServiceError(
              'Google OAuth',
              `Invalid JSON response from Google (HTTP ${res.statusCode})`,
            ),
          );
        }
      });
    });

    req.on('error', (err) => {
      reject(new ExternalServiceError('Google OAuth', err.message));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Produces a hex-encoded SHA-256 hash of the given token.
 * Used to store session tokens without keeping the plaintext.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// GoogleOAuthService
// ---------------------------------------------------------------------------

export class GoogleOAuthService {
  // -----------------------------------------------------------------------
  // Configuration validation
  // -----------------------------------------------------------------------

  /**
   * Throws if the required Google OAuth environment variables are not set.
   */
  private static assertConfigured(): void {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new AuthenticationError(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      );
    }
  }

  // -----------------------------------------------------------------------
  // Build authorization URL
  // -----------------------------------------------------------------------

  /**
   * Builds the Google OAuth consent screen URL.
   *
   * Includes a cryptographically random `state` parameter for CSRF
   * protection which callers should store (e.g. in a session cookie)
   * and verify when the callback is received.
   */
  static getAuthorizationUrl(): { url: string; state: string } {
    GoogleOAuthService.assertConfigured();

    const state = crypto.randomBytes(32).toString('hex');

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return { url, state };
  }

  // -----------------------------------------------------------------------
  // Exchange authorization code for tokens
  // -----------------------------------------------------------------------

  /**
   * Exchanges an authorization code for Google OAuth tokens by POSTing
   * to the Google token endpoint.
   */
  static async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    GoogleOAuthService.assertConfigured();

    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }).toString();

    const tokenResponse = await httpsRequest<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      body,
    );

    return tokenResponse;
  }

  // -----------------------------------------------------------------------
  // Fetch user profile from Google
  // -----------------------------------------------------------------------

  /**
   * Fetches the authenticated user's profile from the Google userinfo
   * endpoint using the provided access token.
   */
  static async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const userInfo = await httpsRequest<GoogleUserInfo>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!userInfo.email) {
      throw new AuthenticationError(
        'Google account does not have an email address associated with it.',
      );
    }

    return userInfo;
  }

  // -----------------------------------------------------------------------
  // Find or create local user
  // -----------------------------------------------------------------------

  /**
   * Looks up a user by `oauth_provider = 'google'` and `oauth_id`.
   *
   * - If a matching user exists, returns it.
   * - If no OAuth match but a user with the same email exists, links the
   *   Google account to the existing user and returns it.
   * - If no user exists at all, creates a new one with a random password
   *   (OAuth users authenticate via Google, not a local password).
   */
  static async findOrCreateUser(
    googleProfile: GoogleUserInfo,
  ): Promise<{ user: User; token: string; refreshToken: string }> {
    // 1. Try to find user by OAuth provider + id
    const oauthResult = await pool.query(
      `SELECT id, email, name, role, created_at, updated_at
       FROM users
       WHERE oauth_provider = 'google' AND oauth_id = $1`,
      [googleProfile.id],
    );

    if (oauthResult.rows.length > 0) {
      const existingUser = oauthResult.rows[0] as User;

      logger.info('Google OAuth login – existing OAuth user', {
        userId: existingUser.id,
        email: existingUser.email,
      });

      return GoogleOAuthService.createSession(existingUser);
    }

    // 2. Check if a user with this email already exists (registered via
    //    email/password) and link the Google account to it.
    const emailResult = await pool.query(
      `SELECT id, email, name, role, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [googleProfile.email.toLowerCase()],
    );

    if (emailResult.rows.length > 0) {
      const existingUser = emailResult.rows[0] as User;

      await pool.query(
        `UPDATE users
         SET oauth_provider = 'google',
             oauth_id = $1,
             avatar_url = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [googleProfile.id, googleProfile.picture || null, existingUser.id],
      );

      logger.info('Google OAuth login – linked to existing email user', {
        userId: existingUser.id,
        email: existingUser.email,
      });

      return GoogleOAuthService.createSession(existingUser);
    }

    // 3. Create a brand-new user
    const id = generateId();
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(randomPassword);
    const name = googleProfile.name || googleProfile.email.split('@')[0];

    const newUser = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (id, email, password_hash, name, role, oauth_provider, oauth_id, avatar_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'google', $6, $7, NOW(), NOW())
         RETURNING id, email, name, role, created_at, updated_at`,
        [
          id,
          googleProfile.email.toLowerCase(),
          passwordHash,
          name,
          'user',
          googleProfile.id,
          googleProfile.picture || null,
        ],
      );

      return result.rows[0] as User;
    });

    logger.info('Google OAuth registration – new user created', {
      userId: newUser.id,
      email: newUser.email,
    });

    return GoogleOAuthService.createSession(newUser);
  }

  // -----------------------------------------------------------------------
  // Session creation (mirrors AuthService.login session logic)
  // -----------------------------------------------------------------------

  /**
   * Creates a session, audit log entry, and tokens for the given user.
   * Follows the same pattern as `AuthService.login`.
   */
  private static async createSession(
    user: User,
  ): Promise<{ user: User; token: string; refreshToken: string }> {
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshTkn = generateRefreshToken({ id: user.id });

    const sessionId = generateId();
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id],
      );
      await client.query(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '24 hours')`,
        [sessionId, user.id, hashToken(token)],
      );
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, details, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          generateId(),
          user.id,
          'GOOGLE_OAUTH_LOGIN',
          JSON.stringify({ email: user.email, provider: 'google' }),
        ],
      );
    });

    return { user, token, refreshToken: refreshTkn };
  }
}
