import { BaseEntity } from '@common/entities/base.entity';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';

/**
 * Application user. The password hash is annotated with `@Exclude` so the
 * routing-controllers class-transformer step strips it from every response.
 */
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
