import { env } from '@config/env';
import type { JwtPayload } from '@modules/auth/token.service';
import { UserService } from '@modules/user/user.service';
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
      async (payload: JwtPayload, done) => {
        try {
          const user = await Container.get(UserService).findById(payload.sub);
          return user ? done(null, user) : done(null, false);
        } catch (error) {
          return done(error as Error, false);
        }
      },
    ),
  );
}
