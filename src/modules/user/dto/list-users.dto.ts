import { BaseQuery } from '@common/base/query.base';
import { IsOptional, IsString } from 'class-validator';

export class ListUsersDto extends BaseQuery {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
