import type { User as AppUser } from '@modules/user/user.entity';

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}
