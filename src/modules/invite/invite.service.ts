import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@common/exceptions';
import { getTenantId } from '@common/tenant/tenant-context';
import type { MembershipRole } from '@common/types/enums/membership-role';
import { sha256 } from '@common/utils/hash';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { enqueueInviteEmail } from '@jobs/queues/email.queue';
import { Invite } from '@modules/invite/invite.entity';
import { InviteRepository } from '@modules/invite/invite.repository';
import type { Membership } from '@modules/membership/membership.entity';
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

  /**
   * Redeems an invite for the authenticated recipient, joining the tenant.
   * The membership is created BEFORE the invite is marked used, so a transient
   * failure can never consume the invite while leaving the user without a
   * membership (which would lock them out). Single-use is guaranteed by the
   * unique (user, tenant) membership plus the email binding, not by the flag.
   */
  async accept(user: User, token: string): Promise<Membership> {
    const invite = await this.invites.findByHash(sha256(token));
    if (!invite) {
      throw new NotFoundException('Invalid invite token');
    }
    // Blocks re-use, including rejoining with an old token after removal.
    if (invite.acceptedAt) {
      throw new ConflictException('Invite already used');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Invite expired');
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('Invite was issued to a different email');
    }

    try {
      const membership = await this.memberships.create(user.id, invite.tenantId, invite.role);
      await this.invites.markAcceptedIfPending(invite.id, new Date());
      return membership;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Already a member of this tenant');
      }
      throw error;
    }
  }
}
