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
    / "v2"
    / "reference-type-classifier"
    / "topic_reference_type_classifier.joblib"
)

LABEL_GENERATOR_MODEL_DIR = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v2"
    / "label-generator-t5-small"
)

MAX_INPUT_LENGTH = 512
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
    active_topic_name = data.get("active_topic_name") or "NONE"
    current_topic_names = data.get("current_topic_names") or []
    previous_user_messages = data.get("previous_user_messages") or []

    return "\n".join(
        [
            "Task: Extract the best concise topic label from the user's message.",
            "",
            f"message: {message}",
            f"active_topic_name: {active_topic_name}",
            f"current_topic_names: {' | '.join(current_topic_names)}",
            f"previous_user_messages: {' | '.join(previous_user_messages)}",
            "",
            "Return only the topic label.",
        ]
    )


def load_models():
    if not REFERENCE_TYPE_MODEL_PATH.exists():
        raise FileNotFoundError(f"Missing reference-type model: {REFERENCE_TYPE_MODEL_PATH}")

    if not LABEL_GENERATOR_MODEL_DIR.exists():
        raise FileNotFoundError(f"Missing T5 label-generator model: {LABEL_GENERATOR_MODEL_DIR}")

    print("Loading reference-type classifier...")
    reference_type_classifier = joblib.load(REFERENCE_TYPE_MODEL_PATH)

    print("Loading T5 label generator...")
    tokenizer = AutoTokenizer.from_pretrained(LABEL_GENERATOR_MODEL_DIR)
    label_generator = AutoModelForSeq2SeqLM.from_pretrained(LABEL_GENERATOR_MODEL_DIR)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    label_generator.to(device)
    label_generator.eval()

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
    }


def run_examples():
    reference_type_classifier, tokenizer, label_generator, device = load_models()

    examples: list[TopicLabelInput] = [
        {
            "message": "I don't understand electricity. I know it powers lights but I don't get where it comes from.",
            "active_topic_name": "Dopamine",
            "current_topic_names": ["Dopamine", "Osmosis", "Profit Margin"],
            "previous_user_messages": [],
        },
        {
            "message": "I still don't get that part.",
            "active_topic_name": "Electricity",
            "current_topic_names": ["Electricity", "Osmosis", "Profit Margin"],
            "previous_user_messages": [
                "I don't understand how electricity can come from so many sources.",
                "The wind and battery example helped a little.",
            ],
        },
        {
            "message": "Can we go back to dopamine? I think I left that one too early.",
            "active_topic_name": "Electricity",
            "current_topic_names": ["Electricity", "Dopamine", "Osmosis", "Action Potentials"],
            "previous_user_messages": [
                "We switched to electricity for a bit.",
                "The generator example helped.",
            ],
        },
        {
            "message": "I don't even know what I'm confused about. I just feel stuck.",
            "active_topic_name": "Pragmatics",
            "current_topic_names": ["Pragmatics", "Embeddings", "Profit Margin"],
            "previous_user_messages": [
                "Can we stay on pragmatics for a bit?",
                "The example made sense while I was reading it.",
            ],
        },
        {
            "message": "I don't want to switch topics accidentally, but I think I might be asking a different question.",
            "active_topic_name": "Embeddings",
            "current_topic_names": ["Embeddings", "Vector Search", "Neural Networks"],
            "previous_user_messages": [
                "Can we stay on embeddings?",
                "The idea of comparing meanings kind of makes sense.",
            ],
        },
        {
            "message": "Actually I think the thing I need now is circuit breakers, not electricity in general.",
            "active_topic_name": "Electricity",
            "current_topic_names": ["Electricity", "Voltage vs Current", "Resistance"],
            "previous_user_messages": [
                "Electricity as a broad idea helped.",
                "The part about charges moving made some sense.",
            ],
        },
    ]

    for index, example in enumerate(examples, start=1):
        prediction = predict_topic_label(
            example,
            reference_type_classifier,
            tokenizer,
            label_generator,
            device,
        )

        print("=" * 80)
        print(f"Example {index}")
        print("")
        print("Input:")
        print(json.dumps(example, indent=2, ensure_ascii=False))
        print("")
        print("Prediction:")
        print(json.dumps(prediction, indent=2, ensure_ascii=False))
        print("")


def run_interactive():
    reference_type_classifier, tokenizer, label_generator, device = load_models()

    print("Interactive topic labeler V2 test.")
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

        print(json.dumps(prediction, indent=2, ensure_ascii=False))
        print("")

        previous_user_messages.append(message)


if __name__ == "__main__":
    # Start with fixed examples so we can verify the pipeline quickly.
    run_examples()

    # Uncomment this later if you want manual typing mode.
    # run_interactive()