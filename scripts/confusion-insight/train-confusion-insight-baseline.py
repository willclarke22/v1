from pathlib import Path
import json
import math
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


ROOT = Path(__file__).resolve().parents[1]

CSV_PATH = (
    ROOT
    / "datasets"
    / "confusion-insight-dataset"
    / "v1_1"
    / "confusion_insight_training_examples_v1_1.csv"
)

MODEL_OUTPUT_DIR = ROOT / "models" / "confusion-insight" / "v1_1"
MODEL_OUTPUT_PATH = MODEL_OUTPUT_DIR / "tfidf_ridge.joblib"

RANDOM_SEED = 42
TEST_SIZE = 0.2


REQUIRED_COLUMNS = [
    "input_type",
    "current_attempt_type",
    "current_evidence",
    "previous_active_topic_label",
    "target_topic_label",
    "topic_transition_type",
    "topic_similarity",
    "previous_mode",
    "is_response_to_clarify",
    "is_response_to_probe",
    "target_topic_recent_events",
    "most_related_topic_label",
    "most_related_topic_similarity",
    "most_related_topic_similarity_threshold",
    "most_related_topic_recent_events",
    "target_topic_confusion_average",
    "target_topic_insight_average",
    "most_related_topic_confusion_average",
    "most_related_topic_insight_average",
    "confusion",
    "insight",
]


def clean_value(value, fallback="none"):
    if pd.isna(value) or value == "":
        return fallback

    return value


def parse_jsonish(value):
    if pd.isna(value) or value == "":
        return []

    if isinstance(value, list):
        return value

    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def render_events(events):
    if not events:
        return "none"

    rendered = []

    for event in events[-3:]:
        if not isinstance(event, dict):
            continue

        parts = [
            f"event_type={clean_value(event.get('event_type'))}",
            f"topic_label={clean_value(event.get('topic_label'))}",
            f"diagnosis_label={clean_value(event.get('diagnosis_label'))}",
            f"clarification_goal={clean_value(event.get('clarification_goal'))}",
            f"probe_type={clean_value(event.get('probe_type'))}",
            f"modality={clean_value(event.get('modality'))}",
            f"learning_objective={clean_value(event.get('learning_objective'))}",
            f"success_marker={clean_value(event.get('success_marker'))}",
            f"misconception_being_tested={clean_value(event.get('misconception_being_tested'))}",
            f"attempt_type={clean_value(event.get('attempt_type'))}",
            f"evidence={clean_value(event.get('evidence'))}",
        ]

        rendered.append("; ".join(parts))

    return " | ".join(rendered) if rendered else "none"


def render_training_text(row):
    target_events = render_events(parse_jsonish(row["target_topic_recent_events"]))
    related_events = render_events(parse_jsonish(row["most_related_topic_recent_events"]))

    return f"""
Input type: {clean_value(row["input_type"])}
Current attempt type: {clean_value(row["current_attempt_type"])}
Current evidence: {clean_value(row["current_evidence"])}

Previous active topic: {clean_value(row["previous_active_topic_label"])}
Target topic: {clean_value(row["target_topic_label"])}
Topic transition type: {clean_value(row["topic_transition_type"])}
Topic similarity: {clean_value(row["topic_similarity"])}

Previous mode: {clean_value(row["previous_mode"])}
Is response to clarify: {clean_value(row["is_response_to_clarify"])}
Is response to probe: {clean_value(row["is_response_to_probe"])}

Target topic recent events: {target_events}

Most related topic: {clean_value(row["most_related_topic_label"])}
Most related topic similarity: {clean_value(row["most_related_topic_similarity"])}
Most related topic threshold: {clean_value(row["most_related_topic_similarity_threshold"])}
Most related topic recent events: {related_events}

Target topic confusion average: {clean_value(row["target_topic_confusion_average"])}
Target topic insight average: {clean_value(row["target_topic_insight_average"])}
Most related topic confusion average: {clean_value(row["most_related_topic_confusion_average"])}
Most related topic insight average: {clean_value(row["most_related_topic_insight_average"])}
""".strip()


def correlation_safe(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)

    if len(actual) < 2:
        return float("nan")

    if np.std(actual) == 0 or np.std(predicted) == 0:
        return float("nan")

    return float(np.corrcoef(actual, predicted)[0, 1])


def rmse(actual, predicted):
    return math.sqrt(mean_squared_error(actual, predicted))


def clamp_predictions(predictions):
    return np.clip(predictions, 0.0, 1.0)


def print_metric_block(label, y_true, y_pred):
    print(f"{label} metrics:")
    print(f"  MAE:         {mean_absolute_error(y_true, y_pred):.4f}")
    print(f"  RMSE:        {rmse(y_true, y_pred):.4f}")
    print(f"  Correlation: {correlation_safe(y_true, y_pred):.4f}")
    print()


