import { env } from '@config/env';
import type { AccessTokenPayload } from '@modules/auth/token.service';
import { UserRepository } from '@modules/user/user.repository';
import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import { Container } from 'typedi';

export function configurePassport(): void {
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: env.JWT_SECRET,
      },
      async (payload: AccessTokenPayload, done) => {
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
