import json
from pathlib import Path
from typing import Any

import torch
from datasets import Dataset
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
)


PROJECT_ROOT = Path.cwd()

DATASET_DIR = PROJECT_ROOT / "datasets" / "topic-labeling-dataset" / "v2"
LABEL_GENERATOR_DIR = DATASET_DIR / "label-generator"

TRAIN_PATH = LABEL_GENERATOR_DIR / "train.jsonl"
VALIDATION_PATH = LABEL_GENERATOR_DIR / "validation.jsonl"
TEST_PATH = LABEL_GENERATOR_DIR / "test.jsonl"

MODEL_NAME = "google/flan-t5-small"

MODEL_OUTPUT_DIR = (
    PROJECT_ROOT
    / "models"
    / "topic-labeler"
    / "v2"
    / "label-generator-t5-small"
)

PREDICTIONS_DIR = LABEL_GENERATOR_DIR / "predictions"
PREDICTIONS_PATH = PREDICTIONS_DIR / "label_generator_predictions_test_t5_small.jsonl"

MAX_INPUT_LENGTH = 512
MAX_TARGET_LENGTH = 32


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")

    rows: list[dict[str, Any]] = []

    with path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue

            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}, line {line_number}") from exc

    return rows


def to_hf_dataset(records: list[dict[str, Any]]) -> Dataset:
    return Dataset.from_dict(
        {
            "input_text": [record["input_text"] for record in records],
            "target_text": [record["target_text"] for record in records],
            "id": [record["id"] for record in records],
        }
    )


def main() -> None:
    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading records...")
    train_records = read_jsonl(TRAIN_PATH)
    validation_records = read_jsonl(VALIDATION_PATH)
    test_records = read_jsonl(TEST_PATH)

    train_dataset = to_hf_dataset(train_records)
    validation_dataset = to_hf_dataset(validation_records)

    print(f"Train rows:      {len(train_dataset)}")
    print(f"Validation rows: {len(validation_dataset)}")
    print(f"Test rows:       {len(test_records)}")
    print("")

    print(f"Loading model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)

    def preprocess(batch: dict[str, list[str]]) -> dict[str, Any]:
        model_inputs = tokenizer(
            batch["input_text"],
            max_length=MAX_INPUT_LENGTH,
            truncation=True,
        )

        labels = tokenizer(
            text_target=batch["target_text"],
            max_length=MAX_TARGET_LENGTH,
            truncation=True,
        )

        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    print("Tokenizing...")
    tokenized_train = train_dataset.map(
        preprocess,
        batched=True,
        remove_columns=train_dataset.column_names,
    )

    tokenized_validation = validation_dataset.map(
        preprocess,
        batched=True,
        remove_columns=validation_dataset.column_names,
    )

    data_collator = DataCollatorForSeq2Seq(
        tokenizer=tokenizer,
        model=model,
    )

    use_cuda = torch.cuda.is_available()
    print(f"CUDA available: {use_cuda}")
    print("")

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(MODEL_OUTPUT_DIR),
        num_train_epochs=4,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        gradient_accumulation_steps=4,
        learning_rate=5e-5,
        weight_decay=0.01,
        predict_with_generate=True,
        generation_max_length=MAX_TARGET_LENGTH,
        logging_steps=25,
        save_strategy="epoch",
        eval_strategy="epoch",
        save_total_limit=2,
        fp16=use_cuda,
        report_to=[],
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_train,
        eval_dataset=tokenized_validation,
        processing_class=tokenizer,
        data_collator=data_collator,
    )

    print("Training local text-to-text label generator...")
    trainer.train()

    print("Saving final model...")
    trainer.save_model(str(MODEL_OUTPUT_DIR))
    tokenizer.save_pretrained(str(MODEL_OUTPUT_DIR))

    print("Generating predictions for test split...")
    model.eval()

    predictions: list[dict[str, str]] = []

    for index, record in enumerate(test_records, start=1):
        input_text = record["input_text"]

        encoded = tokenizer(
            input_text,
            return_tensors="pt",
            max_length=MAX_INPUT_LENGTH,
            truncation=True,
        )

        encoded = {key: value.to(model.device) for key, value in encoded.items()}

        with torch.no_grad():
            generated = model.generate(
                **encoded,
                max_new_tokens=MAX_TARGET_LENGTH,
                num_beams=4,
                early_stopping=True,
            )

        predicted_label = tokenizer.decode(
            generated[0],
            skip_special_tokens=True,
        ).strip()

        predictions.append(
            {
                "id": record["id"],
                "predicted_label": predicted_label,
            }
        )

        if index % 25 == 0:
            print(f"Generated {index}/{len(test_records)} predictions...")

    with PREDICTIONS_PATH.open("w", encoding="utf-8") as f:
        for prediction in predictions:
            f.write(json.dumps(prediction, ensure_ascii=False) + "\n")

    print("")
    print("Done.")
    print(f"Saved model:       {MODEL_OUTPUT_DIR}")
    print(f"Saved predictions: {PREDICTIONS_PATH}")
    print("")
    print("Next, copy the T5 predictions into the evaluator's expected filename:")
    print(
        "Copy-Item "
        "datasets/topic-labeling-dataset/v2/label-generator/predictions/label_generator_predictions_test_t5_small.jsonl "
        "datasets/topic-labeling-dataset/v2/label-generator/predictions/label_generator_predictions_test.jsonl"
    )
    print("")
    print("Then evaluate with:")
    print("python scripts/datasets/evaluate-topic-label-generator-v2.py")


if __name__ == "__main__":
    main()