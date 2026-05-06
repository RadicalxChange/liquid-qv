import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';

/*
 * PourControl — the round + or − button on each funnel card.
 *
 * - Press-and-hold:       continuous pour at constant volumetric rate
 *                         (managed by the parent's activePour state).
 * - Quick tap (<150 ms):  forced ±1 vote, animated as a brief 250 ms pour.
 *
 * The button itself is dumb: it fires `onPourStart` on pointer-down and
 * `onPourEnd` on pointer-up / pointer-leave / pointer-cancel. The parent
 * decides what each of those does (continuous live state vs tap commit).
 */

interface Props {
  direction: 'in' | 'out';
  disabled?: boolean;
  ariaLabel: string;
  onPourStart: () => void;
  onPourEnd: () => void;
}

export const PourControl = ({
  direction,
  disabled = false,
  ariaLabel,
  onPourStart,
  onPourEnd,
}: Props) => {
  const activeRef = useRef(false);

  const handleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    activeRef.current = true;
    onPourStart();
  };

  const handleEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    onPourEnd();
  };

  // Defensive: if the user lifts the pointer outside the button or the
  // tab loses focus mid-pour, end the pour so we don't leak an active
  // state. The button's pointer capture should make this rare, but
  // browsers vary.
  useEffect(() => {
    const cancel = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      onPourEnd();
    };
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [onPourEnd]);

  const symbol = direction === 'in' ? '+' : '−';
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={handleDown}
      onPointerUp={handleEnd}
      onPointerLeave={handleEnd}
      onPointerCancel={handleEnd}
      className="flex h-9 w-9 items-center justify-center rounded-full border text-size-0 leading-none transition-colors disabled:opacity-30 select-none"
      style={{
        borderColor: 'var(--lqv-funnel-wall)',
        color: 'var(--lqv-fg)',
        background: 'var(--lqv-funnel-bg)',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {symbol}
    </button>
  );
};
