import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleLogout } from './use-idle-logout';

describe('useIdleLogout — cierre de sesión por inactividad real (no por tiempo fijo)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('llama onIdle tras el timeout cuando no hay ninguna actividad', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout(true, onIdle, 1000));

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('NO llama onIdle si hubo actividad real antes del timeout (reinicia el reloj, no es un TTL fijo)', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout(true, onIdle, 1000));

    vi.advanceTimersByTime(700);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(700);
    // 1400ms transcurridos en total, pero solo 700ms desde la última actividad.
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('no arma ningún temporizador cuando enabled=false (sesión no autenticada)', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout(false, onIdle, 1000));

    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('limpia el temporizador y los listeners al desmontar', () => {
    const onIdle = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIdleLogout(true, onIdle, 1000));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));

    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
