import { describe, expect, it } from 'vitest';
import { tickState } from './rulerState';

describe('tickState', () => {
  describe('zero votes', () => {
    it('returns unfilled for every tick at votes = 0', () => {
      for (const tick of [0, 1, 2, 3, 5, 7, 10]) {
        expect(tickState(tick, 0)).toBe('unfilled');
      }
    });
  });

  describe('tick 0 (baseline reference)', () => {
    it('is always unfilled regardless of vote magnitude or sign', () => {
      expect(tickState(0, 0)).toBe('unfilled');
      expect(tickState(0, 1)).toBe('unfilled');
      expect(tickState(0, 5)).toBe('unfilled');
      expect(tickState(0, 10)).toBe('unfilled');
      expect(tickState(0, -3)).toBe('unfilled');
      expect(tickState(0, -10)).toBe('unfilled');
    });
  });

  describe('integer crossings during a hold (magnitude rising)', () => {
    it('lights tick 1 as current the moment magnitude reaches 1.0', () => {
      expect(tickState(1, 0.99)).toBe('unfilled');
      expect(tickState(1, 1.0)).toBe('current');
      expect(tickState(1, 1.01)).toBe('current');
      expect(tickState(1, 1.999)).toBe('current');
    });

    it('promotes tick 2 to current at 2.0 and demotes tick 1 to filled', () => {
      expect(tickState(1, 2.0)).toBe('filled');
      expect(tickState(2, 2.0)).toBe('current');
      expect(tickState(3, 2.0)).toBe('unfilled');
    });

    it('handles a mid-tick magnitude consistently', () => {
      // |votes| = 4.6: ticks 1–3 filled, tick 4 current, tick 5+ unfilled.
      expect(tickState(1, 4.6)).toBe('filled');
      expect(tickState(2, 4.6)).toBe('filled');
      expect(tickState(3, 4.6)).toBe('filled');
      expect(tickState(4, 4.6)).toBe('current');
      expect(tickState(5, 4.6)).toBe('unfilled');
      expect(tickState(10, 4.6)).toBe('unfilled');
    });
  });

  describe('integer crossings during a drain (magnitude falling)', () => {
    it('un-fills the highest tick first as magnitude drops below it', () => {
      // |votes| just above 3 → tick 3 current.
      expect(tickState(3, 3.0)).toBe('current');
      // |votes| just below 3 → tick 3 unfilled, tick 2 current.
      expect(tickState(3, 2.999)).toBe('unfilled');
      expect(tickState(2, 2.999)).toBe('current');
    });
  });

  describe('sign change inverts ruler colors but not tick state', () => {
    it('produces the same tick state for +mag and −mag', () => {
      const magnitudes = [0, 0.5, 1, 1.5, 2, 3, 4.6, 7, 10];
      const ticks = [0, 1, 2, 3, 5, 7, 10];
      for (const m of magnitudes) {
        for (const t of ticks) {
          expect(tickState(t, m)).toBe(tickState(t, -m));
        }
      }
    });

    it('lights the same ticks at +3 and −3', () => {
      expect(tickState(1, 3)).toBe('filled');
      expect(tickState(2, 3)).toBe('filled');
      expect(tickState(3, 3)).toBe('current');

      expect(tickState(1, -3)).toBe('filled');
      expect(tickState(2, -3)).toBe('filled');
      expect(tickState(3, -3)).toBe('current');
    });
  });

  describe('saturation at the ±10 cap', () => {
    it('marks ticks 1–9 filled and tick 10 current at |votes| = 10', () => {
      expect(tickState(1, 10)).toBe('filled');
      expect(tickState(5, 10)).toBe('filled');
      expect(tickState(9, 10)).toBe('filled');
      expect(tickState(10, 10)).toBe('current');
    });

    it('matches at |votes| = -10 too', () => {
      expect(tickState(10, -10)).toBe('current');
      expect(tickState(9, -10)).toBe('filled');
    });
  });

  describe('non-finite votes', () => {
    it('returns unfilled for NaN', () => {
      expect(tickState(1, NaN)).toBe('unfilled');
      expect(tickState(5, NaN)).toBe('unfilled');
      expect(tickState(0, NaN)).toBe('unfilled');
    });

    it('returns unfilled for ±Infinity', () => {
      expect(tickState(1, Infinity)).toBe('unfilled');
      expect(tickState(1, -Infinity)).toBe('unfilled');
      expect(tickState(10, Infinity)).toBe('unfilled');
    });
  });
});
