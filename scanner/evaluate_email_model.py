from pathlib import Path
import html
import re

import joblib
import pandas as pd

data_path = Path("scanner/data/CEAS_08.csv")
model_path = Path("scanner/models/email_content_model.joblib")

if not data_path.exists() or not model_path.exists():
    raise SystemExit("Could not find the CEAS dataset or trained model.")

def clean_text(value):
    text = html.unescape(str(value or ""))
    text = re.sub(r"(?i)\b(?:https?://|www\.)\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()

data = pd.read_csv(data_path)
columns = {column.strip().lower(): column for column in data.columns}
data["label"] = pd.to_numeric(data[columns["label"]], errors="coerce")
data = data.dropna(subset=["label"]).copy()
data["label"] = data["label"].astype(int)
data["text"] = (
    data[columns["subject"]].map(clean_text) + " " +
    data[columns["body"]].map(clean_text)
).str.strip()

legitimate = data[data["label"] == 0]
spam = data[data["label"] == 1]
sample_size = min(1500, len(legitimate), len(spam))

sample = pd.concat([
    legitimate.sample(n=sample_size, random_state=42),
    spam.sample(n=sample_size, random_state=42),
]).reset_index(drop=True)

bundle = joblib.load(model_path)
model = bundle["model"]
phishing_column = list(model.classes_).index(1)
scores = model.predict_proba(sample["text"])[:, phishing_column]
predictions = (scores >= 0.5).astype(int)

legit_predictions = predictions[:sample_size]
spam_predictions = predictions[sample_size:]

print(f"CEAS legitimate emails checked: {sample_size}")
print(f"Legitimate emails flagged as phishing: {int(legit_predictions.sum())} ({legit_predictions.mean():.1%})")
print(f"CEAS spam emails flagged as phishing: {int(spam_predictions.sum())} ({spam_predictions.mean():.1%})")
print("The spam rate is diagnostic only; this corpus does not confirm those messages are phishing.")
