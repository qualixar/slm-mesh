/**
 * SLM Mesh — Idle shutdown timer tests
 * TDD: Written BEFORE implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleShutdownTimer } from '../../../src/broker/idle.js';

describe('IdleShutdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback after timeout', () => {
    const cb = vi.fn();
    const _timer = new IdleShutdownTimer(5000, cb);

    vi.advanceTimersByTime(4999);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('reset() restarts the countdown', () => {
    const cb = vi.fn();
    const timer = new IdleShutdownTimer(5000, cb);

    vi.advanceTimersByTime(3000);
    timer.reset();

    vi.advanceTimersByTime(4999);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('stop() prevents callback from firing', () => {
    const cb = vi.fn();
    const timer = new IdleShutdownTimer(5000, cb);

    vi.advanceTimersByTime(3000);
    timer.stop();

    vi.advanceTimersByTime(10000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('isRunning() reflects state correctly', () => {
    const cb = vi.fn();
    const timer = new IdleShutdownTimer(5000, cb);

    expect(timer.isRunning()).toBe(true);

    timer.stop();
    expect(timer.isRunning()).toBe(false);
  });

  it('isRunning() returns false after timer fires', () => {
    const cb = vi.fn();
    const timer = new IdleShutdownTimer(5000, cb);

    vi.advanceTimersByTime(5000);
    expect(timer.isRunning()).toBe(false);
  });

  it('reset() after stop() restarts timer', () => {
    const cb = vi.fn();
    const timer = new IdleShutdownTimer(5000, cb);

    timer.stop();
    expect(timer.isRunning()).toBe(false);

    timer.reset();
    expect(timer.isRunning()).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledOnce();
  });
});
