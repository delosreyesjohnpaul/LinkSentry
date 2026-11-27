from pathlib import Path
import html
import json
import re

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

DATA_PATH = Path("scanner/data/Nazario_5.csv")
MODEL_DIR = Path("scanner/models")
MODEL_PATH = MODEL_DIR / "email_content_model.joblib"
METRICS_PATH = MODEL_DIR / "email_model_metrics.json"

def clean_text(value):
    text = html.unescape(str(value or ""))
    text = re.sub(r"(?i)\b(?:https?://|www\.)\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()

if not DATA_PATH.exists():
    raise SystemExit(f"Dataset not found: {DATA_PATH}")

data = pd.read_csv(DATA_PATH)
columns = {column.strip().lower(): column for column in data.columns}

if "subject" not in columns or "body" not in columns or "label" not in columns:
    raise SystemExit(f"Expected subject, body, and label columns. Found: {data.columns.tolist()}")

data["label"] = pd.to_numeric(data[columns["label"]], errors="coerce")
data = data.dropna(subset=["label"]).copy()
data["label"] = data["label"].astype(int)

if set(data["label"].unique()) != {0, 1}:
    raise SystemExit(f"Expected labels 0 and 1. Found: {sorted(data['label'].unique())}")

data["text"] = (
    data[columns["subject"]].map(clean_text) + " " +
    data[columns["body"]].map(clean_text)
).str.strip()

data = data[data["text"].str.len() > 0].copy()

conflict_labels = data.groupby("text")["label"].nunique()
conflicting_texts = set(conflict_labels[conflict_labels > 1].index)
if conflicting_texts:
    data = data[~data["text"].isin(conflicting_texts)].copy()

data = data.drop_duplicates(subset=["text"]).reset_index(drop=True)

if data["label"].value_counts().min() < 2:
    raise SystemExit("Not enough examples in each class to make a train/test split.")

X_train, X_test, y_train, y_test = train_test_split(
    data["text"],
    data["label"],
    test_size=0.20,
    random_state=42,
    stratify=data["label"],
)

model = Pipeline([
    ("features", FeatureUnion([
        ("words", TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=2,
            max_features=60000,
            sublinear_tf=True,
            strip_accents="unicode",
        )),
        ("characters", TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(3, 5),
            min_df=3,
            max_features=30000,
            sublinear_tf=True,
        )),
    ])),
    ("classifier", LogisticRegression(
        max_iter=1000,
        class_weight="balanced",
        random_state=42,
    )),
])

print(f"Training on {len(X_train):,} emails; evaluating on {len(X_test):,} held-out emails...")
model.fit(X_train, y_train)
predictions = model.predict(X_test)

matrix = confusion_matrix(y_test, predictions, labels=[0, 1])
tn, fp, fn, tp = matrix.ravel()

metrics = {
    "dataset": "Nazario_5.csv",
    "input_fields": ["subject", "body"],
    "urls_removed_from_text": True,
    "label_map": {"0": "legitimate", "1": "phishing"},
    "rows_after_deduplication": int(len(data)),
    "class_counts": {str(k): int(v) for k, v in data["label"].value_counts().items()},
    "holdout_rows": int(len(X_test)),
    "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
    "phishing_precision": round(float(precision_score(y_test, predictions, pos_label=1, zero_division=0)), 4),
    "phishing_recall": round(float(recall_score(y_test, predictions, pos_label=1, zero_division=0)), 4),
    "phishing_f1": round(float(f1_score(y_test, predictions, pos_label=1, zero_division=0)), 4),
    "confusion_matrix_labels": ["actual_legitimate", "actual_phishing"],
    "true_legitimate": int(tn),
    "legitimate_flagged": int(fp),
    "phishing_missed": int(fn),
    "phishing_detected": int(tp),
}

MODEL_DIR.mkdir(parents=True, exist_ok=True)
joblib.dump({
    "model": model,
    "metadata": {
        "dataset": "Nazario_5.csv",
        "label_map": {"0": "legitimate", "1": "phishing"},
        "text_fields": ["subject", "body"],
        "urls_removed": True,
    },
}, MODEL_PATH, compress=3)
METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

print("Evaluation results (20% held out):")
print(f"Accuracy:           {metrics['accuracy']:.1%}")
print(f"Phishing precision: {metrics['phishing_precision']:.1%}")
print(f"Phishing recall:    {metrics['phishing_recall']:.1%}")
print(f"Phishing F1:        {metrics['phishing_f1']:.1%}")
print(f"Legitimate emails incorrectly flagged: {fp}")
print(f"Phishing emails missed:                {fn}")
print(f"Model saved to: {MODEL_PATH}")
print(f"Metrics saved to: {METRICS_PATH}")
print("This is a dataset holdout score, not a guarantee of real-world accuracy.")
