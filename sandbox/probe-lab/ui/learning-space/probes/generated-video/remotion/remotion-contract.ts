export type MyWayRemotionBuildMode = "known_template" | "primitive_scene_graph";

export type MyWayPrimitiveShape = {
  id: string;
  kind: "card" | "arrow" | "bubble" | "highlight" | "formula";
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  tone?: "purple" | "blue" | "green" | "amber" | "white";
};

export type MyWayRemotionScene = {
  id: string;
  title: string;
  caption: string;
  durationInFrames: number;
  visualKind:
    | "saddle_surface"
    | "claim_evidence"
    | "equation_balance"
    | "transfer_flow"
    | "sequence_steps"
    | "primitive_scene_graph";
  visualNotes: string;
  shapes?: MyWayPrimitiveShape[];
};

export type MyWayRemotionContract = {
  schema_version: "myway_remotion_animation_contract_v0";
  contract_id: string;
  title: string;
  learner_signal: string;
  diagnosis_guess: string;
  learning_goal: string;
  build_mode: MyWayRemotionBuildMode;
  format: {
    aspect_ratio: "16:9";
    width: number;
    height: number;
    fps: number;
  };
  remotion: {
    composition_id: "MyWayGeneratedVideo";
    model_writes_code: false;
    input_props_summary: string;
  };
  scenes: MyWayRemotionScene[];
  checkpoint: {
    prompt: string;
    expected_idea: string;
  };
  safety_notes: string[];
};

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_SIGNAL =
  "I do not get why x^2 - y^2 makes a saddle. I thought both squared parts should go up.";

export const REMOTION_SAMPLE_SIGNALS = [
  DEFAULT_SIGNAL,
  "I keep mixing up claim and evidence. I choose the sentence with facts as the claim.",
  "I can solve equation steps when someone shows me, but I do not know why doing the same thing to both sides keeps it balanced.",
  "I understand oxidation and reduction words, but I keep reversing who loses electrons and who gains them.",
  "I know the steps, but I keep putting them in the wrong order.",
  "I wrote the right answer, but I think I guessed. I cannot explain why it works.",
];

