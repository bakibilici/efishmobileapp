#!/usr/bin/env python3
"""Train the learned transport-mode classifier from field recordings.

    pip install scikit-learn numpy
    python3 scripts/activity/train_model.py recordings/*.jsonl

Reads the JSONL exported from Profile → "Saha Testi Kaydı", trains a decision
tree on the same four features the app computes per 5 s window
(stepFreq, avgSpeed, variance, charging), reports 5-fold cross-validated
accuracy and the confusion matrix, and exports the tree to
constants/activityModel.json. Set "enabled": true there to make the app use it
instead of the hand-tuned rules (services/sensors/ActivityClassifier.ts).
"""
import json, sys, glob, datetime, pathlib
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_score, cross_val_predict
from sklearn.metrics import confusion_matrix, classification_report

FEATURES = ["stepFreq", "avgSpeed", "variance", "charging"]
files = [f for a in sys.argv[1:] for f in glob.glob(a)]
if not files:
    sys.exit("usage: train_model.py <recording.jsonl> ...")
X, y = [], []
for f in files:
    for line in open(f, encoding="utf8"):
        r = json.loads(line)
        if r.get("kind") != "window" or not r.get("label"):
            continue
        X.append([r["stepFreq"], r["avgSpeed"], r["variance"], 1.0 if r["charging"] else 0.0])
        y.append(r["label"])
X, y = np.array(X), np.array(y)
classes = sorted(set(y))
print(f"{len(y)} labelled windows from {len(files)} file(s); classes: {classes}")

tree = DecisionTreeClassifier(max_depth=6, min_samples_leaf=5, random_state=0)
gbm = GradientBoostingClassifier(random_state=0)
for name, clf in [("decision tree", tree), ("gradient boosting", gbm)]:
    acc = cross_val_score(clf, X, y, cv=min(5, max(2, len(y) // 20)))
    print(f"{name}: CV accuracy {acc.mean()*100:.1f}% ± {acc.std()*100:.1f}")
pred = cross_val_predict(tree, X, y, cv=min(5, max(2, len(y) // 20)))
print(classification_report(y, pred, digits=3))
print("confusion (rows = truth):", classes)
print(confusion_matrix(y, pred, labels=classes))

tree.fit(X, y)
t = tree.tree_
def export(node):
    if t.children_left[node] == -1:
        return {"c": int(np.argmax(t.value[node]))}
    return {"f": int(t.feature[node]), "th": float(t.threshold[node]),
            "l": export(t.children_left[node]), "r": export(t.children_right[node])}
out = {
    "enabled": False,
    "version": datetime.date.today().isoformat(),
    "featureOrder": FEATURES,
    "classes": [str(c) for c in tree.classes_],
    "tree": export(0),
    "trainedAt": datetime.datetime.now().isoformat(timespec="seconds"),
    "accuracy": float(cross_val_score(tree, X, y, cv=min(5, max(2, len(y) // 20))).mean()),
    "samples": int(len(y)),
}
dest = pathlib.Path(__file__).resolve().parents[2] / "constants" / "activityModel.json"
dest.write_text(json.dumps(out, indent=2) + "\n")
print(f"exported tree ({t.node_count} nodes) to {dest} — set enabled:true to activate")
