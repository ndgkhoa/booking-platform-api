# Phase 04 — Auth & Modules

**Priority:** Critical | **Status:** pending | **Depends:** 03

JWT auth (bcrypt + jsonwebtoken + passport-jwt), routing-controllers `authorizationChecker`/`currentUserChecker`, and full user + auth modules using controller→service→repository layering with DTO validation.

## DTOs — class-validator + class-transformer
`src/modules/auth/dto/login.dto.ts`, `register.dto.ts`:
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';
export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(8) password!: string;
}
export class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
```
Validation auto-runs because `@Body()` + global `validation` option (phase 02).

## Token service — `src/modules/auth/token.service.ts`
`@Service`; wraps jsonwebtoken sign/verify with `env.JWT_SECRET`, `env.JWT_EXPIRES_IN`. Payload `{ sub: userId, roles }`.

## Auth service — `src/modules/auth/auth.service.ts`
`@Service`; depends on `UserRepository` + `TokenService`. NO direct DB.
```ts
async register(dto: RegisterDto) {
  if (await this.users.findByEmail(dto.email)) throw new ConflictException('Email already in use');
  const passwordHash = await bcrypt.hash(dto.password, 12);
  const user = await this.users.create({ ...dto, passwordHash, roles: ['user'] });
  return { user, token: this.tokens.sign(user) };
}
async login(dto: LoginDto) {
  const user = await this.users.findByEmail(dto.email);
  if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
    throw new UnauthorizedException('Invalid credentials');
  return { user, token: this.tokens.sign(user) };
}
```

## Passport-JWT strategy — `src/modules/auth/jwt.strategy.ts`
Configure `passport-jwt` with `ExtractJwt.fromAuthHeaderAsBearerToken()` + secret. Register strategy once at bootstrap. (Used for documentation/standard middleware; routing-controllers checkers below do the per-route enforcement.)

## Wire checkers into server.ts (extends phase 02 options)
```ts
authorizationChecker: async (action, roles) => {
  const token = extractBearer(action.request);
  if (!token) return false;
  try {
    const payload = Container.get(TokenService).verify(token);
    (action.request as any).user = payload;
    if (!roles.length) return true;
    return roles.some(r => payload.roles?.includes(r));
  } catch { return false; }
},
currentUserChecker: async (action) => {
  const payload = (action.request as any).user;
  return payload ? Container.get(UserRepository).findById(payload.sub) : undefined;
},
```

## Controllers
`src/modules/auth/auth.controller.ts`:
```ts
@Service()
@JsonController('/auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('/register') @HttpCode(201)
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('/login')
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }
}
```
`src/modules/user/user.controller.ts`:
```ts
@Service()
@JsonController('/users')
export class UserController {
  constructor(private users: UserService) {}
  @Get('/me') @Authorized()
  me(@CurrentUser({ required: true }) user: User) { return user; }
  @Get() @Authorized(['admin'])
  list(@QueryParam('page') page = 1, @QueryParam('limit') limit = 20) {
    return this.users.paginate(page, limit);  // returns enveloped + meta
  }
  @Get('/:id') @Authorized()
  byId(@Param('id') id: string) { return this.users.getByIdOrFail(id); }
}
```
`UserService.getByIdOrFail` throws `NotFoundException` when missing. `paginate` builds `meta: PaginatedMeta` and returns `{ success:true, data, meta, timestamp }` (pre-enveloped → interceptor passes through).

## Files
modules/auth/{dto/*,token.service,auth.service,auth.controller,jwt.strategy}.ts, modules/user/{user.service,user.controller}.ts, plus extend server.ts checkers, common/utils/extract-bearer.ts

## Todo
- [ ] DTOs (register/login) with class-validator
- [ ] TokenService (jwt sign/verify)
- [ ] AuthService (bcrypt hash/compare, register/login, exceptions)
- [ ] passport-jwt strategy registered
- [ ] authorizationChecker + currentUserChecker in server.ts
- [ ] Auth + User controllers (@Authorized, @CurrentUser, role check)
- [ ] UserService with NotFound + pagination meta

## Success Criteria
- Register→login returns JWT; password hash never in response.
- `/api/users/me` 401 without token, 200 with. `/api/users` requires `admin` role.
- Invalid DTO → 422 enveloped validation error with field details.

## Security
- bcrypt cost 12. JWT short-lived (15m default). Generic "Invalid credentials" (no user enumeration). Role-based `@Authorized(['admin'])`.

## Unresolved
- Refresh tokens out of scope (YAGNI for boilerplate) — note as future extension.
