export interface StepPayload {
  steps: number;
  isCharging: boolean;
}

/**
 * Pure function to calculate effective steps for a single data payload.
 * 
 * @param payload - The payload containing the step delta and charging status.
 * @returns The effective number of steps (2x if charging).
 */
export function calculateEffectiveSteps(payload: StepPayload): number {
  if (payload.steps <= 0) return 0;
  
  const multiplier = payload.isCharging ? 2 : 1;
  return payload.steps * multiplier;
}

/**
 * Calculates total effective steps for a session or window (array of payloads).
 * 
 * Inherently handles edge cases where charging starts or stops mid-session,
 * because each payload contains its instantaneous charging state and step delta
 * for that specific time slice.
 * 
 * @param payloads - Array of historical sensor payloads.
 * @returns Total effective steps.
 */
export function calculateSessionEffectiveSteps(payloads: StepPayload[]): number {
  return payloads.reduce((total, payload) => {
    return total + calculateEffectiveSteps(payload);
  }, 0);
}
