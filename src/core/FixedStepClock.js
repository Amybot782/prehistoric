/**
 * Fixed-timestep accumulator.
 *
 * The simulation always advances in steps of exactly `stepMs`, whatever the
 * frame rate, so movement speed, physics and AI are independent of FPS.
 * Rendering interpolates between the last two simulation states with `alpha`.
 *
 * `timeScale` (time acceleration, planned for later phases) multiplies the
 * simulated time but never the step size, so physics stays stable at x2/x4.
 * When a frame is too long (tab hidden, debugger, very slow machine) the
 * number of steps is capped and the excess time is dropped instead of
 * entering a "spiral of death".
 */
export class FixedStepClock {
  /**
   * @param {{tickRate:number, maxFrameDeltaMs:number, maxStepsPerFrame:number}} cfg
   */
  constructor({ tickRate, maxFrameDeltaMs, maxStepsPerFrame }) {
    this.stepMs = 1000 / tickRate;
    this.stepSeconds = 1 / tickRate;
    this.maxFrameDeltaMs = maxFrameDeltaMs;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.accumulator = 0;
    this.timeScale = 1;
    this.paused = false;
    this.tick = 0;
    this.droppedMs = 0;
  }

  /**
   * Feeds real elapsed time and returns how many fixed steps to run now.
   * @param {number} deltaMs real time since the previous frame
   */
  advance(deltaMs) {
    if (this.paused || !(deltaMs > 0)) return 0;
    const clamped = Math.min(deltaMs, this.maxFrameDeltaMs);
    this.accumulator += clamped * this.timeScale;
    let steps = Math.floor(this.accumulator / this.stepMs);
    const cap = this.maxStepsPerFrame * Math.max(1, Math.ceil(this.timeScale));
    if (steps > cap) {
      this.droppedMs += (steps - cap) * this.stepMs;
      steps = cap;
      this.accumulator = this.stepMs * cap + (this.accumulator % this.stepMs);
    }
    this.accumulator -= steps * this.stepMs;
    this.tick += steps;
    return steps;
  }

  /** Interpolation factor in [0, 1) between previous and current state. */
  get alpha() {
    return this.accumulator / this.stepMs;
  }
}
