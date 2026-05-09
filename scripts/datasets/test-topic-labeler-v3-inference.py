import json
from pathlib import Path
from typing import Any

import joblib
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


PROJECT_ROOT = Path.cwd()

REFERENCE_TYPE_MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v3"
    / "reference-type-classifier"
    / "topic_reference_type_classifier.joblib"
)

LABEL_GENERATOR_MODEL_DIR = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v3"
    / "label-generator-t5-small-message-only"
)

MAX_INPUT_LENGTH = 384
MAX_LABEL_TOKENS = 32

TopicLabelInput = dict[str, Any]


def format_for_reference_type_classifier(data: TopicLabelInput) -> str:
    message = data.get("message") or ""
    active_topic_name = data.get("active_topic_name") or "NONE"
    current_topic_names = data.get("current_topic_names") or []
    previous_user_messages = data.get("previous_user_messages") or []

    return "\n".join(
        [
            f"message: {message}",
            f"active_topic_name: {active_topic_name}",
            f"current_topic_names: {' | '.join(current_topic_names)}",
            f"previous_user_messages: {' | '.join(previous_user_messages)}",
        ]
    )


def format_for_label_generator(data: TopicLabelInput) -> str:
    message = data.get("message") or ""

    return "\n".join(
        [
            "Task: Extract the best concise topic label from the user's message.",
            "",
            f"message: {message}",
            "",
            "Return only the topic label.",
        ]
    )


def load_models():
    if not REFERENCE_TYPE_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Missing reference-type model: {REFERENCE_TYPE_MODEL_PATH}"
        )

    if not LABEL_GENERATOR_MODEL_DIR.exists():
        raise FileNotFoundError(
            f"Missing T5 label-generator model: {LABEL_GENERATOR_MODEL_DIR}"
        )

    print("Loading V3/V3.1 reference-type classifier...")
    reference_type_classifier = joblib.load(REFERENCE_TYPE_MODEL_PATH)

    print("Loading V3 message-only T5 label generator...")
    tokenizer = AutoTokenizer.from_pretrained(LABEL_GENERATOR_MODEL_DIR)
    label_generator = AutoModelForSeq2SeqLM.from_pretrained(LABEL_GENERATOR_MODEL_DIR)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    label_generator.to(device)
    label_generator.eval()

    print(f"Reference classifier path: {REFERENCE_TYPE_MODEL_PATH}")
    print(f"Label generator path:      {LABEL_GENERATOR_MODEL_DIR}")
    print(f"Device: {device}")
    print("Models loaded.")
    print("")

    return reference_type_classifier, tokenizer, label_generator, device


def predict_topic_label(
    data: TopicLabelInput,
    reference_type_classifier,
    tokenizer,
    label_generator,
    device,
) -> dict[str, Any]:
    classifier_input = format_for_reference_type_classifier(data)

    topic_reference_type = reference_type_classifier.predict([classifier_input])[0]

    extracted_label = None

    if topic_reference_type == "explicit_topic_reference":
        generator_input = format_for_label_generator(data)

        encoded = tokenizer(
            generator_input,
            return_tensors="pt",
            max_length=MAX_INPUT_LENGTH,
            truncation=True,
        )

        encoded = {key: value.to(device) for key, value in encoded.items()}

        with torch.no_grad():
            generated = label_generator.generate(
                **encoded,
                max_new_tokens=MAX_LABEL_TOKENS,
                num_beams=4,
                early_stopping=True,
            )

        extracted_label = tokenizer.decode(
            generated[0],
            skip_special_tokens=True,
        ).strip()

        if not extracted_label:
            extracted_label = None

    return {
        "topic_reference_type": topic_reference_type,
        "extracted_label": extracted_label,
        "classifier_input": classifier_input,
    }


def expected_case(
    name: str,
    data: TopicLabelInput,
    expected_reference_type: str,
    expected_label: str | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "data": data,
        "expected_reference_type": expected_reference_type,
        "expected_label": expected_label,
    }


def normalize_label(label: str | None) -> str:
    if not label:
        return ""

    return (
        label.lower()
        .replace("’", "'")
        .replace("-", " ")
        .replace("/", " ")
        .replace("_", " ")
        .replace(" vs. ", " vs ")
        .replace(" versus ", " vs ")
        .strip()
    )


def label_matches(expected: str | None, predicted: str | None) -> bool:
    if expected is None:
        return predicted is None

    expected_norm = normalize_label(expected)
    predicted_norm = normalize_label(predicted)

    if expected_norm == predicted_norm:
        return True

    if expected_norm and predicted_norm:
        return expected_norm in predicted_norm or predicted_norm in expected_norm

    return False


