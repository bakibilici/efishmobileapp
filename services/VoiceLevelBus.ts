/**
 * Live voice levels for the assistant orb, kept out of React state on purpose:
 * they change several times a second and only the orb cares, so they must not
 * re-render the screen that hosts it.
 *
 * `mic` is the driver, `agent` is AKBA; both 0..1 as LiveKit reports them.
 */
export interface VoiceLevels {
  mic: number;
  agent: number;
}

type Listener = (levels: VoiceLevels) => void;

const listeners = new Set<Listener>();
let current: VoiceLevels = { mic: 0, agent: 0 };

export const VoiceLevelBus = {
  publish(levels: VoiceLevels) {
    current = levels;
    listeners.forEach((listener) => listener(current));
  },
  reset() {
    VoiceLevelBus.publish({ mic: 0, agent: 0 });
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(current);
    return () => {
      listeners.delete(listener);
    };
  },
};
