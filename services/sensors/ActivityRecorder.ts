import type { ActivityStateMachine, ActivityState } from "../ActivityStateMachine";

export type ActivityLabel = "IDLE" | "WALKING" | "RUNNING" | "CAR" | "CHARGING";

export interface WindowRecord {
  t: number;
  windowSec: number;
  steps: number;
  stepFreq: number;
  avgSpeed: number;
  variance: number;
  charging: boolean;
  classified: string;
  fsm: string;
  label: ActivityLabel | null;
}

export interface TransitionRecord { t: number; from: string; to: string; label: ActivityLabel | null }

const MAX_WINDOWS = 20000;

/**
 * Field-test recorder: keeps every 5 s feature window and every FSM
 * transition in memory, tagged with the label the tester picked
 * ("now I am walking"), and exports them as JSONL. This is the dataset the
 * mode-detection accuracy figure and the learned classifier come from.
 */
class ActivityRecorderImpl {
  private windows: WindowRecord[] = [];
  private transitions: TransitionRecord[] = [];
  private label: ActivityLabel | null = null;
  private recording = false;
  private startedAt: number | null = null;
  private listeners = new Set<() => void>();

  attach(fsm: ActivityStateMachine): void {
    let prev = fsm.getState();
    fsm.onStateChange((next: ActivityState) => {
      if (this.recording) this.transitions.push({ t: Date.now(), from: prev, to: next, label: this.label });
      prev = next;
      this.notify();
    });
  }

  onWindow(record: Omit<WindowRecord, "label">): void {
    if (!this.recording) return;
    this.windows.push({ ...record, label: this.label });
    if (this.windows.length > MAX_WINDOWS) this.windows.shift();
    this.notify();
  }

  setLabel(label: ActivityLabel | null): void { this.label = label; this.notify(); }
  getLabel(): ActivityLabel | null { return this.label; }
  isRecording(): boolean { return this.recording; }
  start(): void { this.recording = true; this.startedAt = Date.now(); this.notify(); }
  stop(): void { this.recording = false; this.notify(); }
  clear(): void { this.windows = []; this.transitions = []; this.notify(); }
  counts() { return { windows: this.windows.length, transitions: this.transitions.length, since: this.startedAt }; }

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify() { this.listeners.forEach((l) => l()); }

  /** Writes JSONL (one window or transition per line) and opens the share sheet. */
  async exportAndShare(): Promise<string> {
    // Loaded here, not at module scope: the sensor pipeline also runs in the
    // Node-based CLI simulator, where Expo's native modules do not exist.
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");
    const lines = [
      ...this.windows.map((w) => JSON.stringify({ kind: "window", ...w })),
      ...this.transitions.map((t) => JSON.stringify({ kind: "transition", ...t })),
    ];
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const uri = `${FileSystem.documentDirectory}akba-activity-${stamp}.jsonl`;
    await FileSystem.writeAsStringAsync(uri, lines.join("\n") + "\n");
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json" });
    return uri;
  }
}

export const ActivityRecorder = new ActivityRecorderImpl();