def print_worst_predictions(test_df, y_true, y_pred, limit=10):
    rows = []

    for idx, (_, row) in enumerate(test_df.iterrows()):
        true_confusion = float(y_true[idx][0])
        true_insight = float(y_true[idx][1])
        pred_confusion = float(y_pred[idx][0])
        pred_insight = float(y_pred[idx][1])

        confusion_error = abs(true_confusion - pred_confusion)
        insight_error = abs(true_insight - pred_insight)
        total_error = confusion_error + insight_error

        rows.append(
            {
                "total_error": total_error,
                "confusion_error": confusion_error,
                "insight_error": insight_error,
                "true_confusion": true_confusion,
                "pred_confusion": pred_confusion,
                "true_insight": true_insight,
                "pred_insight": pred_insight,
                "input_type": row["input_type"],
                "topic_transition_type": row["topic_transition_type"],
                "current_evidence": row["current_evidence"],
            }
        )

    rows = sorted(rows, key=lambda item: item["total_error"], reverse=True)

    print(f"Worst {limit} prediction misses:")
    print("=" * 80)

    for i, item in enumerate(rows[:limit], start=1):
        print(f"{i}. Total error: {item['total_error']:.4f}")
        print(f"   Input type: {item['input_type']}")
        print(f"   Topic transition: {item['topic_transition_type']}")
        print(
            "   Confusion: "
            f"true={item['true_confusion']:.2f}, "
            f"pred={item['pred_confusion']:.2f}, "
            f"err={item['confusion_error']:.2f}"
        )
        print(
            "   Insight:   "
            f"true={item['true_insight']:.2f}, "
            f"pred={item['pred_insight']:.2f}, "
            f"err={item['insight_error']:.2f}"
        )
        print(f"   Evidence: {item['current_evidence']}")
        print("-" * 80)


def main():
    if not CSV_PATH.exists():
        raise FileNotFoundError(
            f"Could not find CSV at:\n{CSV_PATH}\n\n"
            "Expected file location:\n"
            "datasets/confusion-insight-dataset/v1_1/"
            "confusion_insight_training_examples_v1_1.csv"
        )

    df = pd.read_csv(CSV_PATH)

    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"CSV is missing required columns: {missing}")

    df["training_text"] = df.apply(render_training_text, axis=1)

    print("Loaded confusion/insight dataset successfully.")
    print(f"CSV path: {CSV_PATH}")
    print(f"Rows: {len(df)}")
    print(f"Original columns: {len(df.columns) - 1}")
    print(f"Columns after rendering: {len(df.columns)}")
    print()

    print("Input type counts:")
    print(df["input_type"].value_counts().sort_index())
    print()

    print("Topic transition counts:")
    print(df["topic_transition_type"].value_counts().sort_index())
    print()

    print("Confusion range:")
    print(df["confusion"].describe())
    print()

    print("Insight range:")
    print(df["insight"].describe())
    print()

    duplicate_evidence_count = df["current_evidence"].duplicated().sum()
    print(f"Duplicate current_evidence rows: {duplicate_evidence_count}")
    print()

    print("Example rendered training text:")
    print("=" * 80)
    print(df.iloc[0]["training_text"])
    print("=" * 80)
    print()

    print("Example target:")
    print(
        {
            "confusion": float(df.iloc[0]["confusion"]),
            "insight": float(df.iloc[0]["insight"]),
        }
    )
    print()

    x = df["training_text"]
    y = df[["confusion", "insight"]].astype(float).to_numpy()

    train_df, test_df = train_test_split(
        df,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        shuffle=True,
        stratify=df["input_type"],
    )

    x_train = train_df["training_text"]
    y_train = train_df[["confusion", "insight"]].astype(float).to_numpy()

    x_test = test_df["training_text"]
    y_test = test_df[["confusion", "insight"]].astype(float).to_numpy()

    model = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.95,
                    sublinear_tf=True,
                ),
            ),
            (
                "regressor",
                Ridge(alpha=1.0, random_state=RANDOM_SEED),
            ),
        ]
    )

    print("Training TF-IDF + Ridge model...")
    print(f"Train rows: {len(train_df)}")
    print(f"Test rows:  {len(test_df)}")
    print()

    model.fit(x_train, y_train)

    raw_predictions = model.predict(x_test)
    clipped_predictions = clamp_predictions(raw_predictions)

    raw_confusion_pred = raw_predictions[:, 0]
    raw_insight_pred = raw_predictions[:, 1]

    clipped_confusion_pred = clipped_predictions[:, 0]
    clipped_insight_pred = clipped_predictions[:, 1]

    true_confusion = y_test[:, 0]
    true_insight = y_test[:, 1]

    print("Raw prediction metrics:")
    print_metric_block("Confusion", true_confusion, raw_confusion_pred)
    print_metric_block("Insight", true_insight, raw_insight_pred)

    print("Clipped prediction metrics:")
    print_metric_block("Confusion", true_confusion, clipped_confusion_pred)
    print_metric_block("Insight", true_insight, clipped_insight_pred)

    print_worst_predictions(
        test_df=test_df,
        y_true=y_test,
        y_pred=clipped_predictions,
        limit=10,
    )

    metadata = {
        "model_family": "tfidf_ridge",
        "model_version": "confusion-insight-v1_1-tfidf-ridge",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(CSV_PATH),
        "dataset_rows": int(len(df)),
        "train_rows": int(len(train_df)),
        "test_rows": int(len(test_df)),
        "random_seed": RANDOM_SEED,
        "test_size": TEST_SIZE,
        "target_columns": ["confusion", "insight"],
        "input_column": "training_text",
        "prediction_range": [0.0, 1.0],
        "notes": [
            "diagnostic_reason is intentionally excluded from model input",
            "predictions should be clipped to [0.0, 1.0] at inference time",
            "this model is intended as a fast replacement candidate for the slow Longformer prototype",
        ],
    }

    model_bundle = {
        "model": model,
        "metadata": metadata,
        "required_columns": REQUIRED_COLUMNS,
    }

    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_bundle, MODEL_OUTPUT_PATH)

    print()
    print("Saved model bundle:")
    print(MODEL_OUTPUT_PATH)


if __name__ == "__main__":
    main()