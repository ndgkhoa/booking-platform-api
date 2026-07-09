import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import { sha256 } from '@common/utils/hash';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { enqueueInviteEmail } from '@jobs/queues/email.queue';
import { Invite } from '@modules/invite/invite.entity';
import { InviteRepository } from '@modules/invite/invite.repository';
import type { Membership, MembershipRole } from '@modules/membership/membership.entity';
import { MembershipService } from '@modules/membership/membership.service';
import { TenantService } from '@modules/tenant/tenant.service';
import type { User } from '@modules/user/user.entity';
import { Service } from 'typedi';

const DAY_MS = 24 * 60 * 60 * 1000;

@Service()
export class InviteService {
  constructor(
    private readonly invites: InviteRepository,
    private readonly memberships: MembershipService,
    private readonly tenants: TenantService,
  ) {}

  /** Owner-scoped: creates an invite for the active tenant and emails the link. */
  async create(email: string, role: MembershipRole): Promise<{ invite: Invite; token: string }> {
    const tenantId = getTenantId();
    const token = randomBytes(32).toString('hex');
    const invite = await this.invites.create({
      tenantId,
      email: email.toLowerCase(),
      role,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + env.INVITE_TTL_DAYS * DAY_MS),
    });

    const tenant = await this.tenants.getById(tenantId);
    // Email is a best-effort notification; invite creation is the source of truth.
    void enqueueInviteEmail({
      email: invite.email,
      tenantName: tenant.name,
      role,
      acceptUrl: `${env.APP_URL}/accept-invite?token=${token}`,
    }).catch((error: Error) => logger.warn(`Invite email enqueue failed: ${error.message}`));

    return { invite, token };
  }

  /** Redeems an invite for the authenticated recipient, creating a membership. */
  async accept(user: User, token: string): Promise<Membership> {
    const invite = await this.invites.findByHash(sha256(token));
    if (!invite) {
      throw new UnauthorizedException('Invalid invite token');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invite expired');
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('Invite was issued to a different email');
    }
    // Claim atomically so a token cannot be redeemed twice under a race.
    if (!(await this.invites.markAcceptedIfPending(invite.id, new Date()))) {
      throw new ConflictException('Invite already used');
    }
    try {
      return await this.memberships.create(user.id, invite.tenantId, invite.role);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Already a member of this tenant');
      }
      throw error;
    }
  }
}
