import { OWNER_ONLY } from '@modules/auth/roles';
import { AcceptInviteDto } from '@modules/invite/dto/accept-invite.dto';
import { CreateInviteDto } from '@modules/invite/dto/create-invite.dto';
import { InviteService } from '@modules/invite/invite.service';
import type { User } from '@modules/user/user.entity';
import { Authorized, Body, CurrentUser, HttpCode, JsonController, Post } from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/invites')
export class InviteController {
  constructor(private readonly invites: InviteService) {}

  /** Owner invites someone to the active tenant. Token is returned to share. */
  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  async create(@Body() dto: CreateInviteDto) {
    const { invite, token } = await this.invites.create(dto.email, dto.role);
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      token,
    };
  }

  /** Authenticated recipient redeems an invite, joining the tenant. */
  @Post('/accept')
  @Authorized()
  async accept(@CurrentUser({ required: true }) user: User, @Body() dto: AcceptInviteDto) {
    const membership = await this.invites.accept(user, dto.token);
    return { tenantId: membership.tenantId, role: membership.role };
  }
}
