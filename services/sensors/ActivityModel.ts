import model from "../../constants/activityModel.json";
import type { ActivityState } from "./ActivityClassifier";

/** A decision tree exported by scripts/activity/train_model.py (sklearn). */
interface TreeNode { f?: number; th?: number; l?: TreeNode; r?: TreeNode; c?: number }

export interface ActivityFeatures { stepFreq: number; avgSpeed: number; variance: number; charging: boolean }

const featureVector = (x: ActivityFeatures): number[] => [x.stepFreq, x.avgSpeed, x.variance, x.charging ? 1 : 0];

export function isLearnedModelEnabled(): boolean {
  return Boolean((model as { enabled?: boolean }).enabled && (model as { tree?: TreeNode | null }).tree);
}

export function predictWithLearnedModel(x: ActivityFeatures): ActivityState | null {
  const m = model as { tree?: TreeNode | null; classes?: string[] };
  if (!m.tree || !m.classes?.length) return null;
  const v = featureVector(x);
  let node: TreeNode = m.tree;
  while (node.c === undefined) {
    const idx = node.f ?? 0;
    node = v[idx] <= (node.th ?? 0) ? (node.l as TreeNode) : (node.r as TreeNode);
    if (!node) return null;
  }
  return (m.classes[node.c] as ActivityState) ?? null;
}
