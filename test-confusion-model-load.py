from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

MODEL_DIR = r"C:\Users\willc\projects\MyWay\v1\models\confusion-model\checkpoint-4000"
TOKENIZER_NAME = "allenai/longformer-base-4096"

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)

print("Loading model...")
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.eval()

text = "I kind of understand dopamine, but I don't get why it matters for motivation."

inputs = tokenizer(
    text,
    truncation=True,
    padding=True,
    max_length=1024,
    return_tensors="pt",
)

with torch.no_grad():
    outputs = model(**inputs)
    logits = outputs.logits.squeeze().tolist()

print("Raw logits:", logits)
print("Done.")
