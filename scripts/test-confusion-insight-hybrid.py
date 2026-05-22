from pathlib import Path
import json
import time

import joblib
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

MODEL_PATH = (
    ROOT
    / "models"
    / "confusion-insight"
    / "v1_1"
    / "hybrid_tfidf_features_ridge.joblib"
)


def clamp_score(value):
    return float(np.clip(value, 0.0, 1.0))


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


def add_derived_features(df):
    df = df.copy()

    df["target_topic_recent_event_count"] = df["target_topic_recent_events"].apply(
        lambda value: len(parse_jsonish(value))
    )

    df["most_related_topic_recent_event_count"] = df[
        "most_related_topic_recent_events"
    ].apply(lambda value: len(parse_jsonish(value)))

    categorical_columns = [
        "input_type",
        "current_attempt_type",
        "previous_active_topic_label",
        "target_topic_label",
        "topic_transition_type",
        "previous_mode",
        "is_response_to_clarify",
        "is_response_to_probe",
        "most_related_topic_label",
    ]

    numeric_columns = [
        "topic_similarity",
        "most_related_topic_similarity",
        "most_related_topic_similarity_threshold",
        "target_topic_confusion_average",
        "target_topic_insight_average",
        "most_related_topic_confusion_average",
        "most_related_topic_insight_average",
        "target_topic_recent_event_count",
        "most_related_topic_recent_event_count",
    ]

    for column in categorical_columns:
        df[column] = df[column].apply(lambda value: str(clean_value(value)))

    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    return df


def make_sample(
    *,
    input_type,
    current_attempt_type="none",
    current_evidence,
    previous_active_topic_label,
    target_topic_label,
    topic_transition_type,
    topic_similarity,
    previous_mode,
    is_response_to_clarify,
    is_response_to_probe,
    target_topic_recent_events=None,
    most_related_topic_label="none",
    most_related_topic_similarity=None,
    most_related_topic_similarity_threshold=0.65,
    most_related_topic_recent_events=None,
    target_topic_confusion_average=None,
    target_topic_insight_average=None,
    most_related_topic_confusion_average=None,
    most_related_topic_insight_average=None,
):
    return {
        "input_type": input_type,
        "current_attempt_type": current_attempt_type,
        "current_evidence": current_evidence,
        "previous_active_topic_label": previous_active_topic_label,
        "target_topic_label": target_topic_label,
        "topic_transition_type": topic_transition_type,
        "topic_similarity": topic_similarity,
        "previous_mode": previous_mode,
        "is_response_to_clarify": is_response_to_clarify,
        "is_response_to_probe": is_response_to_probe,
        "target_topic_recent_events": json.dumps(target_topic_recent_events or []),
        "most_related_topic_label": most_related_topic_label,
        "most_related_topic_similarity": most_related_topic_similarity,
        "most_related_topic_similarity_threshold": most_related_topic_similarity_threshold,
        "most_related_topic_recent_events": json.dumps(most_related_topic_recent_events or []),
        "target_topic_confusion_average": target_topic_confusion_average,
        "target_topic_insight_average": target_topic_insight_average,
        "most_related_topic_confusion_average": most_related_topic_confusion_average,
        "most_related_topic_insight_average": most_related_topic_insight_average,
    }


def score_samples(model, samples):
    df = pd.DataFrame(samples)
    df["training_text"] = df.apply(render_training_text, axis=1)
    df = add_derived_features(df)

    start = time.perf_counter()
    raw_predictions = model.predict(df)
    latency_ms = (time.perf_counter() - start) * 1000

    results = []

    for i, prediction in enumerate(raw_predictions):
        confusion = clamp_score(prediction[0])
        insight = clamp_score(prediction[1])

        results.append(
            {
                "index": i + 1,
                "confusion": confusion,
                "insight": insight,
                "raw_confusion": float(prediction[0]),
                "raw_insight": float(prediction[1]),
                "evidence": samples[i]["current_evidence"],
                "input_type": samples[i]["input_type"],
                "topic_transition_type": samples[i]["topic_transition_type"],
            }
        )

    return results, latency_ms