function includesAny(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function cleanSignal(signal: string) {
  return signal.trim() || DEFAULT_SIGNAL;
}

function seconds(value: number) {
  return Math.round(value * DEFAULT_FPS);
}

function keywordTitle(signal: string) {
  if (includesAny(signal, ["saddle", "x^2", "x²", "y^2", "y²"])) {
    return "Why the saddle bends two ways";
  }
  if (includesAny(signal, ["claim", "evidence"])) {
    return "Claim vs evidence";
  }
  if (includesAny(signal, ["equation", "both sides", "balance", "solve"])) {
    return "Why both sides stay balanced";
  }
  if (includesAny(signal, ["oxidation", "reduction", "electron", "electrons"])) {
    return "Tracking who gives and who receives";
  }
  if (includesAny(signal, ["order", "sequence", "steps", "first", "last"])) {
    return "Putting the steps in order";
  }
  return "Make the hidden structure visible";
}

function getKeywordShapes(signal: string): MyWayPrimitiveShape[] {
  const words = signal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .filter((word, index, all) => all.indexOf(word) === index)
    .slice(0, 5);

  const usefulWords = words.length >= 3 ? words : ["idea", "example", "reason"];

  return usefulWords.map((word, index) => ({
    id: `keyword_${word}`,
    kind: "card",
    label: word,
    x: 132 + index * 165,
    y: 214 + (index % 2) * 78,
    width: 132,
    height: 66,
    tone: index % 2 === 0 ? "purple" : "blue",
  }));
}

function primitiveSceneGraphScenes(signal: string): MyWayRemotionScene[] {
  return [
    {
      id: "signal_to_pieces",
      title: "Turn the message into pieces",
      caption: "MyWay pulls out the words and relationships that seem to matter.",
      durationInFrames: seconds(5),
      visualKind: "primitive_scene_graph",
      visualNotes: "Keyword cards appear from the learner signal.",
      shapes: getKeywordShapes(signal),
    },
    {
      id: "sort_pieces",
      title: "Sort the pieces",
      caption: "Then the animation separates what the learner knows from the missing link.",
      durationInFrames: seconds(6),
      visualKind: "primitive_scene_graph",
      visualNotes: "Known, mixed up, and next check are connected with arrows.",
      shapes: [
        { id: "known", kind: "card", label: "knows", x: 150, y: 250, width: 190, height: 82, tone: "green" },
        { id: "mixed", kind: "card", label: "mixed up", x: 545, y: 250, width: 210, height: 82, tone: "amber" },
        { id: "check", kind: "card", label: "next check", x: 955, y: 250, width: 210, height: 82, tone: "purple" },
        { id: "arrow1", kind: "arrow", label: "", x: 368, y: 291, width: 150, tone: "white" },
        { id: "arrow2", kind: "arrow", label: "", x: 784, y: 291, width: 145, tone: "white" },
      ],
    },
    {
      id: "target_gap",
      title: "Explain only the stuck part",
      caption: "The video should not reteach everything. It should zoom in on the exact missing link.",
      durationInFrames: seconds(6),
      visualKind: "primitive_scene_graph",
      visualNotes: "A highlight focuses the gap, then moves toward try again.",
      shapes: [
        { id: "whole", kind: "card", label: "whole topic", x: 160, y: 262, width: 210, height: 82, tone: "blue" },
        { id: "gap", kind: "highlight", label: "stuck link", x: 516, y: 218, width: 246, height: 160, tone: "purple" },
        { id: "again", kind: "card", label: "try again", x: 934, y: 262, width: 205, height: 82, tone: "green" },
        { id: "arrow3", kind: "arrow", label: "", x: 394, y: 303, width: 106, tone: "white" },
        { id: "arrow4", kind: "arrow", label: "", x: 790, y: 303, width: 118, tone: "white" },
      ],
    },
    {
      id: "checkpoint",
      title: "Checkpoint",
      caption: "A useful generated video ends by checking the one thing it tried to fix.",
      durationInFrames: seconds(5),
      visualKind: "primitive_scene_graph",
      visualNotes: "Question bubble replaces passive watching.",
      shapes: [
        { id: "question", kind: "bubble", label: "Can you explain the missing link?", x: 360, y: 232, width: 560, height: 130, tone: "purple" },
      ],
    },
  ];
}

function knownTemplateScenes(signal: string): {
  scenes: MyWayRemotionScene[];
  diagnosis_guess: string;
  learning_goal: string;
  checkpoint: MyWayRemotionContract["checkpoint"];
} {
  if (includesAny(signal, ["saddle", "x^2", "x²", "y^2", "y²"])) {
    return {
      diagnosis_guess:
        "The learner is treating a two-variable surface like it should bend the same way in every direction.",
      learning_goal:
        "Show that x² bends one direction upward while -y² flips the other direction downward.",
      scenes: [
        { id: "hook", title: "The mismatch", caption: "You expected one kind of curve. A saddle is two curves crossing.", durationInFrames: seconds(4), visualKind: "saddle_surface", visualNotes: "Show the grid beginning to bend." },
        { id: "x", title: "Left to right", caption: "The x² part bends upward like a bowl slice.", durationInFrames: seconds(5), visualKind: "saddle_surface", visualNotes: "Highlight the upward direction." },
        { id: "y", title: "Front to back", caption: "The minus sign flips the y² direction downward.", durationInFrames: seconds(5), visualKind: "saddle_surface", visualNotes: "Highlight the downward direction." },
        { id: "combine", title: "Both at once", caption: "Up one way and down the other way creates the saddle.", durationInFrames: seconds(7), visualKind: "saddle_surface", visualNotes: "Show the full saddle surface." },
      ],
      checkpoint: {
        prompt: "For z = x² - y², what does the minus sign do to the y direction?",
        expected_idea: "It flips that direction downward, so the surface rises one way and falls the other way.",
      },
    };
  }

  if (includesAny(signal, ["claim", "evidence"])) {
    return {
      diagnosis_guess: "The learner is using fact-like wording as the signal for claim instead of asking what role the sentence plays.",
      learning_goal: "Show that a claim is the point being made, while evidence supports that point.",
      scenes: [
        { id: "two_cards", title: "Two different jobs", caption: "A claim says the point. Evidence supports the point.", durationInFrames: seconds(5), visualKind: "claim_evidence", visualNotes: "Show claim and evidence cards." },
        { id: "mixup", title: "The common mix-up", caption: "A fact is not automatically the claim. Ask what job the sentence is doing.", durationInFrames: seconds(6), visualKind: "claim_evidence", visualNotes: "Swap wrong placement into correct placement." },
        { id: "check", title: "Checkpoint", caption: "Which sentence is making the point, and which one supports it?", durationInFrames: seconds(5), visualKind: "claim_evidence", visualNotes: "Pause with a question." },
      ],
      checkpoint: {
        prompt: "How can you tell whether a sentence is a claim or evidence?",
        expected_idea: "The claim is the point being made; evidence supports that point.",
      },
    };
  }

  if (includesAny(signal, ["equation", "both sides", "balance", "solve"])) {
    return {
      diagnosis_guess: "The learner can follow solving steps but does not yet see why the equality is preserved.",
      learning_goal: "Show equation solving as keeping a balance level by doing the same move to both sides.",
      scenes: [
        { id: "balanced", title: "Equal means balanced", caption: "Both sides start level because they are equal.", durationInFrames: seconds(5), visualKind: "equation_balance", visualNotes: "Show a balanced scale." },
        { id: "same", title: "Same move", caption: "Doing the same thing to both sides keeps the balance level.", durationInFrames: seconds(6), visualKind: "equation_balance", visualNotes: "Remove equal blocks from both sides." },
        { id: "one", title: "One-sided move", caption: "Changing one side only breaks the balance.", durationInFrames: seconds(5), visualKind: "equation_balance", visualNotes: "One pan drops." },
      ],
      checkpoint: {
        prompt: "Why does doing the same operation to both sides keep the equation true?",
        expected_idea: "Both sides change equally, so the equality is preserved.",
      },
    };
  }

  if (includesAny(signal, ["oxidation", "reduction", "electron", "electrons"])) {
    return {
      diagnosis_guess: "The learner is reversing who loses electrons and who gains them.",
      learning_goal: "Make electron movement visible as a transfer from giver to receiver.",
      scenes: [
        { id: "track", title: "Track the item", caption: "Treat the electron like the thing being handed off.", durationInFrames: seconds(5), visualKind: "transfer_flow", visualNotes: "Show one dot between two cards." },
        { id: "loses", title: "The giver loses", caption: "The side that gives the electron is losing it.", durationInFrames: seconds(5), visualKind: "transfer_flow", visualNotes: "Move the dot away from donor." },
        { id: "gains", title: "The receiver gains", caption: "The side that receives the electron is gaining it.", durationInFrames: seconds(5), visualKind: "transfer_flow", visualNotes: "Dot lands on receiver." },
      ],
      checkpoint: {
        prompt: "If one side gives away an electron, did it lose or gain electrons?",
        expected_idea: "It lost electrons; the receiver gained them.",
      },
    };
  }

  if (includesAny(signal, ["order", "sequence", "steps", "first", "last"])) {
    return {
      diagnosis_guess: "The learner knows the pieces but is missing the order relationship between them.",
      learning_goal: "Make each step depend on the step before it.",
      scenes: [
        { id: "pieces", title: "You have the pieces", caption: "The issue may be knowing what has to come first.", durationInFrames: seconds(5), visualKind: "sequence_steps", visualNotes: "Show unordered cards." },
        { id: "dependency", title: "Look for dependency", caption: "Ask: which step makes the next step possible?", durationInFrames: seconds(5), visualKind: "sequence_steps", visualNotes: "Connect prerequisite to result." },
        { id: "ordered", title: "Now order them", caption: "Once the dependency is visible, the order becomes easier to see.", durationInFrames: seconds(6), visualKind: "sequence_steps", visualNotes: "Cards move into order." },
      ],
      checkpoint: {
        prompt: "What clue tells you which step should come first?",
        expected_idea: "The first step is the one that makes the later steps possible.",
      },
    };
  }

  return {
    diagnosis_guess: "The learner may have a partial answer but not the visible relationship behind it.",
    learning_goal: "Turn the learner's words into a small visual explanation and a checkpoint.",
    scenes: primitiveSceneGraphScenes(signal),
    checkpoint: {
      prompt: "What changed in your understanding after the visual explanation?",
      expected_idea: "The learner can name the missing relationship in their own words.",
    },
  };
}

export function buildMyWayRemotionContract(
  signalInput: string,
  buildMode: MyWayRemotionBuildMode,
): MyWayRemotionContract {
  const signal = cleanSignal(signalInput);
  const template =
    buildMode === "primitive_scene_graph"
      ? {
          diagnosis_guess:
            "The learner signal is being rendered through generic visual primitives rather than a specialized topic template.",
          learning_goal:
            "Reveal the missing link with cards, arrows, highlights, captions, and a checkpoint.",
          scenes: primitiveSceneGraphScenes(signal),
          checkpoint: {
            prompt: "What is the specific link that was missing before?",
            expected_idea:
              "The learner can name the relationship between the pieces, not just repeat the answer.",
          },
        }
      : knownTemplateScenes(signal);

  return {
    schema_version: "myway_remotion_animation_contract_v0",
    contract_id: `myway_remotion_${Date.now()}`,
    title: keywordTitle(signal),
    learner_signal: signal,
    diagnosis_guess: template.diagnosis_guess,
    learning_goal: template.learning_goal,
    build_mode: buildMode,
    format: {
      aspect_ratio: "16:9",
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      fps: DEFAULT_FPS,
    },
    remotion: {
      composition_id: "MyWayGeneratedVideo",
      model_writes_code: false,
      input_props_summary:
        "The contract is passed into a trusted Remotion composition as JSON inputProps.",
    },
    scenes: template.scenes,
    checkpoint: template.checkpoint,
    safety_notes: [
      "The model outputs JSON contracts, not arbitrary Remotion code.",
      "MyWay validates scene kinds, captions, equations, duration, and checkpoints before rendering.",
      "No-template generation means primitive scene graph generation, not unrestricted code execution.",
    ],
  };
}

export function getContractDurationInFrames(contract: MyWayRemotionContract) {
  return contract.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
}

export function findSceneForFrame(contract: MyWayRemotionContract, frame: number) {
  let cursor = 0;

  for (let index = 0; index < contract.scenes.length; index += 1) {
    const scene = contract.scenes[index]!;
    const startFrame = cursor;
    const endFrame = cursor + scene.durationInFrames;

    if (frame <= endFrame || index === contract.scenes.length - 1) {
      return {
        scene,
        sceneIndex: index,
        startFrame,
        endFrame,
        progress: Math.max(
          0,
          Math.min(1, (frame - startFrame) / Math.max(1, scene.durationInFrames)),
        ),
      };
    }

    cursor = endFrame;
  }

  const fallback = contract.scenes[0]!;
  return {
    scene: fallback,
    sceneIndex: 0,
    startFrame: 0,
    endFrame: fallback.durationInFrames,
    progress: 0,
  };
}
