import { env } from '@config/env';
import { logger } from '@config/logger';
import { AuthService, type GoogleIdentity } from '@modules/auth/auth.service';
import type { Express } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { Container } from 'typedi';

const GOOGLE_ROUTE = '/api/v1/auth/google';

/** Extracts the identity we key on from a Google profile (prefers the verified `_json`). */
function toIdentity(profile: Profile): GoogleIdentity {
  const json = profile._json as { email?: string; email_verified?: boolean; name?: string };
  const email = profile.emails?.[0]?.value ?? json.email;
  if (!email) {
    throw new Error('Google profile has no email');
  }
  return {
    sub: profile.id,
    email,
    emailVerified: json.email_verified ?? false,
    name: profile.displayName || json.name || email,
  };
}

/** Verify callback only normalises the profile; user resolution/session minting happen in the route handler. No-ops without credentials so the app still boots. */
export function configureGoogleStrategy(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    logger.warn('Google OAuth not configured — /auth/google is disabled');
    return;
  }
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          // Idiomatic passport: the verify callback resolves the user, so
          // `req.user` downstream is our User (matching the jwt strategy).
          const user = await Container.get(AuthService).resolveGoogleUser(toIdentity(profile));
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

/** Raw Express routes, not JsonController, since these are redirect flows rather than JSON API calls. Skipped when Google is unset. */
export function mountGoogleRoutes(app: Express): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return;
  }
  const failureRedirect = `${env.GOOGLE_SUCCESS_REDIRECT}?error=google_auth_failed`;

  app.get(
    GOOGLE_ROUTE,
    passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
  );

  app.get(
    `${GOOGLE_ROUTE}/callback`,
    passport.authenticate('google', { session: false, failureRedirect }),
    async (req, res) => {
      try {
        if (!req.user) {
          throw new Error('Google callback reached without an authenticated user');
        }
        const { token, refreshToken } = await Container.get(AuthService).issueSessionFor(req.user);
        // URL fragment keeps tokens out of server logs; demo-grade — prefer a code exchange or httpOnly cookie in production.
        res.redirect(`${env.GOOGLE_SUCCESS_REDIRECT}#token=${token}&refreshToken=${refreshToken}`);
      } catch (error) {
        logger.warn(`Google callback failed: ${(error as Error).message}`);
        res.redirect(failureRedirect);
      }
    },
  );
}
