import { TENANT_MEMBER } from '@modules/auth/roles';
import { BookingService } from '@modules/booking/booking.service';
import { CreateBookingDto } from '@modules/booking/dto/create-booking.dto';
import { RescheduleBookingDto } from '@modules/booking/dto/reschedule-booking.dto';
import { TransitionBookingDto } from '@modules/booking/dto/transition-booking.dto';
import {
  Authorized,
  Body,
  Get,
  HttpCode,
  JsonController,
  Param,
  Patch,
  Post,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @HttpCode(201)
  @Authorized(TENANT_MEMBER)
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }

  @Get('/:id')
  @Authorized()
  get(@Param('id') id: string) {
    return this.bookings.getById(id);
  }

  @Post('/:id/confirm')
  @Authorized(TENANT_MEMBER)
  confirm(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.confirm(id, dto.version);
  }

  @Post('/:id/complete')
  @Authorized(TENANT_MEMBER)
  complete(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.complete(id, dto.version);
  }

  @Post('/:id/cancel')
  @Authorized(TENANT_MEMBER)
  cancel(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.cancel(id, dto.version);
  }

  @Post('/:id/no-show')
  @Authorized(TENANT_MEMBER)
  noShow(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.noShow(id, dto.version);
  }

  @Patch('/:id/reschedule')
  @Authorized(TENANT_MEMBER)
  reschedule(@Param('id') id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookings.reschedule(id, dto);
  }
}
