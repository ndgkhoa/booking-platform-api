import {
  BookingStatus,
  MembershipRole,
  PlanCode,
  SubscriptionStatus,
  TenantStatus,
} from '@common/types';
import { Booking } from '@modules/booking/booking.entity';
import { Customer } from '@modules/customer/customer.entity';
import { Membership } from '@modules/membership/membership.entity';
import { Plan } from '@modules/plan/plan.entity';
import { Service } from '@modules/service/service.entity';
import { Staff } from '@modules/staff/staff.entity';
import { StaffService } from '@modules/staff-service/staff-service.entity';
import { Subscription } from '@modules/subscription/subscription.entity';
import { Tenant } from '@modules/tenant/tenant.entity';
import { TimeOff } from '@modules/time-off/time-off.entity';
import { User } from '@modules/user/user.entity';
import { WorkingHours } from '@modules/working-hours/working-hours.entity';
import bcrypt from 'bcryptjs';
import { type DataSource, type EntityManager, In } from 'typeorm';

/** Password shared by every seeded account (login with any seed email + this). */
export const SEED_PASSWORD = 'Abc@123456';

const TENANT_SLUG = 'demo-salon';
const USER_EMAILS = [
  'admin@example.com',
  'owner@example.com',
  'anna@example.com',
  'ben@example.com',
  ...Array.from({ length: 6 }, (_, i) => `user${i + 1}@example.com`),
];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Scopes the manager to a tenant so RLS-protected writes/deletes pass. */
function setTenant(m: EntityManager, tenantId: string): Promise<unknown> {
  return m.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
}

/** Removes all seed data (idempotent). Tenant-scoped rows go child-first. */
async function clear(m: EntityManager): Promise<void> {
  const tenant = await m.findOne(Tenant, { where: { slug: TENANT_SLUG } });
  if (tenant) {
    await setTenant(m, tenant.id);
    const where = { tenantId: tenant.id };
    await m.delete(Booking, where);
    await m.delete(TimeOff, where);
    await m.delete(WorkingHours, where);
    await m.delete(StaffService, where);
    await m.delete(Subscription, where);
    await m.delete(Service, where);
    await m.delete(Staff, where);
    await m.delete(Customer, where);
    await m.delete(Membership, where);
    await m.delete(Tenant, { id: tenant.id });
  }
  // Plans are reference data owned by the Billing migration — never delete them here.
  await m.delete(User, { email: In(USER_EMAILS) });
}

/** Inserts a realistic demo dataset: one tenant with staff, services, schedule,
 *  customers, an active subscription and a couple of bookings. */
