import { UnprocessableStateException } from '@common/exceptions';
import { assertCanTransition, canTransition } from '@modules/booking/booking-state-machine';

describe('booking state machine', () => {
  it('allows the documented transitions', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('pending', 'no_show')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
    expect(canTransition('confirmed', 'cancelled')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('completed', 'pending')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('pending', 'completed')).toBe(false); // must confirm first
    expect(canTransition('no_show', 'completed')).toBe(false);
  });

  it('assertCanTransition throws 422 on an illegal transition', () => {
    expect(() => assertCanTransition('completed', 'pending')).toThrow(UnprocessableStateException);
    expect(() => assertCanTransition('confirmed', 'completed')).not.toThrow();
  });
});
