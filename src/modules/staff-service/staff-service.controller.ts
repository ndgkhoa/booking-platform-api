import { OWNER_ONLY } from '@modules/auth/roles';
import { LinkServiceDto } from '@modules/staff-service/dto/link-service.dto';
import { StaffServiceService } from '@modules/staff-service/staff-service.service';
import {
  Authorized,
  Body,
  Delete,
  Get,
  HttpCode,
  JsonController,
  Param,
  Post,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/staff/:staffId/services')
export class StaffServiceController {
  constructor(private readonly capabilities: StaffServiceService) {}

  @Get()
  @Authorized()
  list(@Param('staffId') staffId: string) {
    return this.capabilities.list(staffId);
  }

  @Post()
  @HttpCode(201)
  @Authorized(OWNER_ONLY)
  link(@Param('staffId') staffId: string, @Body() dto: LinkServiceDto) {
    return this.capabilities.link(staffId, dto.serviceId);
  }

  @Delete('/:serviceId')
  @Authorized(OWNER_ONLY)
  async unlink(@Param('staffId') staffId: string, @Param('serviceId') serviceId: string) {
    await this.capabilities.unlink(staffId, serviceId);
    return { success: true };
  }
}
