import { IsInt, Min } from 'class-validator';

/** Carries the expected version for the optimistic-lock guard on a transition. */
export class TransitionBookingDto {
  @IsInt()
  @Min(1)
  version!: number;
}