def main():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Could not find model at:\n{MODEL_PATH}\n\n"
            "Run scripts/train-confusion-insight-hybrid.py first."
        )

    bundle = joblib.load(MODEL_PATH)
    model = bundle["model"]
    metadata = bundle.get("metadata", {})

    print("Loaded hybrid confusion/insight model.")
    print(f"Model path: {MODEL_PATH}")
    print(f"Model version: {metadata.get('model_version')}")
    print()

    samples = [
        make_sample(
            input_type="message",
            current_evidence=(
                "Learner wrote: Wait, I think I get it now. "
                "The problem is not that warm air makes clouds directly. "
                "It has to cool to the saturation point first."
            ),
            previous_active_topic_label="Cloud Formation",
            target_topic_label="Cloud Formation",
            topic_transition_type="same_topic",
            topic_similarity=1.0,
            previous_mode="clarify",
            is_response_to_clarify=True,
            is_response_to_probe=False,
            target_topic_confusion_average=0.58,
            target_topic_insight_average=0.32,
            target_topic_recent_events=[
                {
                    "event_type": "clarify",
                    "topic_label": "Cloud Formation",
                    "diagnosis_label": "representation_gap",
                    "clarification_goal": "Separate warm air rising from cooling to saturation.",
                    "evidence": None,
                }
            ],
        ),
        make_sample(
            input_type="clarify_response",
            current_evidence=(
                "Learner wrote after clarify mode: That helped a little. "
                "I can see why my shortcut was too broad, but when I have to apply it "
                "to a new example I still freeze."
            ),
            previous_active_topic_label="Conditional Probability",
            target_topic_label="Conditional Probability",
            topic_transition_type="same_topic",
            topic_similarity=1.0,
            previous_mode="clarify",
            is_response_to_clarify=True,
            is_response_to_probe=False,
            target_topic_confusion_average=0.72,
            target_topic_insight_average=0.60,
            target_topic_recent_events=[
                {
                    "event_type": "clarify",
                    "topic_label": "Conditional Probability",
                    "diagnosis_label": "transfer_gap",
                    "clarification_goal": "Help learner distinguish P(A) from P(A|B).",
                    "evidence": None,
                }
            ],
        ),
        make_sample(
            input_type="text_attempt",
            current_attempt_type="written_response",
            current_evidence=(
                "Written attempt: I chose the answer because it looked familiar, "
                "but honestly I do not know what signal I was supposed to use."
            ),
            previous_active_topic_label="Spanish Direct Object Pronouns",
            target_topic_label="Spanish Direct Object Pronouns",
            topic_transition_type="same_topic",
            topic_similarity=1.0,
            previous_mode="probe",
            is_response_to_clarify=False,
            is_response_to_probe=True,
            target_topic_confusion_average=0.76,
            target_topic_insight_average=0.18,
            target_topic_recent_events=[
                {
                    "event_type": "probe",
                    "topic_label": "Spanish Direct Object Pronouns",
                    "diagnosis_label": "discrimination_gap",
                    "probe_type": "discriminate",
                    "modality": "text",
                    "success_marker": "Choose pronoun based on object role, not sentence position.",
                    "misconception_being_tested": "Assuming pronoun choice follows word order only.",
                    "evidence": None,
                }
            ],
        ),
        make_sample(
            input_type="interactive_attempt",
            current_attempt_type="slider_adjustment",
            current_evidence=(
                "Slider attempt: learner adjusted the slider correctly on the first try, "
                "paused briefly, then explained that increasing the denominator lowers the fraction."
            ),
            previous_active_topic_label="Fractions",
            target_topic_label="Fractions",
            topic_transition_type="same_topic",
            topic_similarity=1.0,
            previous_mode="probe",
            is_response_to_clarify=False,
            is_response_to_probe=True,
            target_topic_confusion_average=0.22,
            target_topic_insight_average=0.74,
            target_topic_recent_events=[
                {
                    "event_type": "probe",
                    "topic_label": "Fractions",
                    "diagnosis_label": "representation_gap",
                    "probe_type": "predict",
                    "modality": "interactive",
                    "success_marker": "Predict how denominator changes size while numerator stays fixed.",
                    "evidence": None,
                }
            ],
        ),
    ]

    results, latency_ms = score_samples(model, samples)

    print(f"Scored {len(samples)} samples in {latency_ms:.2f} ms")
    print(f"Average latency per sample: {latency_ms / len(samples):.2f} ms")
    print()

    for result in results:
        print("=" * 80)
        print(f"Sample {result['index']}")
        print(f"Input type: {result['input_type']}")
        print(f"Topic transition: {result['topic_transition_type']}")
        print(f"Predicted confusion: {result['confusion']:.3f}")
        print(f"Predicted insight:   {result['insight']:.3f}")
        print()
        print(result["evidence"])
        print("=" * 80)
        print()


if __name__ == "__main__":
    main()