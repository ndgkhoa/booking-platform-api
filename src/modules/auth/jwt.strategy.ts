import { env } from '@config/env';
import type { JwtPayload } from '@modules/auth/token.service';
import { UserRepository } from '@modules/user/user.repository';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import { Container } from 'typedi';

/**
 * Registers the passport-jwt strategy: extracts a Bearer token, verifies it
 * against JWT_SECRET, then loads the full user via the repository. The resolved
 * user is what the authorizationChecker/currentUserChecker expose downstream.
 */
export function configurePassport(): void {
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: env.JWT_SECRET,
      },
      async (payload: JwtPayload, done) => {
        try {
          const user = await Container.get(UserRepository).findById(payload.sub);
          return user ? done(null, user) : done(null, false);
        } catch (error) {
          return done(error as Error, false);
        }
      },
    ),
  );
}
