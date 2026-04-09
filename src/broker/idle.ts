/**
 * SLM Mesh — Idle shutdown timer
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 * Part of the Qualixar research initiative
 *
 * Uses setTimeout().unref() so the timer does not keep
 * the Node.js event loop alive when no other work remains.
 */

export class IdleShutdownTimer {
  private readonly timeoutMs: number;
  private readonly onShutdown: () => void;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(timeoutMs: number, onShutdown: () => void) {
    this.timeoutMs = timeoutMs;
    this.onShutdown = onShutdown;
    this.start();
  }

  /** Reset the countdown — clears existing timer and starts fresh. */
  reset(): void {
    this.clearTimer();
    this.start();
  }

  /** Stop the timer entirely. Callback will not fire. */
  stop(): void {
    this.clearTimer();
    this.running = false;
  }

  /** Whether the timer is currently counting down. */
  isRunning(): boolean {
    return this.running;
  }

  private start(): void {
    this.running = true;
    this.timerId = setTimeout(() => {
      this.running = false;
      this.timerId = null;
      this.onShutdown();
    }, this.timeoutMs);

    // unref() so this timer alone won't keep the process alive
    if (this.timerId && typeof this.timerId === 'object' && 'unref' in this.timerId) {
      this.timerId.unref();
    }
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
