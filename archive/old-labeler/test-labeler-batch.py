import json
import time
import urllib.request
import urllib.error
from statistics import mean, median

LABELER_URL = "http://127.0.0.1:8002/label"

# Harder cases adapted from topic-labeling-goldens-blind-v2.ts.
# This script is for the /label helper only, so we focus on expected label behavior.
TEST_CASES = [
    # direct
    {
        "id": "blindv2-direct-001",
        "category": "direct",
        "message": "Can we go over membrane potentials?",
        "expected": "Membrane Potentials",
    },
    {
        "id": "blindv2-direct-002",
        "category": "direct",
        "message": "I would really like to learn about how llms work and why deterministic code can't solve all my problems.",
        "expected": "How LLMs Work",
    },
    {
        "id": "blindv2-direct-003",
        "category": "direct",
        "message": "Can you help me understand amortization?",
        "expected": "Amortization",
    },

    # broad_to_narrow
    {
        "id": "blindv2-focus-001",
        "category": "broad_to_narrow",
        "message": "I'm learning about neurons, but the sodium-potassium pump is the actual thing I don't get.",
        "expected": "Sodium-Potassium Pump",
        "deterministic_label": "Neurons",
        "deterministic_confidence": 0.58,
        "ambiguity_flags": ["late_focus_target"],
        "top_semantic_topic_names": ["Neurons", "Sodium-Potassium Pump"],
    },
    {
        "id": "blindv2-focus-002",
        "category": "broad_to_narrow",
        "message": "Statistics is fine overall, but standard deviation is where I keep getting lost.",
        "expected": "Standard Deviation",
        "deterministic_label": "Statistics",
        "deterministic_confidence": 0.58,
        "ambiguity_flags": ["late_focus_target"],
        "top_semantic_topic_names": ["Statistics", "Standard Deviation"],
    },
    {
        "id": "blindv2-focus-003",
        "category": "broad_to_narrow",
        "message": "The chapter is on acids and bases, but what I'm really confused about is pH.",
        "expected": "pH",
        "deterministic_label": "Acids and Bases",
        "deterministic_confidence": 0.58,
        "ambiguity_flags": ["late_focus_target"],
        "top_semantic_topic_names": ["Acids and Bases", "pH"],
    },

    # comparison
    {
        "id": "blindv2-compare-001",
        "category": "comparison",
        "message": "I keep mixing up kinetic energy and potential energy.",
        "expected": "Kinetic Energy vs Potential Energy",
        "ambiguity_flags": ["comparison_request"],
        "top_semantic_topic_names": ["Kinetic Energy", "Potential Energy"],
    },
    {
        "id": "blindv2-compare-002",
        "category": "comparison",
        "message": "Can you compare the sympathetic nervous system and the parasympathetic nervous system?",
        "expected": "Sympathetic Nervous System vs Parasympathetic Nervous System",
        "ambiguity_flags": ["comparison_request"],
        "top_semantic_topic_names": [
            "Sympathetic Nervous System",
            "Parasympathetic Nervous System",
        ],
    },
    {
        "id": "blindv2-compare-003",
        "category": "comparison",
        "message": "I keep forgetting when to use mean vs median.",
        "expected": "Mean vs Median",
        "ambiguity_flags": ["comparison_request"],
        "top_semantic_topic_names": ["Mean", "Median"],
    },

    # domain_shaping
    {
        "id": "blindv2-domain-001",
        "category": "domain_shaping",
        "message": "What does a premium mean in insurance?",
        "expected": "Insurance Premium",
        "top_semantic_topic_names": ["Insurance Premium", "Insurance"],
    },
    {
        "id": "blindv2-domain-002",
        "category": "domain_shaping",
        "message": "Can you explain how icing works in hockey?",
        "expected": "Icing in Hockey",
        "top_semantic_topic_names": ["Icing in Hockey", "Hockey"],
    },
    {
        "id": "blindv2-domain-003",
        "category": "domain_shaping",
        "message": "What is principal in a loan?",
        "expected": "Loan Principal",
        "top_semantic_topic_names": ["Loan Principal", "Loans"],
    },

    # tail_contamination
    {
        "id": "blindv2-tail-001",
        "category": "tail_contamination",
        "message": "It's really photosynthesis that I don't get yet.",
        "expected": "Photosynthesis",
    },
    {
        "id": "blindv2-tail-002",
        "category": "tail_contamination",
        "message": "Probability is not clicking for me right now.",
        "expected": "Probability",
    },
    {
        "id": "blindv2-tail-003",
        "category": "tail_contamination",
        "message": "I was fine until torque showed up.",
        "expected": "Torque",
    },
    {
        "id": "blindv2-tail-004",
        "category": "tail_contamination",
        "message": "The rules of baseball are what make the whole thing confusing.",
        "expected": "Rules of Baseball",
    },

    # noisy_natural_language
    {
        "id": "blindv2-noise-001",
        "category": "noisy_natural_language",
        "message": "ok wait can u help me w mitosis bc im still lost",
        "expected": "Mitosis",
    },
    {
        "id": "blindv2-noise-002",
        "category": "noisy_natural_language",
        "message": "idk how interest works on student loans tbh",
        "expected": "Interest on Student Loans",
        "top_semantic_topic_names": ["Interest on Student Loans", "Student Loans"],
    },
    {
        "id": "blindv2-noise-003",
        "category": "noisy_natural_language",
        "message": "your and youre still mess me up lol",
        "expected": "Your vs You're",
        "ambiguity_flags": ["comparison_request"],
        "top_semantic_topic_names": ["Your vs You're", "Your", "You're"],
    },

    # paragraph_context
    {
        "id": "blindv2-paragraph-001",
        "category": "paragraph_context",
        "message": "We started talking about memory in class, and most of it made sense. Then the hippocampus came up, and that's the part where I stopped understanding what was going on.",
        "expected": "Hippocampus",
        "deterministic_label": "Memory",
        "deterministic_confidence": 0.56,
        "ambiguity_flags": ["late_focus_target"],
        "top_semantic_topic_names": ["Memory", "Hippocampus"],
    },
    {
        "id": "blindv2-paragraph-002",
        "category": "paragraph_context",
        "message": "My textbook has a formula for momentum, and I thought I was following everything. But once that showed up, everyone else seemed ahead of me.",
        "expected": "Momentum",
        "top_semantic_topic_names": ["Momentum"],
    },
    {
        "id": "blindv2-paragraph-003",
        "category": "paragraph_context",
        "message": "At first I thought the hard part was mitosis, but after looking again I think it's really just metaphase vs anaphase that I keep blending together.",
        "expected": "Metaphase vs Anaphase",
        "deterministic_label": "Mitosis",
        "deterministic_confidence": 0.57,
        "ambiguity_flags": ["comparison_inside_broad_topic", "late_focus_target"],
        "top_semantic_topic_names": ["Mitosis", "Metaphase", "Anaphase"],
    },
    {
        "id": "blindv2-paragraph-004",
        "category": "paragraph_context",
        "message": "I can follow most of hockey, but once icing comes up, I lose track of why the play stops and what the rule is doing.",
        "expected": "Icing in Hockey",
        "deterministic_label": "Hockey",
        "deterministic_confidence": 0.59,
        "ambiguity_flags": ["late_focus_target"],
        "top_semantic_topic_names": ["Hockey", "Icing in Hockey"],
    },

    # negative_followup (simulated for label helper with active topic)
    {
        "id": "blindv2-negative-001",
        "category": "negative_followup",
        "message": "Can you say that again?",
        "expected": "Photosynthesis",
        "active_topic_name": "Photosynthesis",
        "existing_topic_names": ["Photosynthesis"],
        "deterministic_label": "Photosynthesis",
        "deterministic_confidence": 0.95,
    },
    {
        "id": "blindv2-negative-002",
        "category": "negative_followup",
        "message": "Show me another example.",
        "expected": "Momentum",
        "active_topic_name": "Momentum",
        "existing_topic_names": ["Momentum"],
        "deterministic_label": "Momentum",
        "deterministic_confidence": 0.95,
    },

    # sequence-style followups adapted for stateless helper
    {
        "id": "blindv2-seq-001-step-2",
        "category": "followup_continuity",
        "message": "I still don't get it.",
        "expected": "Photosynthesis",
        "active_topic_name": "Photosynthesis",
        "existing_topic_names": ["Photosynthesis"],
        "deterministic_label": "Photosynthesis",
        "deterministic_confidence": 0.95,
    },
    {
        "id": "blindv2-seq-002-step-2",
        "category": "followup_continuity",
        "message": "Can we go over that again, especially the scoring part?",
        "expected": "Rules of Baseball",
        "active_topic_name": "Rules of Baseball",
        "existing_topic_names": ["Rules of Baseball"],
        "deterministic_label": "Rules of Baseball",
        "deterministic_confidence": 0.95,
    },
    {
        "id": "blindv2-seq-003-step-3",
        "category": "followup_continuity",
        "message": "Wait, go back to dopamine.",
        "expected": "Dopamine",
        "active_topic_name": "Serotonin",
        "existing_topic_names": ["Dopamine", "Serotonin"],
        "deterministic_label": "Dopamine",
        "deterministic_confidence": 0.92,
        "top_semantic_topic_names": ["Dopamine", "Serotonin"],
    },
    {
        "id": "blindv2-seq-004-step-2",
        "category": "followup_continuity",
        "message": "Wait, what do you mean?",
        "expected": "Kinetic Energy vs Potential Energy",
        "active_topic_name": "Kinetic Energy vs Potential Energy",
        "existing_topic_names": ["Kinetic Energy vs Potential Energy"],
        "deterministic_label": "Kinetic Energy vs Potential Energy",
        "deterministic_confidence": 0.95,
    },
    {
        "id": "blindv2-seq-005-step-2",
        "category": "followup_continuity",
        "message": "Can we do that again?",
        "expected": "Osmosis",
        "active_topic_name": "Osmosis",
        "existing_topic_names": ["Osmosis", "Action Potentials"],
        "deterministic_label": "Osmosis",
        "deterministic_confidence": 0.95,
    },
]

