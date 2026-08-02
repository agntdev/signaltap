/** Single clock seam for timestamps and expiry decisions. */
let clock: () => Date = () => new Date();

export function now(): Date {
  return clock();
}

/** Test hook. Production code always uses the default wall clock. */
export function setClockForTests(next: (() => Date) | undefined): void {
  clock = next ?? (() => new Date());
}
