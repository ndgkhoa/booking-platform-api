import { BaseEntity } from '@common/base/entity.base';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column()
  email!: string;

  @Column()
  name!: string;

  @Exclude()
  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'simple-array', default: '' })
  roles!: string[];
}