def normalize(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(text.strip().lower().split())

def is_match(expected: str, actual: str | None) -> bool:
    return normalize(expected) == normalize(actual)

def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_case(case: dict) -> dict:
    payload = {
        "message": case["message"],
        "active_topic_name": case.get("active_topic_name"),
        "existing_topic_names": case.get("existing_topic_names", []),
        "deterministic_label": case.get("deterministic_label"),
        "deterministic_confidence": case.get("deterministic_confidence"),
        "ambiguity_flags": case.get("ambiguity_flags", []),
        "top_semantic_topic_names": case.get("top_semantic_topic_names", []),
    }

    start = time.perf_counter()
    try:
        response = post_json(LABELER_URL, payload)
        elapsed = time.perf_counter() - start
        best_label = response.get("best_label")

        return {
            "id": case["id"],
            "category": case["category"],
            "expected": case["expected"],
            "actual": best_label,
            "ok": is_match(case["expected"], best_label),
            "latency_s": elapsed,
            "reason_short": response.get("reason_short"),
            "raw_output": response.get("raw_output"),
            "error": None,
        }
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - start
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = str(e)
        return {
            "id": case["id"],
            "category": case["category"],
            "expected": case["expected"],
            "actual": None,
            "ok": False,
            "latency_s": elapsed,
            "reason_short": None,
            "raw_output": None,
            "error": f"HTTP {e.code}: {body}",
        }
    except Exception as e:
        elapsed = time.perf_counter() - start
        return {
            "id": case["id"],
            "category": case["category"],
            "expected": case["expected"],
            "actual": None,
            "ok": False,
            "latency_s": elapsed,
            "reason_short": None,
            "raw_output": None,
            "error": str(e),
        }

def print_summary(results: list[dict]) -> None:
    successful = [r for r in results if r["error"] is None]
    latencies = [r["latency_s"] for r in successful]
    passes = sum(1 for r in results if r["ok"])
    fails = len(results) - passes

    print("=" * 72)
    print("SUMMARY")
    print("=" * 72)
    print(f"Total cases:    {len(results)}")
    print(f"Passed:         {passes}")
    print(f"Failed:         {fails}")

    if latencies:
        print(f"Avg latency:    {mean(latencies):.2f}s")
        print(f"Median latency: {median(latencies):.2f}s")
        print(f"Min latency:    {min(latencies):.2f}s")
        print(f"Max latency:    {max(latencies):.2f}s")

    print()
    print("Category summary:")
    categories = sorted(set(r["category"] for r in results))
    for category in categories:
        subset = [r for r in results if r["category"] == category]
        passed = sum(1 for r in subset if r["ok"])
        print(f"  {category:<24} {passed}/{len(subset)}")

    print()
    print("Failures:")
    for r in results:
        if not r["ok"]:
            print(f"- {r['id']} [{r['category']}]")
            print(f"  expected: {r['expected']}")
            print(f"  actual:   {r['actual']}")
            if r["reason_short"]:
                print(f"  reason:   {r['reason_short']}")
            if r["raw_output"]:
                print(f"  raw:      {r['raw_output']}")
            if r["error"]:
                print(f"  error:    {r['error']}")
            print()

def main():
    print(f"Testing {len(TEST_CASES)} harder blind-v2-style cases against {LABELER_URL}")
    print()

    results = []
    for i, case in enumerate(TEST_CASES, start=1):
        print(f"[{i:02d}/{len(TEST_CASES)}] {case['id']} [{case['category']}]")
        result = run_case(case)
        results.append(result)

        status = "PASS" if result["ok"] else "FAIL"
        print(f"  {status}")
        print(f"  expected: {result['expected']}")
        print(f"  actual:   {result['actual']}")
        print(f"  latency:  {result['latency_s']:.2f}s")
        if result["reason_short"]:
            print(f"  reason:   {result['reason_short']}")
        if result["raw_output"]:
            print(f"  raw:      {result['raw_output']}")
        if result["error"]:
            print(f"  error:    {result['error']}")
        print()

    print_summary(results)

if __name__ == "__main__":
    main()