def run_examples():
    reference_type_classifier, tokenizer, label_generator, device = load_models()

    cases = [
        # ---------------------------------------------------------------------
        # Exact failure cases from the app logs / current debugging thread.
        # ---------------------------------------------------------------------
        expected_case(
            name="FAILURE CASE — one active topic, polite learn-about request",
            data={
                "message": "If there is a way to learn about trigonometry in an easy way, I'd love to know.",
                "active_topic_name": "Actual Concept of Light",
                "current_topic_names": ["Actual Concept of Light"],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Trigonometry",
        ),
        expected_case(
            name="FAILURE CASE — cold start wave-particle confusion",
            data={
                "message": "The actual concept of light being a wave and a particle doesn't make sense to me. Like how can it be both?",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Light as a Wave and Particle",
        ),
        expected_case(
            name="FAILURE CASE — cold start simple engines confusion",
            data={
                "message": "I am confused about engines.",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Engines",
        ),

        # ---------------------------------------------------------------------
        # Cold-start explicit-topic examples.
        # ---------------------------------------------------------------------
        expected_case(
            name="cold start — direct learn-about",
            data={
                "message": "I want to learn about dopamine.",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Dopamine",
        ),
        expected_case(
            name="cold start — question-form concept",
            data={
                "message": "What is osmosis?",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Osmosis",
        ),
        expected_case(
            name="cold start — indirect start-learning request",
            data={
                "message": "Where would someone even start with derivatives?",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Derivatives",
        ),

        # ---------------------------------------------------------------------
        # Mid-session explicit-topic shifts.
        # ---------------------------------------------------------------------
        expected_case(
            name="one active topic — explicit switch",
            data={
                "message": "Actually, I want to switch to trigonometry.",
                "active_topic_name": "Actual Concept of Light",
                "current_topic_names": ["Actual Concept of Light"],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Trigonometry",
        ),
        expected_case(
            name="few topics — new explicit topic",
            data={
                "message": "Could we move from light to electricity?",
                "active_topic_name": "Actual Concept of Light",
                "current_topic_names": [
                    "Actual Concept of Light",
                    "Dopamine",
                    "Osmosis",
                ],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Electricity",
        ),
        expected_case(
            name="many topics — explicit new topic",
            data={
                "message": "This helped, but now I want to understand reinforcement learning.",
                "active_topic_name": "Trigonometry",
                "current_topic_names": [
                    "Trigonometry",
                    "Dopamine",
                    "Osmosis",
                    "Actual Concept of Light",
                    "Electricity",
                    "Derivatives",
                ],
                "previous_user_messages": [
                    "Can you help me understand sine and cosine?",
                    "The triangle example helped.",
                ],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Reinforcement Learning",
        ),

        # ---------------------------------------------------------------------
        # Active-topic followups: should NOT trigger label generation.
        # ---------------------------------------------------------------------
        expected_case(
            name="active followup — vague still confused",
            data={
                "message": "I still don't get it.",
                "active_topic_name": "Electricity",
                "current_topic_names": ["Electricity"],
                "previous_user_messages": [
                    "Can you explain electricity?",
                    "The charge-flow part is confusing.",
                ],
            },
            expected_reference_type="active_topic_reference",
            expected_label=None,
        ),
        expected_case(
            name="active followup — explain easier",
            data={
                "message": "Can you explain that easier?",
                "active_topic_name": "Trigonometry",
                "current_topic_names": ["Trigonometry"],
                "previous_user_messages": [
                    "I want to learn about trigonometry.",
                    "The unit circle explanation was a bit much.",
                ],
            },
            expected_reference_type="active_topic_reference",
            expected_label=None,
        ),
        expected_case(
            name="active followup — what would that look like",
            data={
                "message": "What would that look like?",
                "active_topic_name": "Light as a Wave and Particle",
                "current_topic_names": ["Light as a Wave and Particle"],
                "previous_user_messages": [
                    "I don't understand light being both a wave and a particle.",
                ],
            },
            expected_reference_type="active_topic_reference",
            expected_label=None,
        ),

        # ---------------------------------------------------------------------
        # Cold-start no-topic examples: should NOT create.
        # ---------------------------------------------------------------------
        expected_case(
            name="cold start — no concrete topic",
            data={
                "message": "I don't know what I want to learn.",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="no_topic",
            expected_label=None,
        ),
        expected_case(
            name="cold start — vague stuck",
            data={
                "message": "I'm just confused and I can't name the thing.",
                "active_topic_name": None,
                "current_topic_names": [],
                "previous_user_messages": [],
            },
            expected_reference_type="no_topic",
            expected_label=None,
        ),

        # ---------------------------------------------------------------------
        # Original sanity checks from the old script.
        # ---------------------------------------------------------------------
        expected_case(
            name="original sanity — explicit electricity",
            data={
                "message": "I don't understand electricity. I know it powers lights but I don't get where it comes from.",
                "active_topic_name": "Dopamine",
                "current_topic_names": ["Dopamine", "Osmosis", "Profit Margin"],
                "previous_user_messages": [],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Electricity",
        ),
        expected_case(
            name="original sanity — return to existing dopamine",
            data={
                "message": "Can we go back to dopamine? I think I left that one too early.",
                "active_topic_name": "Electricity",
                "current_topic_names": [
                    "Electricity",
                    "Dopamine",
                    "Osmosis",
                    "Action Potentials",
                ],
                "previous_user_messages": [
                    "We switched to electricity for a bit.",
                    "The generator example helped.",
                ],
            },
            expected_reference_type="explicit_topic_reference",
            expected_label="Dopamine",
        ),
        expected_case(
            name="original sanity — unclear possible switch",
            data={
                "message": "I don't want to switch topics accidentally, but I think I might be asking a different question.",
                "active_topic_name": "Embeddings",
                "current_topic_names": ["Embeddings", "Vector Search", "Neural Networks"],
                "previous_user_messages": [
                    "Can we stay on embeddings?",
                    "The idea of comparing meanings kind of makes sense.",
                ],
            },
            expected_reference_type="unclear_topic",
            expected_label=None,
        ),
    ]

    passed = 0
    failed = 0
    classifier_failed = 0
    label_failed = 0

    for index, case in enumerate(cases, start=1):
        prediction = predict_topic_label(
            case["data"],
            reference_type_classifier,
            tokenizer,
            label_generator,
            device,
        )

        predicted_reference_type = prediction["topic_reference_type"]
        predicted_label = prediction["extracted_label"]

        reference_ok = predicted_reference_type == case["expected_reference_type"]
        label_ok = label_matches(case["expected_label"], predicted_label)

        case_ok = reference_ok and label_ok

        if case_ok:
            passed += 1
        else:
            failed += 1
            if not reference_ok:
                classifier_failed += 1
            elif not label_ok:
                label_failed += 1

        print("=" * 96)
        print(f"Example {index}: {case['name']}")
        print("")
        print("Input:")
        print(json.dumps(case["data"], indent=2, ensure_ascii=False))
        print("")
        print("Expected:")
        print(
            json.dumps(
                {
                    "topic_reference_type": case["expected_reference_type"],
                    "extracted_label": case["expected_label"],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        print("")
        print("Prediction:")
        print(
            json.dumps(
                {
                    "topic_reference_type": predicted_reference_type,
                    "extracted_label": predicted_label,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        print("")
        print(
            "Result:",
            "PASS"
            if case_ok
            else (
                "FAIL_CLASSIFIER"
                if not reference_ok
                else "FAIL_LABEL_GENERATOR"
            ),
        )
        print("")

    print("=" * 96)
    print("Summary")
    print("")
    print(f"Total cases:          {len(cases)}")
    print(f"Passed:               {passed}")
    print(f"Failed:               {failed}")
    print(f"Classifier failures:  {classifier_failed}")
    print(f"Label failures:       {label_failed}")
    print("")


def run_interactive():
    reference_type_classifier, tokenizer, label_generator, device = load_models()

    print("Interactive topic labeler V3/V3.1 test.")
    print("Press Enter with an empty message to quit.")
    print("")

    active_topic_name = input("active_topic_name, or blank for none: ").strip() or None

    raw_current_topics = input(
        "current_topic_names separated by commas, or blank for none: "
    ).strip()

    current_topic_names = [
        topic.strip()
        for topic in raw_current_topics.split(",")
        if topic.strip()
    ]

    previous_user_messages: list[str] = []

    print("")
    print("Now enter user messages.")
    print("")

    while True:
        message = input("message: ").strip()

        if not message:
            break

        data = {
            "message": message,
            "active_topic_name": active_topic_name,
            "current_topic_names": current_topic_names,
            "previous_user_messages": previous_user_messages[-5:],
        }

        prediction = predict_topic_label(
            data,
            reference_type_classifier,
            tokenizer,
            label_generator,
            device,
        )

        print("")
        print("Prediction:")
        print(
            json.dumps(
                {
                    "topic_reference_type": prediction["topic_reference_type"],
                    "extracted_label": prediction["extracted_label"],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        print("")

        previous_user_messages.append(message)


if __name__ == "__main__":
    run_examples()

    # Uncomment this if you want manual typing mode after fixed examples.
    # run_interactive()