async function insert(m: EntityManager): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const user = (email: string, name: string, isSuperAdmin = false) =>
    m.save(m.create(User, { email, name, passwordHash, isSuperAdmin }));

  await user('admin@example.com', 'Admin', true);
  const owner = await user('owner@example.com', 'Olivia Owner');
  const anna = await user('anna@example.com', 'Anna Stylist');
  const ben = await user('ben@example.com', 'Ben Barber');
  for (let i = 1; i <= 6; i++) await user(`user${i}@example.com`, `User ${i}`);

  // Plans are seeded by the Billing migration — look one up, don't create.
  const pro = await m.getRepository(Plan).findOne({ where: { code: PlanCode.Pro } });
  if (!pro) {
    throw new Error(`Plan '${PlanCode.Pro}' not found — run \`pnpm migration:run\` first.`);
  }

  const tenant = await m.save(
    m.create(Tenant, {
      name: 'Demo Salon',
      slug: TENANT_SLUG,
      timezone: 'Asia/Ho_Chi_Minh',
      status: TenantStatus.Active,
    }),
  );
  await m.save([
    m.create(Membership, { userId: owner.id, tenantId: tenant.id, role: MembershipRole.Owner }),
    m.create(Membership, { userId: anna.id, tenantId: tenant.id, role: MembershipRole.Staff }),
    m.create(Membership, { userId: ben.id, tenantId: tenant.id, role: MembershipRole.Staff }),
  ]);

  const t = tenant.id;
  await setTenant(m, t);

  const staffAnna = await m.save(
    m.create(Staff, { tenantId: t, userId: anna.id, displayName: 'Anna' }),
  );
  const staffBen = await m.save(
    m.create(Staff, { tenantId: t, userId: ben.id, displayName: 'Ben' }),
  );

  const haircut = await m.save(
    m.create(Service, { tenantId: t, name: 'Haircut', durationMin: 30, priceAmount: 150000 }),
  );
  const color = await m.save(
    m.create(Service, {
      tenantId: t,
      name: 'Hair color',
      durationMin: 90,
      priceAmount: 500000,
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
    }),
  );
  const massage = await m.save(
    m.create(Service, { tenantId: t, name: 'Massage', durationMin: 60, priceAmount: 400000 }),
  );

  await m.save([
    m.create(StaffService, { tenantId: t, staffId: staffAnna.id, serviceId: haircut.id }),
    m.create(StaffService, { tenantId: t, staffId: staffAnna.id, serviceId: color.id }),
    m.create(StaffService, { tenantId: t, staffId: staffBen.id, serviceId: haircut.id }),
    m.create(StaffService, { tenantId: t, staffId: staffBen.id, serviceId: massage.id }),
  ]);

  const hours = [];
  for (let d = 1; d <= 5; d++) {
    hours.push(
      m.create(WorkingHours, {
        tenantId: t,
        staffId: staffAnna.id,
        weekday: d,
        startMin: 540,
        endMin: 1020,
      }),
    );
  }
  for (let d = 2; d <= 6; d++) {
    hours.push(
      m.create(WorkingHours, {
        tenantId: t,
        staffId: staffBen.id,
        weekday: d,
        startMin: 600,
        endMin: 1080,
      }),
    );
  }
  await m.save(hours);

  const jane = await m.save(
    m.create(Customer, {
      tenantId: t,
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+84900000001',
    }),
  );
  const john = await m.save(
    m.create(Customer, { tenantId: t, name: 'John Smith', email: 'john@example.com' }),
  );
  await m.save(m.create(Customer, { tenantId: t, name: 'Mai Nguyen', email: 'mai@example.com' }));

  await m.save(
    m.create(Subscription, {
      tenantId: t,
      planId: pro.id,
      provider: 'sepay',
      providerReference: `seed-${t}`,
      status: SubscriptionStatus.Active,
    }),
  );

  // Two future bookings on different staff so the EXCLUDE constraint never trips.
  const b1 = new Date(Date.now() + 3 * DAY_MS);
  b1.setUTCHours(2, 0, 0, 0); // 09:00 Asia/Ho_Chi_Minh
  const b2 = new Date(Date.now() + 4 * DAY_MS);
  b2.setUTCHours(3, 0, 0, 0);
  await m.save([
    m.create(Booking, {
      tenantId: t,
      staffId: staffAnna.id,
      serviceId: haircut.id,
      customerId: jane.id,
      startsAt: b1,
      endsAt: new Date(b1.getTime() + 30 * 60 * 1000),
      status: BookingStatus.Confirmed,
      priceAmount: 150000,
      priceCurrency: 'VND',
    }),
    m.create(Booking, {
      tenantId: t,
      staffId: staffBen.id,
      serviceId: massage.id,
      customerId: john.id,
      startsAt: b2,
      endsAt: new Date(b2.getTime() + 60 * 60 * 1000),
      status: BookingStatus.Confirmed,
      priceAmount: 400000,
      priceCurrency: 'VND',
    }),
  ]);
}

/** UP — resets to a known demo dataset (clears any prior seed first, so re-runnable). */
export function seedAll(dataSource: DataSource): Promise<void> {
  return dataSource.transaction(async (m) => {
    await clear(m);
    await insert(m);
  });
}

/** DOWN — removes everything `seedAll` created. */
export function unseedAll(dataSource: DataSource): Promise<void> {
  return dataSource.transaction((m) => clear(m));
}
