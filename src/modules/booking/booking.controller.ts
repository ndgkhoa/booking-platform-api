import { TENANT_MEMBER } from '@common/types';
import type { Booking } from '@modules/booking/booking.entity';
import { BookingService } from '@modules/booking/booking.service';
import { CreateBookingDto } from '@modules/booking/dto/create-booking.dto';
import { RescheduleBookingDto } from '@modules/booking/dto/reschedule-booking.dto';
import { TransitionBookingDto } from '@modules/booking/dto/transition-booking.dto';
import type { Response } from 'express';
import {
  Authorized,
  Body,
  Get,
  HeaderParam,
  HttpCode,
  JsonController,
  Param,
  Patch,
  Post,
  Res,
} from 'routing-controllers';
import { Service } from 'typedi';

@Service()
@JsonController('/bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @HttpCode(201)
  @Authorized(TENANT_MEMBER)
  create(@Body() dto: CreateBookingDto, @HeaderParam('Idempotency-Key') idempotencyKey?: string) {
    return this.bookings.create(dto, idempotencyKey);
  }

  @Get('/:id')
  @Authorized()
  async get(@Param('id') id: string, @Res() res: Response): Promise<Booking> {
    const booking = await this.bookings.getById(id);
    // ETag exposes the version for HTTP-native optimistic concurrency (If-Match).
    res.setHeader('ETag', `"${booking.version}"`);
    return booking;
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
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @HeaderParam('If-Match') ifMatch?: string,
  ) {
    // Parse an If-Match header like `"3"` / `W/"3"` into a version number.
    const parsed = ifMatch
      ? Number.parseInt(ifMatch.replace(/^W\//, '').replace(/"/g, ''), 10)
      : Number.NaN;
    const ifMatchVersion = Number.isNaN(parsed) ? undefined : parsed;
    return this.bookings.reschedule(id, dto, ifMatchVersion);
  }
}
