import { BaseEntity } from '@common/base/entity.base';
import { Column, Entity, Index } from 'typeorm';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column()
  name!: string;

  @Index({ unique: true })
  @Column()
  slug!: string;

  @Column({ default: 'UTC' })
  timezone!: string;

  @Column({ default: 'free' })
  plan!: string;
}
