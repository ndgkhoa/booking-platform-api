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
  @Authorized(['owner', 'staff'])
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }

  @Get('/:id')
  @Authorized()
  get(@Param('id') id: string) {
    return this.bookings.getById(id);
  }

  @Post('/:id/confirm')
  @Authorized(['owner', 'staff'])
  confirm(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.confirm(id, dto.version);
  }

  @Post('/:id/complete')
  @Authorized(['owner', 'staff'])
  complete(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.complete(id, dto.version);
  }

  @Post('/:id/cancel')
  @Authorized(['owner', 'staff'])
  cancel(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.cancel(id, dto.version);
  }

  @Post('/:id/no-show')
  @Authorized(['owner', 'staff'])
  noShow(@Param('id') id: string, @Body() dto: TransitionBookingDto) {
    return this.bookings.noShow(id, dto.version);
  }

  @Patch('/:id/reschedule')
  @Authorized(['owner', 'staff'])
  reschedule(@Param('id') id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookings.reschedule(id, dto);
  }
}
