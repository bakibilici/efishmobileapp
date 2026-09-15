/**
 * Offline evaluation of the transport-mode detector on recorded field data.
 *
 *   npx tsx scripts/activity/evaluate.ts <recording.jsonl> [more.jsonl ...]
 *
 * Input: JSONL exported from Profile → "Saha Testi Kaydı" (one window per
 * line, with the label the tester picked). Output: accuracy, per-class
 * precision/recall, confusion matrix and the median detection latency of the
 * FSM after each label change — the numbers the field-test report quotes.
 */
import fs from "fs";

type Row = { kind: string; t: number; label: string | null; classified: string; fsm: string };

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npx tsx scripts/activity/evaluate.ts <recording.jsonl> ...");
  process.exit(1);
}
const rows: Row[] = files.flatMap((f) =>
  fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row),
);
const windows = rows.filter((r) => r.kind === "window" && r.label);
if (!windows.length) { console.error("no labelled windows"); process.exit(1); }

const classes = Array.from(new Set(windows.flatMap((w) => [w.label!, w.fsm]))).sort();
function report(name: string, pick: (w: Row) => string) {
  const confusion: Record<string, Record<string, number>> = {};
  let correct = 0;
  for (const w of windows) {
    const truth = w.label!, pred = pick(w);
    confusion[truth] ??= {}; confusion[truth][pred] = (confusion[truth][pred] ?? 0) + 1;
    if (truth === pred) correct++;
  }
  console.log(`\n== ${name}: accuracy ${(100 * correct / windows.length).toFixed(1)}% (${correct}/${windows.length})`);
  console.log("truth \\ predicted".padEnd(12) + classes.map((c) => c.padStart(9)).join(""));
  for (const t of classes) {
    if (!confusion[t]) continue;
    console.log(t.padEnd(12) + classes.map((c) => String(confusion[t]?.[c] ?? 0).padStart(9)).join(""));
  }
  for (const c of classes) {
    const tp = confusion[c]?.[c] ?? 0;
    const fn = Object.values(confusion[c] ?? {}).reduce((a, b) => a + b, 0) - tp;
    const fp = classes.reduce((a, t) => a + (t !== c ? (confusion[t]?.[c] ?? 0) : 0), 0);
    if (tp + fn === 0) continue;
    console.log(`  ${c.padEnd(9)} precision ${(100 * tp / Math.max(1, tp + fp)).toFixed(0)}%  recall ${(100 * tp / (tp + fn)).toFixed(0)}%`);
  }
}
report("instantaneous classifier", (w) => w.classified);
report("FSM (debounced state)", (w) => w.fsm);

// Detection latency: time from a label change to the first FSM window that agrees.
const sorted = [...windows].sort((a, b) => a.t - b.t);
const latencies: number[] = [];
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i].label === sorted[i - 1].label) continue;
  const start = sorted[i].t;
  const hit = sorted.slice(i).find((w) => w.fsm === w.label && w.label === sorted[i].label);
  if (hit) latencies.push((hit.t - start) / 1000);
}
if (latencies.length) {
  latencies.sort((a, b) => a - b);
  console.log(`\nDetection latency after a label change: median ${latencies[Math.floor(latencies.length / 2)].toFixed(1)} s, max ${latencies[latencies.length - 1].toFixed(1)} s (n=${latencies.length})`);
}
