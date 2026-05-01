import type {
  ClauseInfo,
  MessageInterpretation,
  TopicCandidate,
  TopicCandidateKind,
  ConceptPhraseShape,
  QuestionSynthesisFrame,
  QuestionSynthesisSlots,
  QuestionSynthesisTriggerKind,
  QuestionSynthesisWord,
} from "./topic-label-types";
import {
  FILLER_WORDS,
  FUNCTION_WORDS,
  NEGATION_STEM_TOKENS,
} from "./topic-label-constants";
import {
  dedupe,
  hasNegationStemToken,
  isBadProcessPhrase,
  isClauseLikeSpan,
  looksLikeContextShell,
  looksLikeLearnerStateClause,
  normalizeCandidateSpan,
  normalizeLoose,
  normalizeSurface,
  scoreSpecificity,
  shapeDisplayLabel,
  spansSubstantiallyOverlap,
  tokenize,
} from "./topic-label-normalization";

function stripLeadingDeterminer(text: string) {
  return normalizeSurface(text).replace(/^(?:the|a|an)\s+/i, "").trim();
}

function cleanComparisonSide(text: string) {
  return stripLeadingDeterminer(text)
    .replace(/^(?:i\s+(?:don'?t|dont|do not)\s+know\s+)?(?:when\s+to\s+use|use|when\s+i\s+use)\s+/i, "")
    .replace(/^(?:i\s+keep\s+forgetting\s+)?when\s+to\s+use\s+/i, "")
    .replace(/^(?:we\s+(?:started|covered|learned|were\s+doing|are\s+doing)|i\s+was\s+(?:doing|reviewing|confused\s+about)|i\s+thought\s+i\s+was\s+confused\s+about)\s+/i, "")
    .replace(/^to\s+use\s+/i, "")
    .replace(/\s+(?:this\s+week|in\s+class|generally|overall)\b.*$/i, "")
    .replace(/\s+that\s+i\b.*$/i, "")
    .replace(/\s+(?:still\s+)?(?:feel|seem|mess(?:es)?|confus(?:e|es|ing)|blend(?:s|ing)?|mix(?:es|ing)?)\b.*$/i, "")
    .replace(/\byoure\b/gi, "you're")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeBadComparisonSide(text: string) {
  const loose = normalizeLoose(text);
  const tokens = tokenize(loose);

  if (!loose) return true;

  // Do not allow a broad setup/list clause to become one side of an X-vs-Y
  // topic. Patch C made comparison recovery stronger, but without this guard
  // context such as "we're doing meiosis and inheritance and chromosome stuff"
  // could become a malformed comparison candidate.
  if (
    /\b(?:we'?re|we\s+are|we\s+were|we)\s+(?:doing|covering|learning|studying|reviewing|starting|started)\b/i.test(loose) ||
    /\b(?:right now|this week|in class|whole unit|unit|chapter|worksheet|homework|lecture)\b/i.test(loose) ||
    /\b(?:stuff|things|all that|and all of that|generally confusing|generally|overall|in general)\b/i.test(loose) ||
    /\b(?:at first i thought|i thought the whole|after sitting with it|sitting with it longer)\b/i.test(loose)
  ) {
    return true;
  }

  // A valid comparison side should usually be compact. Longer sides are often
  // sentence residue unless they are a known/protected concept phrase.
  if (tokens.length > 6 && !phraseContainsStrongConcept(loose)) return true;

  if (looksLikeLearnerResidue(loose) || looksLikeContextShell(loose)) return true;

  return false;
}

function normalizeComparisonSideForBuild(text: string) {
  const cleaned = cleanComparisonSide(text);
  const loose = normalizeLoose(cleaned);

  // Comparison sides can be function words in grammar topics, so do not run
  // them through the normal single-token rejection path blindly.
  if (loose === "your") return "your";
  if (loose === "you're" || loose === "youre") return "you're";

  if (looksLikeBadComparisonSide(cleaned)) return null;

  return normalizeCandidateSpan(cleaned);
}

function messageHasComparisonCue(text: string) {
  return /\b(vs|versus|difference|different|compare|contrast|mixing|mix\s+up|mixed\s+up|blending|blend\s+together|mess(?:es)?\s+me\s+up|interchangeable|same\s+in\s+my\s+head|feel\s+basically\s+the\s+same|seem\s+basically\s+the\s+same|blur\s+together|collapse\s+into|same\s+idea|which|whether|instead\s+of|tell\s+apart|distinguish|keep\s+confusing|confusing\s+.+\s+and\s+.+|confuse\s+.+\s+and\s+.+)\b/i.test(text);
}

function comparisonSidesLookSafe(left: string, right: string) {
  return !looksLikeBadComparisonSide(left) && !looksLikeBadComparisonSide(right);
}

function looksLikeTopicConnector(token: string) {
  return (
    token === "of" ||
    token === "in" ||
    token === "on" ||
    token === "vs" ||
    token === "versus" ||
    token === "for"
  );
}

function looksLikeLikelyTopicHead(token: string) {
  return /^(?:rules?|phases?|layers?|steps?|parts?|types?|difference|role|function|mechanism|process|causes?|effects?|law|speed|terminology|jargon|word|words|word order|formula|equation|variables?|questions?|bullets?|size|cycles?|response|analysis|code|updates?|handling|splices?|agreement|voice|planning|anxiety|notation|recognition|scale|perspective|powers?|selection|equations?|intervals?|pressure|phases?|proof|regulation|mapping|control|skills?|defense|scoring|interviews?|salary|negotiation|interest|funds?|transmission|system|checks?|values?|boundaries?|velocity|phases?|precedent|consideration)$/i.test(
    token
  );
}

function looksLikeMechanismPhrase(text: string) {
  const normalized = normalizeLoose(text);
  return (
    /\bhow\b/.test(normalized) ||
    /\bwhy\b/.test(normalized) ||
    /\bwork\b/.test(normalized) ||
    /\bworks\b/.test(normalized) ||
    /\bprocess\b/.test(normalized) ||
    /\bmechanism\b/.test(normalized) ||
    /\bpathway\b/.test(normalized) ||
    /\bcycle\b/.test(normalized) ||
    /\bstep\b/.test(normalized) ||
    /\bsteps\b/.test(normalized) ||
    /\bfunction\b/.test(normalized) ||
    /\brole\b/.test(normalized) ||
    /\bword order\b/.test(normalized) ||
    /\bwhat happens\b/.test(normalized) ||
    /\bwhat changes\b/.test(normalized)
  );
}

function looksLikeAnchorOnlyPhrase(text: string) {
  const normalized = normalizeLoose(text);
  const tokens = tokenize(normalized);

  if (tokens.length > 3) return false;
  if (looksLikeMechanismPhrase(normalized)) return false;

  return !/\bvs\b|\bdifference between\b|\bin\b|\bon\b|\bof\b|\bfor\b/i.test(
    normalized
  );
}

function looksLikeLearnerResidue(text: string) {
  const normalized = normalizeLoose(text);

  return (
    !normalized ||
    looksLikeLearnerStateClause(normalized) ||
    /^why can t i get$/.test(normalized) ||
    /^why can'?t i get$/.test(normalized) ||
    /^i don t know where to start$/.test(normalized) ||
    /^i dont know where to start$/.test(normalized) ||
    /^where to start$/.test(normalized) ||
    /^where to even start$/.test(normalized) ||
    /^what s going on$/.test(normalized) ||
    /^what is going on$/.test(normalized) ||
    /^like$/.test(normalized) ||
    /^weird$/.test(normalized) ||
    /^better$/.test(normalized) ||
    /^in my own language$/.test(normalized) ||
    /^small words$/.test(normalized) ||
    /^the whole thing$/.test(normalized) ||
    /^whole thing$/.test(normalized) ||
    /^the point$/.test(normalized) ||
    /^the part$/.test(normalized) ||
    /^that part$/.test(normalized) ||
    /^this part$/.test(normalized) ||
    /^the thing$/.test(normalized) ||
    /^that thing$/.test(normalized) ||
    /^once everything is ready$/.test(normalized) ||
    /^interview coming up$/.test(normalized) ||
    /^ui changes in$/.test(normalized) ||
    /^do i even$/.test(normalized) ||
    /^actual skill$/.test(normalized) ||
    /^whole problem$/.test(normalized) ||
    /^someone else$/.test(normalized) ||
    /^far apart.*look$/.test(normalized) ||
    /^deciding whose turn it$/.test(normalized) ||
    /^room drawing.*tilt$/.test(normalized) ||
    /^words separately$/.test(normalized) ||
    /^both levels$/.test(normalized) ||
    /^though i know.*not$/.test(normalized) ||
    /^everyone uses$/.test(normalized) ||
    /^actual topic$/.test(normalized) ||
    /^part seems important$/.test(normalized) ||
    /^something stay in orbit$/.test(normalized) ||
    /^not changing shape$/.test(normalized) ||
    /^type of case$/.test(normalized) ||
    /^until it gets louder$/.test(normalized) ||
    /^same word in.*head$/.test(normalized) ||
    /^hidden step$/.test(normalized)
  );
}

function looksLikeWeakStandaloneChunk(text: string) {
  const normalized = normalizeLoose(text);
  const tokens = tokenize(normalized);

  return (
    !normalized ||
    tokens.length === 0 ||
    (tokens.length === 1 &&
      (FILLER_WORDS.has(tokens[0]) ||
        NEGATION_STEM_TOKENS.has(tokens[0]) ||
        FUNCTION_WORDS.has(tokens[0]) ||
        /^(?:like|weird|better|start|help|part|thing|words?|point|stuff|way|sense|idea|question|topic|section|unit)$/i.test(
          tokens[0]
        ))) ||
    looksLikeLearnerResidue(normalized)
  );
}

function isNaturalisticDomainAnchor(text: string) {
  const normalized = normalizeLoose(text);

  return (
    /\bspanish\b/.test(normalized) ||
    /\btaxes?\b/.test(normalized) ||
    /\bforms?\b/.test(normalized) ||
    /\bneurotransmitters?\b/.test(normalized) ||
    /\bneurotransmission\b/.test(normalized) ||
    /\bnervous system\b/.test(normalized) ||
    /\bneurons?\b/.test(normalized) ||
    /\baction potentials?\b/.test(normalized) ||
    /\bmeiosis\b/.test(normalized) ||
    /\bmitosis\b/.test(normalized) ||
    /\bbudgeting\b/.test(normalized) ||
    /\bbudget\b/.test(normalized) ||
    /\bwaves?\b/.test(normalized) ||
    /\bsound\b/.test(normalized) ||
    /\bchemistry\b/.test(normalized) ||
    /\bbiology\b/.test(normalized) ||
    /\bphysics\b/.test(normalized) ||
    /\beconomics\b/.test(normalized) ||
    /\bprobability\b/.test(normalized) ||
    /\bfinance\b/.test(normalized) ||
    /\bpersonal finance\b/.test(normalized)
  );
}

function clauseLooksPrimarilyAnchorLike(clause: ClauseInfo) {
  const text = normalizeLoose(clause.raw);

  return (
    clause.role === "context" ||
    /\b(?:learning about|talking about|covered|started talking about|doing .* in class|we re doing|we're doing|in class|this week|section on|unit on|chapter on|lecture|textbook|worksheet|homework|reviewing|bigger topic|broad sense|overall|in general|the umbrella)\b/.test(
      text
    )
  );
}

function clauseLooksPrimarilyBottleneckLike(clause: ClauseInfo) {
  const text = normalizeLoose(clause.raw);

  return (
    clause.role === "confusion" ||
    clause.hasContrastBoundary ||
    clause.hasConfusionMarker ||
    clause.hasFocusMarker ||
    /\b(?:the thing|the part|the bit|the actual issue|actual thing|actual problem|actual target|the main bottleneck|real bottleneck|real issue|except|but|actually|mainly|mostly|especially|specifically|where i start getting lost|where i stopped following|what keeps tripping me up|throwing me off|doesn t click|doesn't click|not clicking|falls apart|breaks my understanding|stops feeling real|stops making sense)\b/.test(
      text
    )
  );
}

function classifyClauseRoleQualifiers(clause: ClauseInfo): string[] {
  const qualifiers: string[] = [];

  if (clauseLooksPrimarilyAnchorLike(clause)) {
    qualifiers.push("domain_anchor_context");
  }

  if (clauseLooksPrimarilyBottleneckLike(clause)) {
    qualifiers.push("bottleneck_context");
  }

  if (clause.role === "context") qualifiers.push("domain_anchor");
  if (clause.role === "confusion") qualifiers.push("difficulty_context");
  if (clause.hasContrastBoundary) qualifiers.push("contrastive_clause");
  if (clause.hasFocusMarker) qualifiers.push("focus_context");
  if (clause.hasConfusionMarker) qualifiers.push("difficulty_context");
  if (clause.hasQuestionMarker) qualifiers.push("question_context");
  if (clause.hasRequestMarker) qualifiers.push("request_context");

  return qualifiers;
}

function addRoleQualifiers(base: string[] | undefined, clause: ClauseInfo) {
  return dedupe([...(base ?? []), ...classifyClauseRoleQualifiers(clause)]);
}

function pruneCoreTailArtifacts(text: string) {
  let output = normalizeSurface(text);

  const patterns: RegExp[] = [
    /^(.+?)\s+and\s+everyone\s+else\s+seems.*$/i,
    /^(.+?)\s+are\s+still\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
    /^(.+?)\s+is\s+still\s+what\s+make(?:s)?\s+the\s+whole\s+thing\s+confusing.*$/i,
    /^(.+?)\s+are\s+what\s+make(?:s)?.*$/i,
    /^(.+?)\s+is\s+what\s+make(?:s)?.*$/i,
    /^(.+?)\s+that\s+i\s+don'?t\s+get\s+yet.*$/i,
    /^(.+?)\s+that\s+i\s+dont\s+get\s+yet.*$/i,
    /^(.+?)\s+that\s+i\s+do\s+not\s+get\s+yet.*$/i,
    /^(.+?)\s+yet$/i,
    /^(.+?)\s+tbh$/i,
    /^(.+?)\s+lol$/i,
    /^(.+?)\s+rn$/i,
    /^(.+?)\s+right\s+now$/i,
    /^(.+?)\s+i\s+lose\s+track.*$/i,
    /^(.+?)\s+lose\s+track.*$/i,
    /^(.+?)\s+mess(?:es)?\s+me\s+up.*$/i,
    /^(.+?)\s+keeps?\s+messing\s+me\s+up.*$/i,
    /^(.+?)\s+is\s+the\s+part\s+i\s+need\s+help\s+with.*$/i,
    /^(.+?)\s+is\s+the\s+only\s+part\s+that\s+doesn'?t\s+click.*$/i,
    /^(.+?)\s+is\s+the\s+bit\s+that\s+confuses\s+me\s+most.*$/i,
    /^(.+?)\s+is\s+what'?s\s+throwing\s+me\s+off.*$/i,
    /^(.+?)\s+is\s+what\s+keeps\s+tripping\s+me\s+up.*$/i,
    /^(.+?)\s+i\s+dont\s+know\s+where\s+to\s+start.*$/i,
    /^(.+?)\s+i\s+don'?t\s+know\s+where\s+to\s+start.*$/i,
    /^(.+?)\s+or\s+where\s+to\s+even\s+start.*$/i,
    /^(.+?)\s+because\s+that\s+is\s+the\s+point\s+where.*$/i,
    /^(.+?)\s+because\s+that'?s\s+the\s+point\s+where.*$/i,
    /^(.+?)\s+because\s+that\s+is\s+where.*$/i,
    /^(.+?)\s+because\s+that'?s\s+where.*$/i,
    /^(.+?)\s+and\s+then\s+i\s+(?:start|stop|realize|feel).*$/i,
    /^(.+?)\s+and\s+now\s+i\s+.*$/i,
    /^(.+?)\s+every\s+single\s+time.*$/i,
    /^(.+?)\s+again\s+and\s+.*$/i,
    /^(.+?)\s+still\s+feel(?:s)?\s+.*$/i,
    /^(.+?)\s+starts?\s+feeling\s+.*$/i,
    /^(.+?)\s+stops?\s+feeling\s+.*$/i,
    /^(.+?)\s+and\s+why\s+.*$/i,
    /^(.+?)\s+and\s+how\s+.*$/i,
    /^(.+?)\s+instead\s+of\s+.*$/i,
    /^(.+?)\s+part$/i,
  ];

  for (const regex of patterns) {
    const match = output.match(regex);
    if (match?.[1]) {
      const next = normalizeSurface(match[1]);
      if (next) {
        output = next;
        break;
      }
    }
  }

  return output;
}

function looksLikeTailHeavyCandidate(candidate: TopicCandidate) {
  const combined = `${candidate.coreText} ${candidate.tailText ?? ""}`.toLowerCase();

  return (
    /\band everyone else seems\b/i.test(combined) ||
    /\bare what make\b/i.test(combined) ||
    /\bis what make\b/i.test(combined) ||
    /\bare still what make\b/i.test(combined) ||
    /\bis still what make\b/i.test(combined) ||
    /\byet\b/i.test(combined) ||
    /\btbh\b/i.test(combined) ||
    /\blol\b/i.test(combined) ||
    /\blose track\b/i.test(combined) ||
    /\bmess(?:es)? me up\b/i.test(combined) ||
    /\bthrowing me off\b/i.test(combined) ||
    /\btripping me up\b/i.test(combined) ||
    /\bdoesn'?t click\b/i.test(combined) ||
    /\bnot clicking\b/i.test(combined) ||
    /\bpart i need help with\b/i.test(combined) ||
    /\bwhere to start\b/i.test(combined) ||
    /\bpretending i understand\b/i.test(combined) ||
    /\bfeel(?:s|ing)? fake\b/i.test(combined) ||
    /\bfeel(?:s|ing)? stupid\b/i.test(combined)
  );
}

function extractComparison(clause: string) {
  const normalized = normalizeSurface(clause);

  const patterns = [
    /\b(?:difference between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:what(?:'s| is)?\s+actually\s+different\s+between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:compare|contrast)\s+(?:the\s+)?(.+?)\s+(?:and|vs\.?|versus)\s+(?:the\s+)?(.+?)[.?!]*$/i,
    /^(?:what(?:'s| is)?\s+the\s+difference\s+between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)[.?!]*$/i,
    /\b(?:i\s+(?:don'?t|dont|do\s+not)\s+know\s+)?when\s+to\s+use\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
    /\b(?:i keep forgetting\s+)?when to use\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
    /\b(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
  ];

  for (const regex of patterns) {
    const match = normalized.match(regex);
    if (!match) continue;

    const left = cleanComparisonSide(match[1] ?? "");
    const right = cleanComparisonSide(match[2] ?? "");
    if (!left || !right) continue;
    if (!comparisonSidesLookSafe(left, right)) continue;

    return { left, right, combined: `${left} vs ${right}` };
  }

  const mixingMatch = normalized.match(
    /\b(?:keep\s+mixing\s+up|mixing\s+up|keep\s+blending|blending|keep\s+confusing|confusing)\s+(.+?)\s+and\s+(.+?)[.?!]*$/i
  );
  if (mixingMatch?.[1] && mixingMatch?.[2]) {
    const left = cleanComparisonSide(mixingMatch[1]);
    const right = cleanComparisonSide(mixingMatch[2]);
    if (left && right && comparisonSidesLookSafe(left, right)) {
      return { left, right, combined: `${left} vs ${right}` };
    }
  }

  const sameInHeadMatch = normalized.match(
    /\b(.+?)\s+and\s+(.+?)\s+(?:still\s+)?(?:feel|seem)\s+(?:basically\s+)?(?:the\s+)?same(?:\s+in\s+my\s+head)?(?:.*)?$/i
  );
  if (sameInHeadMatch?.[1] && sameInHeadMatch?.[2]) {
    const left = cleanComparisonSide(sameInHeadMatch[1]);
    const right = cleanComparisonSide(sameInHeadMatch[2]);
    if (left && right && comparisonSidesLookSafe(left, right)) {
      return { left, right, combined: `${left} vs ${right}` };
    }
  }

  const messMeUpMatch = normalized.match(
    /\b(.+?)\s+and\s+(.+?)\s+(?:still\s+)?mess(?:es)?\s+me\s+up(?:.*)?$/i
  );
  if (messMeUpMatch?.[1] && messMeUpMatch?.[2]) {
    const left = cleanComparisonSide(messMeUpMatch[1]);
    const right = cleanComparisonSide(messMeUpMatch[2]);
    if (left && right && comparisonSidesLookSafe(left, right)) {
      return { left, right, combined: `${left} vs ${right}` };
    }
  }

  const blendingSubjectMatch = normalized.match(
    /\b(.+?)\s+and\s+(.+?)\s+(?:that\s+i\s+)?(?:keep\s+)?(?:blend|blending|mix|mixing|confuse|confusing)(?:\s+(?:together|the\s+two|them|up|with\s+each\s+other))?(?:.*)?$/i
  );
  if (blendingSubjectMatch?.[1] && blendingSubjectMatch?.[2]) {
    const left = cleanComparisonSide(blendingSubjectMatch[1]);
    const right = cleanComparisonSide(blendingSubjectMatch[2]);
    if (left && right && comparisonSidesLookSafe(left, right)) {
      return { left, right, combined: `${left} vs ${right}` };
    }
  }

  return null;
}

function inferKindFromQualifiers(
  qualifiers: string[],
  fallback: TopicCandidateKind = "other"
): TopicCandidateKind {
  if (qualifiers.includes("question_synthesis")) return "question_synthesis";
  if (qualifiers.includes("concept_phrase")) return "concept_phrase";
  if (qualifiers.includes("comparison_pair")) return "comparison_pair";
  if (qualifiers.includes("of_phrase")) return "of_phrase";
  if (qualifiers.includes("explicit_switch")) return "followup_reference";
  if (qualifiers.includes("context_recovery")) return "context_anchor";
  if (qualifiers.includes("named_concept")) return "named_concept";
  if (qualifiers.includes("paired_with_domain_anchor")) return "domain_shaped";
  if (qualifiers.includes("domain_shaped")) return "domain_shaped";
  if (qualifiers.includes("late_focus_target") || qualifiers.includes("focus_target")) {
    return "focus_target";
  }

  return fallback;
}

function looksLikeSubpartReference(span: string, qualifiers: string[]) {
  const loose = normalizeLoose(span);
  if (qualifiers.includes("explicit_switch")) return false;
  if (qualifiers.includes("paired_with_domain_anchor")) return false;
  if (qualifiers.includes("bottleneck_target")) return false;
  if (qualifiers.includes("concept_phrase")) return false;
  if (qualifiers.includes("durable_concept")) return false;
  if (qualifiers.includes("strong_phrase_match")) return false;
  if (qualifiers.includes("rescue_concept")) return false;
  if (tokenize(loose).length >= 2) return false;

  return (
    loose === "scoring" ||
    loose === "sweeping" ||
    loose === "second part" ||
    loose === "first part" ||
    loose === "that part" ||
    loose === "this part" ||
    loose === "the part" ||
    loose === "part i m stuck" ||
    loose === "part im stuck"
  );
}

function inferParentHint(span: string, qualifiers: string[]): string | null {
  const loose = normalizeLoose(span);
  if (qualifiers.includes("explicit_switch")) return null;
  if (qualifiers.includes("paired_with_domain_anchor")) return null;
  if (qualifiers.includes("concept_phrase")) return null;
  if (qualifiers.includes("durable_concept")) return null;
  if (qualifiers.includes("strong_phrase_match")) return null;
  if (qualifiers.includes("rescue_concept")) return null;

  if ((loose === "scoring" || loose === "sweeping") && tokenize(loose).length === 1) {
    return "subpart_of_active_topic";
  }

  return null;
}

function inferDomainText(coreText: string): string | null {
  const lower = normalizeLoose(coreText);

  const inMatch = lower.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch?.[2]) return normalizeSurface(inMatch[2]);

  const onMatch = lower.match(/^(.+?)\s+on\s+(.+)$/i);
  if (onMatch?.[2]) return normalizeSurface(onMatch[2]);

  const forMatch = lower.match(/^(.+?)\s+for\s+(.+)$/i);
  if (forMatch?.[2] && looksLikeLikelyTopicHead(forMatch[1])) {
    return normalizeSurface(forMatch[2]);
  }

  if (lower.includes("insurance deductible")) return "insurance";
  if (lower.includes("insurance premium")) return "insurance";
  if (lower.includes("credit card interest")) return "credit card";
  if (lower.includes("loan principal")) return "loan";
  if (lower.includes("interest on student loans")) return "student loans";
  if (lower.includes("icing in hockey")) return "hockey";
  if (lower.includes("offside in soccer")) return "soccer";
  if (lower.includes("se in spanish")) return "spanish";
  if (lower.includes("word order in spanish")) return "spanish";
  if (lower.includes("tax terminology")) return "taxes";
  if (lower.includes("tax jargon")) return "taxes";
  if (lower.includes("tax forms")) return "taxes";
  if (lower.includes("tax terminology and forms")) return "taxes";

  return null;
}

function splitCoreAndTail(rawSpan: string, normalizedCore: string) {
  const raw = normalizeSurface(rawSpan);
  const core = pruneCoreTailArtifacts(normalizeSurface(normalizedCore));

  if (!raw || !core) {
    return {
      coreText: core,
      tailText: null as string | null,
    };
  }

  const rawLoose = normalizeLoose(raw);
  const coreLoose = normalizeLoose(core);

  if (rawLoose === coreLoose) {
    return {
      coreText: core,
      tailText: null as string | null,
    };
  }

  const idx = rawLoose.indexOf(coreLoose);
  if (idx === -1) {
    return {
      coreText: core,
      tailText: raw !== core ? raw : null,
    };
  }

  const prefix = raw.slice(0, idx).trim();
  const suffix = raw.slice(idx + core.length).trim();
  const tail = [prefix, suffix].filter(Boolean).join(" ").trim();

  return {
    coreText: core,
    tailText: tail || null,
  };
}


const CONCEPT_HEAD_WORDS = new Set([
  "control",
  "emulsification",
  "skills",
  "development",
  "defense",
  "offside",
  "runs",
  "scoring",
  "questions",
  "bullets",
  "interviews",
  "negotiation",
  "size",
  "cycles",
  "pressure",
  "response",
  "revolution",
  "analysis",
  "wars",
  "significance",
  "code",
  "updates",
  "handling",
  "recursion",
  "splices",
  "agreement",
  "voice",
  "initiation",
  "planning",
  "anxiety",
  "structure",
  "notation",
  "dominants",
  "recognition",
  "fifths",
  "scale",
  "longitude",
  "latitude",
  "effect",
  "boundaries",
  "parking",
  "way",
  "lanes",
  "checks",
  "perspective",
  "mixing",
  "space",
  "values",
  "powers",
  "federalism",
  "college",
  "liberties",
  "rights",
  "osmosis",
  "selection",
  "energy",
  "equations",
  "ph",
  "interest",
  "apr",
  "expenses",
  "funds",
  "torque",
  "horsepower",
  "transmission",
  "system",
  "intervals",
  "photosynthesis",
  "webs",
  "chains",
  "pollination",
  "succession",
  "trap",
  "valve",
  "pipes",
  "velocity",
  "phases",
  "weight",
  "redshift",
  "proof",
  "law",
  "precedent",
  "consideration",
  "regulation",
  "rumination",
  "reappraisal",
  "understanding",
  "mapping",
  "effect",
  "median",
  "mean",
  "climate",
  "weather",
  "empathy",
  "sympathy",
  "reaction",
  "depreciation",
]);

const STRONG_CONCEPT_PHRASES = [
  "heat control",
  "emulsification",
  "knife skills",
  "gluten development",
  "zone defense",
  "offside in soccer",
  "earned runs",
  "tennis scoring",
  "behavioral interview questions",
  "accomplishment-based resume bullets",
  "informational interviews",
  "salary negotiation",
  "serving size",
  "sleep cycles",
  "systolic vs diastolic blood pressure",
  "immune response",
  "causes of the french revolution",
  "primary source analysis",
  "proxy wars",
  "historical significance",
  "asynchronous code",
  "react state updates",
  "api error handling",
  "recursion",
  "comma splices",
  "subject-verb agreement",
  "passive voice",
  "task initiation",
  "study planning",
  "test anxiety",
  "note-taking structure",
  "rhythm notation",
  "secondary dominants",
  "interval recognition",
  "circle of fifths",
  "map scale",
  "latitude vs longitude",
  "rain shadow effect",
  "types of plate boundaries",
  "parallel parking",
  "right of way",
  "merge lanes",
  "blind spot checks",
  "one-point perspective",
  "color mixing",
  "negative space",
  "shading values",
  "separation of powers",
  "federalism",
  "electoral college",
  "civil liberties vs civil rights",
  "osmosis",
  "natural selection",
  "mitosis vs meiosis",
  "activation energy",
  "mole concept",
  "balancing chemical equations",
  "electronegativity vs ionization energy",
  "ph",
  "ph scale",
  "compound interest",
  "apr",
  "fixed vs variable expenses",
  "index funds",
  "torque vs horsepower",
  "automatic transmission",
  "anti-lock braking system",
  "oil change intervals",
  "photosynthesis",
  "food chains vs food webs",
  "pollination",
  "ecological succession",
  "p-trap",
  "water pressure",
  "shutoff valve",
  "plumbing vent pipes",
  "orbital velocity",
  "moon phases",
  "gravity vs weight",
  "redshift",
  "burden of proof",
  "civil law vs criminal law",
  "legal precedent",
  "consideration in contracts",
  "emotion regulation",
  "rumination",
  "cognitive reappraisal",
  "monitoring understanding",
  "concept mapping",
  "affect vs effect",
  "mean vs median",
  "weather vs climate",
  "sympathy vs empathy",
  "maillard reaction",
  "depreciation",
  "baroque vs renaissance art",
];

function normalizeConceptPhrase(text: string) {
  return normalizeSurface(text)
    .replace(/^(?:the|a|an|my|our|their|your)\s+/i, "")
    .replace(/^(?:actual|real|specific|main|major)\s+/i, "")
    .replace(/^(?:thing|part|bit|issue|problem|blocker|target)\s+(?:is\s+)?/i, "")
    .replace(/^(?:what|why|how|when|where|who)\s+/i, "")
    .replace(/^(?:does|do|did|is|are|am|can|could|should|would|will)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseContainsStrongConcept(text: string) {
  const loose = normalizeLoose(text);
  return STRONG_CONCEPT_PHRASES.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(loose);
  });
}


function messageExplicitlyHasNoPersistentTopic(text: string) {
  const loose = normalizeLoose(text);

  return (
    /\b(?:no|not|nothing)\s+(?:specific|actual|real|clear)\s+(?:topic|concept|class thing|thing)\b/i.test(loose) ||
    /\b(?:do not|don'?t|dont|cannot|can'?t|cant)\s+(?:even\s+)?(?:know|tell|figure out)\s+(?:what|which)\s+(?:the\s+)?(?:topic|concept|class thing)\b/i.test(loose) ||
    /\b(?:not\s+)?(?:a|one)\s+specific\s+(?:topic|concept|thing)\b/i.test(loose) ||
    /\b(?:just|only)\s+(?:overwhelmed|confused|lost)\s+(?:in general|overall)?\b/i.test(loose)
  );
}

function isProtectedStrongConceptCandidate(candidate: TopicCandidate) {
  return (
    candidate.kind === "concept_phrase" ||
    candidate.kind === "named_concept" ||
    candidate.kind === "comparison_pair" ||
    candidate.kind === "domain_shaped" ||
    candidate.qualifiers.includes("strong_phrase_match") ||
    candidate.qualifiers.includes("concept_phrase") ||
    (candidate.qualifiers.includes("durable_concept") &&
      candidate.kind !== "question_synthesis")
  );
}

function isQcsCandidate(candidate: TopicCandidate) {
  return candidate.kind === "question_synthesis" || candidate.qualifiers.includes("question_synthesis");
}

function qcsFrame(candidate: TopicCandidate) {
  return candidate.questionSynthesisFrame ?? null;
}

function qcsLooksOverSynthesized(candidate: TopicCandidate) {
  if (!isQcsCandidate(candidate)) return false;

  const label = normalizeLoose(candidate.coreText);
  const source = normalizeLoose(candidate.sourceClause);

  return (
    /^causes of\b/.test(label) ||
    /^how to\b/.test(label) ||
    /\b(?:assignment matters|not start|team switch|switch defenses|steer vs brake|dice mince vs chop)\b/.test(label) ||
    (qcsFrame(candidate) === "cause" && /\b(?:switch|changed|started talking|class|team|someone|teacher|chapter)\b/.test(source))
  );
}

function qcsShouldYieldToExplicitConcept(qcs: TopicCandidate, other: TopicCandidate) {
  if (!isQcsCandidate(qcs)) return false;
  if (!isProtectedStrongConceptCandidate(other)) return false;
  if (other.residueRisk === "high" || other.isWeakNounChunk || other.isSubpartReference) {
    return false;
  }

  // QCS is strongest as a fallback when no cleaner teachable concept exists.
  // Explicit concept phrases like "zone defense", "tennis scoring", or
  // "burden of proof" should beat generic synthesis like "Causes of...".
  return true;
}

function buildRescueConceptCandidate(args: {
  span: string;
  clause: ClauseInfo;
  domainText?: string | null;
  kind?: TopicCandidateKind;
}) {
  return buildConceptCandidate({
    span: args.span,
    clause: args.clause,
    kind: args.kind ?? (args.span.includes(" vs ") ? "comparison_pair" : "concept_phrase"),
    domainText: args.domainText ?? null,
    qualifiers: [
      "rescue_concept",
      "strong_phrase_match",
      "cross_clause_recovery",
      "bottleneck_target",
      "narrowed_target",
    ],
  });
}


function extractStrongConceptPhrasesFromText(text: string) {
  const normalized = normalizeLoose(text);
  const found: string[] = [];

  for (const phrase of STRONG_CONCEPT_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(normalized)) {
      found.push(phrase);
    }
  }

  return dedupe(found);
}

function getConceptHead(text: string) {
  const tokens = tokenize(text);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (CONCEPT_HEAD_WORDS.has(token)) return token;
  }
  return tokens[tokens.length - 1] ?? null;
}

function classifyConceptPhraseShape(text: string): ConceptPhraseShape {
  const loose = normalizeLoose(text);

  if (/\bvs\b/.test(loose)) return "comparison_like";
  if (/\b(?:in|on|for)\b/.test(loose)) return "domain_modified";
  if (/\b(?:analysis|planning|mapping|recognition|handling|regulation|negotiation|initiation|parking|mixing|scoring)\b/.test(loose)) {
    return "skill_phrase";
  }
  if (/\b(?:response|selection|succession|development|reaction|emulsification|photosynthesis|recursion|transmission)\b/.test(loose)) {
    return "process_phrase";
  }
  if (/\b(?:velocity|pressure|cycles|phases|energy|proof|precedent|consideration|federalism|college|liberties|rights)\b/.test(loose)) {
    return "academic_phrase";
  }
  if (/\b(?:deductible|premium|principal|apr|interest|expenses|funds|transmission|oil|valve|pipes|trap|checks)\b/.test(loose)) {
    return "practical_phrase";
  }
  if (tokenize(loose).length >= 2) return "compound_noun";

  return "unknown";
}

function estimateResidueRisk(text: string): "none" | "low" | "medium" | "high" {
  const loose = normalizeLoose(text);
  const tokens = tokenize(loose);

  if (!loose) return "high";

  if (
    /^(?:i|you|we|they|he|she|it|this|that|these|those)\b/.test(loose) ||
    /\b(?:i|you|we|they|he|she|it)\b.*\b(?:feel|think|know|guess|pretend|freeze|panic|hate|like|want|need)\b/.test(loose) ||
    /\b(?:everything|someone|everyone|nothing|something|anything|whose|who|where|when|why|how)\b/.test(loose) ||
    /\b(?:ready|behind|huge|louder|fake|stupid|dumb|annoyed|tired|weird|obvious|normal|randomly)\b/.test(loose) ||
    /\b(?:says|said|mentioned|mentions|keeps showing|shows up|comes up|looked fine|sounds fine|sounds obvious)\b/.test(loose) ||
    /\b(?:second there|once everything|already know|five other words|interview coming up|ui changes|type of case|far apart|draw the space around|line sounds|recipe mentions|teacher says|teacher wrote)\b/.test(loose)
  ) {
    return phraseContainsStrongConcept(loose) ? "medium" : "high";
  }

  if (isClauseLikeSpan(loose) || looksLikeLearnerResidue(loose) || looksLikeContextShell(loose)) {
    return phraseContainsStrongConcept(loose) ? "medium" : "high";
  }

  if (tokens.length === 1 && !CONCEPT_HEAD_WORDS.has(tokens[0])) return "medium";
  if (tokens.length > 7 && !phraseContainsStrongConcept(loose)) return "medium";

  return "low";
}

function looksLikeDurableConceptPhrase(text: string) {
  const loose = normalizeLoose(text);
  const tokens = tokenize(loose);

  if (!loose || tokens.length === 0) return false;
  if (phraseContainsStrongConcept(loose)) return true;
  if (/\bvs\b/.test(loose)) return true;
  if (/\b(?:of|in|on|for)\b/.test(loose) && tokens.length >= 2 && tokens.length <= 7) return true;

  const head = getConceptHead(loose);
  if (head && CONCEPT_HEAD_WORDS.has(head) && tokens.length >= 2 && tokens.length <= 5) {
    return true;
  }

  return false;
}

function cleanupWrapperArtifactsFromSpan(args: {
  span: string | null;
  kind: TopicCandidateKind;
  qualifiers: string[];
}) {
  const originalMaybe = args.span ? normalizeSurface(args.span) : null;
  if (!originalMaybe) return originalMaybe;
 
  const original = originalMaybe;

  // Keep comparison and QCS labels stable. Those are shaped intentionally by
  // dedicated extractors and PFAP, so wrapper cleanup should not rewrite them.
  if (args.kind === "comparison_pair" || args.kind === "question_synthesis") {
    return original;
  }

  function accept(nextRaw: string | null) {
    const next = normalizeSurface(nextRaw ?? "");
    if (!next) return null;

    const nextLoose = normalizeLoose(next);
    const originalLoose = normalizeLoose(original);
    if (!nextLoose || nextLoose === originalLoose) return null;
    if (looksLikeLearnerStateClause(nextLoose)) return null;
    if (looksLikeLearnerResidue(nextLoose)) return null;
    if (isBadProcessPhrase(nextLoose)) return null;
    if (hasNegationStemToken(nextLoose)) return null;
    if (looksLikeContextShell(nextLoose)) return null;

    const tokenCount = tokenize(nextLoose).length;
    const isReasonableLength = tokenCount >= 1 && tokenCount <= 7;
    const isSupportedByCurrentCandidate =
      args.kind === "focus_target" ||
      args.kind === "request_target" ||
      args.kind === "question_target" ||
      args.kind === "context_anchor" ||
      args.kind === "domain_shaped" ||
      args.kind === "named_concept" ||
      args.kind === "concept_phrase" ||
      args.kind === "of_phrase" ||
      args.qualifiers.includes("focus_target") ||
      args.qualifiers.includes("bottleneck_target") ||
      args.qualifiers.includes("request_context") ||
      args.qualifiers.includes("question_context") ||
      args.qualifiers.includes("context_recovery");

    if (
      phraseContainsStrongConcept(nextLoose) ||
      looksLikeDurableConceptPhrase(nextLoose) ||
      (isSupportedByCurrentCandidate && isReasonableLength)
    ) {
      return next;
    }

    return null;
  }

  let output = original;

  const exactRewrites: Array<[RegExp, string]> = [
    [/^speed\s+of\s+sound\s+formula$/i, "speed of sound"],
    [/^law\s+of\s+sines\s+formula$/i, "law of sines"],
    [/^law\s+of\s+cosines\s+formula$/i, "law of cosines"],
    [/^interest\s+on\s+(?:a\s+)?credit\s+card$/i, "credit card interest"],
  ];

  for (const [regex, replacement] of exactRewrites) {
    if (regex.test(output)) {
      const accepted = accept(replacement);
      if (accepted) output = accepted;
      break;
    }
  }

  const topicOfMatch = output.match(
    /^(?:the\s+)?topic\s+of\s+(.+?)\s+(?:comes?|came|shows?|showed)\s+(?:up|back)(?:\s+again)?(?:.*)?$/i
  );
  if (topicOfMatch?.[1]) {
    const accepted = accept(topicOfMatch[1]);
    if (accepted) output = accepted;
  }

  const wrapperPatterns: RegExp[] = [
    /^(?:please\s+)?(?:can|could)\s+(?:you|u)\s+(?:please\s+)?(?:help(?:\s+me)?\s+(?:understand|with)|explain|go\s+over|walk\s+me\s+through|teach\s+me)\s+(.+)$/i,
    /^(?:can|could)\s+i\s+get\s+(?:some\s+)?help\s+with\s+(.+)$/i,
    /^(?:i\s+)?(?:need|want|would\s+like|could\s+use)\s+(?:some\s+)?help\s+(?:understanding|with)\s+(.+)$/i,
    /^(?:help(?:\s+me)?\s+(?:understand|with)|explain|go\s+over|walk\s+me\s+through|teach\s+me)\s+(.+)$/i,
    /^(?:can\s+we\s+go\s+over|could\s+we\s+go\s+over|quiz\s+me\s+on|test\s+me\s+on|ask\s+me\s+about|i\s+want\s+to\s+learn\s+about|i\s+would\s+like\s+to\s+learn\s+about|i\s+would\s+really\s+like\s+to\s+learn\s+about)\s+(.+)$/i,
    /^(?:i(?:'m|\s+am)?\s+stuck\s+on|im\s+stuck\s+on|i(?:'m|\s+am)?\s+struggling\s+with|im\s+struggling\s+with|i(?:'m|\s+am)?\s+having\s+trouble\s+with|im\s+having\s+trouble\s+with)\s+(.+)$/i,
    /^(?:ugh|ok|okay|so|also|actually|wait)[,\s]+(.+)$/i,
  ];

  for (const regex of wrapperPatterns) {
    const match = output.match(regex);
    if (!match?.[1]) continue;

    const accepted = accept(match[1]);
    if (accepted) {
      output = accepted;
      break;
    }
  }

  const leadingPrepositionMatch = output.match(/^(?:on|about|regarding)\s+(.+)$/i);
  if (leadingPrepositionMatch?.[1]) {
    const accepted = accept(leadingPrepositionMatch[1]);
    if (accepted) output = accepted;
  }

  return output;
}

function candidateMetadataFor(kind: TopicCandidateKind, coreText: string) {
  const residueRisk = estimateResidueRisk(coreText);
  const isDurableConcept =
    kind === "comparison_pair" ||
    kind === "domain_shaped" ||
    kind === "of_phrase" ||
    kind === "named_concept" ||
    kind === "concept_phrase" ||
    kind === "question_synthesis" ||
    looksLikeDurableConceptPhrase(coreText);

  const isWeakNounChunk =
    kind === "noun_chunk" &&
    (!looksLikeDurableConceptPhrase(coreText) || residueRisk === "medium" || residueRisk === "high");

  return {
    conceptPhraseShape:
      kind === "concept_phrase" || isDurableConcept
        ? classifyConceptPhraseShape(coreText)
        : undefined,
    conceptHead: getConceptHead(coreText),
    conceptModifiers: tokenize(coreText).slice(0, -1),
    isDurableConcept,
    isWeakNounChunk,
    residueRisk,
  };
}

function buildConceptCandidate(args: {
  span: string;
  clause: ClauseInfo;
  qualifiers?: string[];
  kind?: TopicCandidateKind;
  domainText?: string | null;
}) {
  const span = normalizeConceptPhrase(args.span);
  if (!span) return null;

  const risk = estimateResidueRisk(span);
  if (risk === "high" && !phraseContainsStrongConcept(span)) return null;

  if (!looksLikeDurableConceptPhrase(span) && !phraseContainsStrongConcept(span)) return null;

  return buildCandidate({
    span,
    clause: args.clause,
    qualifiers: dedupe([
      "concept_phrase",
      "durable_concept",
      "focus_target",
      ...(args.qualifiers ?? []),
    ]),
    kind: args.kind ?? "concept_phrase",
    domainText: args.domainText ?? null,
    shouldCompeteAsTopic: true,
  });
}


function buildCandidate(args: {
  span: string | null;
  clause: ClauseInfo;
  kind?: TopicCandidateKind;
  questionAboutTopic?: string | null;
  comparisonTarget?: string | null;
  qualifiers?: string[];
  leftText?: string | null;
  rightText?: string | null;
  domainText?: string | null;
  parentHint?: string | null;
  shouldCompeteAsTopic?: boolean;
  questionSynthesisFrame?: QuestionSynthesisFrame;
  questionTriggerKind?: QuestionSynthesisTriggerKind;
  questionWord?: QuestionSynthesisWord;
  questionActor?: string | null;
  questionVerb?: string | null;
  questionObject?: string | null;
  questionLeftText?: string | null;
  questionRightText?: string | null;
  questionDomainText?: string | null;
  questionSynthesisSlots?: QuestionSynthesisSlots;
  synthesizedLabel?: string | null;
}): TopicCandidate | null {
  const qualifiers = addRoleQualifiers(args.qualifiers, args.clause);
  const kind = args.kind ?? inferKindFromQualifiers(qualifiers);

  if (kind === "comparison_pair" && args.leftText && args.rightText) {
    const left = normalizeComparisonSideForBuild(args.leftText);
    const right = normalizeComparisonSideForBuild(args.rightText);
    if (!left || !right) return null;

    const normalized = `${left} vs ${right}`;
    const label = shapeDisplayLabel(normalized);
    if (!label) return null;

    return {
      span: normalized,
      normalizedSpan: normalizeLoose(normalized),

      kind,
      coreText: normalized,
      normalizedCoreText: normalizeLoose(normalized),
      tailText: null,

      leftText: left,
      rightText: right,
      domainText: null,
      parentHint: null,
      shouldCompeteAsTopic: true,
      isSubpartReference: false,

      sourceClause: args.clause.raw,
      sourceRole: args.clause.role,
      clauseIndex: args.clause.index,
      questionAboutTopic: args.questionAboutTopic ?? null,
      comparisonTarget: right,
      qualifiers,
      questionSynthesisFrame: args.questionSynthesisFrame,
      questionTriggerKind: args.questionTriggerKind,
      questionWord: args.questionWord,
      questionActor: args.questionActor ?? null,
      questionVerb: args.questionVerb ?? null,
      questionObject: args.questionObject ?? null,
      questionLeftText: args.questionLeftText ?? left,
      questionRightText: args.questionRightText ?? right,
      questionDomainText: args.questionDomainText ?? null,
      questionSynthesisSlots: args.questionSynthesisSlots,
      synthesizedLabel: args.synthesizedLabel ?? null,
      score: 0,
      scoreBreakdown: null,
    };
  }

  const rawSpan = args.span ? normalizeSurface(args.span) : null;
  const cleanedSpan = cleanupWrapperArtifactsFromSpan({
    span: rawSpan,
    kind,
    qualifiers,
  });
  const normalized = normalizeCandidateSpan(cleanedSpan);

  if (!normalized) return null;
  if (looksLikeLearnerStateClause(normalized)) return null;
  if (looksLikeLearnerResidue(normalized)) return null;
  if (isBadProcessPhrase(normalized)) return null;
  if (hasNegationStemToken(normalized)) return null;
  if (looksLikeContextShell(normalized)) return null;

  const label = shapeDisplayLabel(normalized);
  if (!label && tokenize(normalized).length <= 2) return null;

  const { coreText, tailText } = splitCoreAndTail(rawSpan ?? normalized, normalized);
  if (!coreText) return null;

  const metadata = candidateMetadataFor(kind, coreText);

  if (kind === "noun_chunk" && metadata.isWeakNounChunk && metadata.residueRisk === "high") {
    return null;
  }

  if (kind === "other" && metadata.residueRisk === "high" && !metadata.isDurableConcept) {
    return null;
  }

  const isSubpartReference = looksLikeSubpartReference(normalized, qualifiers);
  const shouldCompeteAsTopic =
    args.shouldCompeteAsTopic ??
    (!isSubpartReference && !(kind === "noun_chunk" && metadata.isWeakNounChunk));

  return {
    span: normalized,
    normalizedSpan: normalizeLoose(normalized),

    kind,
    coreText,
    normalizedCoreText: normalizeLoose(coreText),
    tailText,

    leftText: args.leftText ?? null,
    rightText: args.rightText ?? null,
    domainText: args.domainText ?? inferDomainText(coreText),
    parentHint: args.parentHint ?? inferParentHint(normalized, qualifiers),
    shouldCompeteAsTopic,
    isSubpartReference,

    sourceClause: args.clause.raw,
    sourceRole: args.clause.role,
    clauseIndex: args.clause.index,
    questionAboutTopic: args.questionAboutTopic ?? null,
    comparisonTarget: args.comparisonTarget ?? null,
    qualifiers: dedupe([
      ...qualifiers,
      ...(metadata.isDurableConcept ? ["durable_concept"] : []),
      ...(metadata.isWeakNounChunk ? ["weak_noun_chunk"] : []),
      ...(metadata.residueRisk === "high" || metadata.residueRisk === "medium"
        ? ["residue_risk"]
        : []),
    ]),

    conceptPhraseShape: metadata.conceptPhraseShape,
    conceptHead: metadata.conceptHead,
    conceptModifiers: metadata.conceptModifiers,
    isDurableConcept: metadata.isDurableConcept,
    isWeakNounChunk: metadata.isWeakNounChunk,
    residueRisk: metadata.residueRisk,

    questionSynthesisFrame: args.questionSynthesisFrame,
    questionTriggerKind: args.questionTriggerKind,
    questionWord: args.questionWord,
    questionActor: args.questionActor ?? null,
    questionVerb: args.questionVerb ?? null,
    questionObject: args.questionObject ?? null,
    questionLeftText: args.questionLeftText ?? null,
    questionRightText: args.questionRightText ?? null,
    questionDomainText: args.questionDomainText ?? args.domainText ?? null,
    questionSynthesisSlots: args.questionSynthesisSlots,
    synthesizedLabel: args.synthesizedLabel ?? null,

    score: 0,
    scoreBreakdown: null,
  };
}

function buildSyntheticClause(
  raw: string,
  index: number,
  role: ClauseInfo["role"] = "confusion"
): ClauseInfo {
  const normalized = normalizeLoose(raw);

  return {
    raw: normalizeSurface(raw),
    normalized,
    index,
    role,
    hasContrastBoundary:
      /\b(?:but|except|actually|mainly|mostly|especially|specifically|until|once|when)\b/i.test(
        raw
      ),
    hasFocusMarker:
      /\b(?:actual|mainly|mostly|especially|specifically|real bottleneck|the part|the thing)\b/i.test(
        raw
      ),
    hasConfusionMarker:
      /\b(?:confused|stuck|struggling|lost|don'?t get|dont get|do not get|doesn'?t click|not clicking|messing me up|throwing me off)\b/i.test(
        raw
      ),
    hasQuestionMarker: /\?|\b(?:what|why|how|when|where)\b/i.test(raw),
    hasRequestMarker: /\b(?:help|explain|go over|walk me through|teach|quiz|test)\b/i.test(
      raw
    ),
    hasContextMarker:
      /\b(?:in class|textbook|worksheet|homework|unit|section|lecture|notes|learning about|doing)\b/i.test(
        raw
      ),
  };
}

function buildBottleneckPatterns(): Array<{
  regex: RegExp;
  qualifiers?: string[];
  kind?: TopicCandidateKind;
}> {
  return [
    {
      regex:
        /\b(?:mainly|mostly|especially|specifically|particularly|most of all)\s+(?:confused about|stuck on|struggling with|having trouble with|don't understand|dont understand|do not understand|don't get|dont get|do not get|can't figure out|cannot figure out|can t figure out)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "bottleneck_target", "narrowed_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the actual issue|the actual thing|the actual problem|the main bottleneck|the real bottleneck|the real issue|the real problem)\s+(?:for me\s+)?(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the part|the thing|the bit)\s+i\s+(?:don't|dont|do not)\s+(?:get|understand)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "bottleneck_target", "narrowed_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:what i(?:'m| am)? really not understanding|what i am actually confused about|what i actually need help with|what i need help with)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "bottleneck_target", "narrowed_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the thing that'?s throwing me off|the thing throwing me off|what'?s throwing me off|what is throwing me off|what keeps tripping me up|the thing that keeps tripping me up)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the only part that doesn'?t click|the only part that does not click|the bit that confuses me most|the part that confuses me most)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the\s+)?(?:thing|part|bit)\s+i\s+(?:actually\s+|really\s+|specifically\s+)?(?:need\s+help\s+with|need\s+to\s+understand|am\s+confused\s+about|(?:am|'m)\s+confused\s+about)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "context_recovery",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:the\s+)?(?:actual|real|specific)\s+(?:thing|part|issue|problem|target)\s+(?:that\s+)?(?:confuses\s+me|is\s+confusing\s+me|throws\s+me\s+off|is\s+throwing\s+me\s+off|i\s+need\s+help\s+with|i\s+need\s+to\s+understand)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "context_recovery",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:where i start getting lost|where i got lost|where i stopped following|where i stop following|where i start to lose the thread|where it stops making sense|where it falls apart)\s+(?:is\s+)?(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "context_recovery",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(?:i(?:'m| am)? okay(?: with most of it)?(?:,)?\s*except(?: for)?|it all makes sense except(?: for)?|i follow most of it(?:,)?\s*but not)\s+(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "late_focus_target",
        "context_recovery",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "context_anchor",
    },
    {
      regex:
        /\b(?:i need help understanding|i need help with|help me with|help me understand|can i get some help with|could i get some help with|can you help me with|could you help me with|i could use some help with|i(?:'m| am)? stuck on|im stuck on|i(?:'m| am)? struggling with|im struggling with|i(?:'m| am)? having trouble with|im having trouble with|i have trouble with|i(?:\s+can'?t|\s+cannot|\s+can t)\s+figure out)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "bottleneck_target", "narrowed_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:don't|dont|do not)\s+(?:get|understand)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "bottleneck_target", "narrowed_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+is\s+what\s+i(?:'m| am)?\s+confused\s+about(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target", "bottleneck_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+are\s+what\s+i\s+keep\s+getting\s+stuck\s+on(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target", "bottleneck_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+that\s+i\s+(?:don't|dont|do not)\s+get(?:\s+yet)?(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target", "bottleneck_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(.+?)\s+(?:is|are)\s+(?:not\s+)?clicking(?:\s+\w+)?(?:.*)?$/i,
      qualifiers: ["focus_target", "late_focus_target", "bottleneck_target"],
      kind: "focus_target",
    },
    {
      regex:
        /\b(?:until|once|when)\s+(.+?)\s+(?:showed up|shows up|came up|comes up|starts?|started)(?:,|\.|\?|!|$)/i,
      qualifiers: [
        "context_recovery",
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
      kind: "context_anchor",
    },
  ];
}

function extractFocusTailCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  for (const rule of buildBottleneckPatterns()) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const rawSpan = match[1];
    const mechanismQualifiers = looksLikeMechanismPhrase(rawSpan)
      ? ["mechanism_target"]
      : [];

    const candidate = buildCandidate({
      span: rawSpan,
      clause,
      qualifiers: [...(rule.qualifiers ?? []), ...mechanismQualifiers],
      kind: rule.kind,
    });

    if (candidate) candidates.push(candidate);
  }

  const comparisonPatterns: Array<{
    regex: RegExp;
    qualifiers?: string[];
  }> = [
    {
      regex: /\b(?:when to use|keep forgetting when to use)\s+(.+?)\s+vs\.?\s+(.+?)[.?!]*$/i,
      qualifiers: [
        "focus_target",
        "comparison_pair",
        "late_focus_target",
        "bottleneck_target",
      ],
    },
    {
      regex:
        /\b(.+?)\s+and\s+(.+?)\s+(?:that\s+i\s+)?(?:keep\s+)?(?:blend|blending|mix|mixing|confuse|confusing)(?:\s+(?:together|the\s+two|them|up|with\s+each\s+other))?(?:.*)?$/i,
      qualifiers: [
        "focus_target",
        "comparison_pair",
        "late_focus_target",
        "bottleneck_target",
        "cross_clause_recovery",
        "rescue_concept",
        "strong_phrase_match",
        "durable_concept",
      ],
    },
    {
      regex:
        /\b(.+?)\s+and\s+(.+?)\s+(?:still\s+)?(?:mess(?:es)? me up|feel basically the same|seem basically the same|feel interchangeable|seem interchangeable)(?:.*)?$/i,
      qualifiers: [
        "focus_target",
        "comparison_pair",
        "late_focus_target",
        "bottleneck_target",
        "cross_clause_recovery",
        "rescue_concept",
        "strong_phrase_match",
        "durable_concept",
      ],
    },
  ];

  for (const rule of comparisonPatterns) {
    const match = text.match(rule.regex);
    if (!match?.[1] || !match?.[2]) continue;

    const left = cleanComparisonSide(match[1]);
    const right = cleanComparisonSide(match[2]);
    if (!left || !right || !comparisonSidesLookSafe(left, right)) continue;

    const candidate = buildCandidate({
      span: `${left} vs ${right}`,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: "comparison_pair",
      leftText: left,
      rightText: right,
      comparisonTarget: right,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractPrepositionalCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{
    regex: RegExp;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
    customSpanBuilder?: (match: RegExpMatchArray) => string | null;
  }> = [
    {
      regex:
        /\b(?:formula|equation|graph|section|chapter|idea|concept|worksheet|unit|homework|lesson|notes?|variables?)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "domain_anchor"],
      kind: "context_anchor",
    },
    {
      regex:
        /\bhas\s+a\s+(?:formula|equation|graph|section|idea|concept)\s+(?:on|about|for)\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["context_recovery", "focus_target", "domain_anchor"],
      kind: "context_anchor",
    },
    {
      regex: /\binterest\s+works?\s+on\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
      ],
      kind: "domain_shaped",
      customSpanBuilder: (m) => `interest on ${normalizeSurface(m[1] ?? "")}`,
    },
    {
      regex:
        /\b(?:difference|rules?|steps?|parts?|types?|mechanism|process|role|function|terminology|jargon|word order|law|speed)\s+of\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["focus_target", "context_recovery", "of_phrase"],
      kind: "of_phrase",
      customSpanBuilder: (m) => normalizeSurface(m[0] ?? "") || null,
    },
    {
      regex: /\babout\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["domain_anchor"],
      kind: "other",
    },
    {
      regex: /\bregarding\s+(.+?)(?:,| but| and|\.|\?|!|$)/i,
      qualifiers: ["domain_anchor"],
      kind: "other",
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1] && !match?.[0]) continue;

    const span = rule.customSpanBuilder ? rule.customSpanBuilder(match) : match[1];

    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: rule.kind,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractComparisonCandidates(clause: ClauseInfo): TopicCandidate[] {
  const comparison = extractComparison(clause.raw);
  if (!comparison) return [];

  const candidate = buildCandidate({
    span: comparison.combined,
    clause: { ...clause, role: "comparison" },
    comparisonTarget: comparison.right,
    qualifiers: [
      "comparison_pair",
      "focus_target",
      "bottleneck_target",
      "narrowed_target",
      "rescue_concept",
      "strong_phrase_match",
      "durable_concept",
    ],
    kind: "comparison_pair",
    leftText: comparison.left,
    rightText: comparison.right,
  });

  return candidate ? [candidate] : [];
}

function extractQuestionCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const directPatterns: Array<{
    regex: RegExp;
    conceptGroup: number;
    questionBuilder?: (match: RegExpMatchArray) => string | null;
    customSpanBuilder?: (match: RegExpMatchArray) => string | null;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
  }> = [
    {
      regex: /^(?:what is|what are|what's)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+in\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
        "paired_with_domain_anchor",
      ],
      kind: "domain_shaped",
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work\s+on\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} on ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
        "paired_with_domain_anchor",
      ],
      kind: "domain_shaped",
    },
    {
      regex: /^(?:how does|how do)\s+(.+?)\s+work[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) => `how ${normalizeSurface(m[1] ?? "")} works`.trim(),
      qualifiers: ["focus_target", "mechanism_target", "narrowed_target"],
      kind: "question_target",
    },
    {
      regex: /^(?:why is|why does|why do)\s+(.+?)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) => `why ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "mechanism_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+a?\s*(deductible)\s+in\s+(insurance)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+a?\s*(premium)\s+(?:mean|means)\s+in\s+(insurance)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+(.+?)\s+in\s+a\s+(loan|mortgage|credit card)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:what(?:'s| is))\s+(.+?)\s+in\s+(insurance|hockey|soccer|loan|mortgage|credit card|spanish)[?]*$/i,
      conceptGroup: 1,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "paired_with_domain_anchor",
      ],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:if i want to learn about)\s+(.+?)\s+(?:where should i start|how should i start|where do i start|how do i start)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
    {
      regex:
        /^(?:where should i start with|where do i start with|how should i start with|how do i start with)\s+(.+?)\??$/i,
      conceptGroup: 1,
      questionBuilder: () => "where to start",
      qualifiers: ["focus_target"],
      kind: "question_target",
    },
  ];

  for (const rule of directPatterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const rawSpan = rule.customSpanBuilder
      ? rule.customSpanBuilder(match)
      : match[rule.conceptGroup] ?? null;

    const candidate = buildCandidate({
      span: rawSpan,
      clause,
      questionAboutTopic: rule.questionBuilder ? rule.questionBuilder(match) : null,
      qualifiers: rule.qualifiers ?? ["focus_target"],
      kind: rule.kind,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractRequestCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const directPatterns: Array<{
    regex: RegExp;
    customSpanBuilder?: (match: RegExpMatchArray) => string | null;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
    shouldCompeteAsTopic?: boolean;
  }> = [
    {
      regex:
        /^(?:can you explain|explain)\s+what\s+a?\s*(deductible)\s+is\s+in\s+(insurance)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`.trim(),
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:can you explain|explain)\s+how\s+(.+?)\s+work(?:s)?\s+in\s+(.+?)[.?!]*$/i,
      customSpanBuilder: (m) =>
        `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`.trim(),
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
        "paired_with_domain_anchor",
      ],
      kind: "domain_shaped",
    },
    {
      regex:
        /^(?:can you explain|explain)\s+how\s+(.+?)\s+work(?:s)?[.?!]*$/i,
      customSpanBuilder: (m) => `how ${normalizeSurface(m[1] ?? "")} works`.trim(),
      qualifiers: ["focus_target", "mechanism_target", "narrowed_target"],
      kind: "request_target",
    },
    {
      regex:
        /^(?:can we go over|could we go over|walk me through|explain|can you explain|quiz me on|test me on|ask me about|i want to learn about|i would like to learn about|i would really like to learn about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target"],
      kind: "request_target",
    },
    {
      regex:
        /^(?:go back to|switch to|i want to work on|work on)\s+(.+?)[.?!]*$/i,
      qualifiers: ["focus_target", "explicit_switch"],
      kind: "followup_reference",
    },
    {
      regex:
        /^(?:my notes mention|my textbook mentions|we learned about|it talks about)\s+(.+?)[.?!]*$/i,
      qualifiers: ["context_recovery", "focus_target", "domain_anchor"],
      kind: "context_anchor",
    },
    {
      regex: /\b(?:go back to|switch to|back to)\s+(.+?)(?:[.?!]|$)/i,
      qualifiers: ["focus_target", "explicit_switch"],
      kind: "followup_reference",
    },
  ];

  for (const rule of directPatterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const rawSpan = rule.customSpanBuilder
      ? rule.customSpanBuilder(match)
      : match[1] ?? null;

    const mechanismQualifiers =
      rawSpan && looksLikeMechanismPhrase(rawSpan) ? ["mechanism_target"] : [];

    const candidate = buildCandidate({
      span: rawSpan,
      clause,
      qualifiers: [...(rule.qualifiers ?? ["focus_target"]), ...mechanismQualifiers],
      kind: rule.kind,
      shouldCompeteAsTopic: rule.shouldCompeteAsTopic,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractOfPhraseCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const regex =
    /\b((?:rules?|phases?|layers?|steps?|parts?|types?|difference|role|function|mechanism|process|causes?|effects?|law|speed|terminology|jargon|word order|formula|variables?)\s+of\s+(?:the\s+)?[A-Za-z"'’][A-Za-z-'"’]*(?:\s+[A-Za-z"'’][A-Za-z-'"’]*){0,6})\b/gi;

  for (const match of text.matchAll(regex)) {
    const span = normalizeSurface(match[1] ?? "");
    if (!span) continue;

    const qualifiers = ["of_phrase", "focus_target"];
    if (looksLikeMechanismPhrase(span)) qualifiers.push("mechanism_target");

    const candidate = buildCandidate({
      span,
      clause,
      qualifiers,
      kind: "of_phrase",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractStandaloneNamedConceptCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: RegExp[] = [
    /\b(reuptake|serotonin reuptake|depolarization|repolarization|electronegativity|osmosis|mitosis|meiosis|budgeting|dopamine|serotonin|neurotransmitters?|neurotransmission|action potentials?|refractory period|cell respiration|crossing over|equilibrium constant|punnett squares|compound interest|factoring|metaphase|anaphase|offside|deductible|premium|principal|amortization|membrane potentials?|standard deviation|photosynthesis|probability|torque|hippocampus|momentum|icing|subduction|opportunity cost|negative feedback|event loop|secondary dominants|pH|ph|llms?|se|spanish|taxes?|forms?)\b/gi,
    /\b(law of cosines|law of sines|speed of sound|rules of curling|rules of baseball|phases of mitosis|layers of the skin|credit card interest|interest on student loans|insurance premium|insurance deductible|loan principal|icing in hockey|offside in soccer|word order|word order in spanish|se in spanish|tax terminology|tax jargon|tax forms|tax terminology and forms|balancing a budget|making a budget that balances|a budget that balances)\b/gi,
    /\b(your\s+vs\s+you'?re)\b/gi,
  ];

  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      const span = normalizeSurface(match[1] ?? "");
      if (!span) continue;
      if (looksLikeLearnerResidue(span)) continue;

      const qualifiers = ["named_concept"];

      if (clauseLooksPrimarilyAnchorLike(clause) && isNaturalisticDomainAnchor(span)) {
        qualifiers.push("domain_anchor");
      } else {
        qualifiers.push("focus_target");
      }

      if (looksLikeMechanismPhrase(span)) qualifiers.push("mechanism_target");

      const clauseLoose = normalizeLoose(clause.raw);

      if (/^se$/i.test(span) && /\bspanish\b/i.test(clauseLoose)) {
        qualifiers.push(
          "bottleneck_target",
          "paired_with_domain_anchor",
          "narrowed_target"
        );
      }

      if (/^word order$/i.test(span) && /\bspanish\b/i.test(clauseLoose)) {
        qualifiers.push(
          "bottleneck_target",
          "paired_with_domain_anchor",
          "mechanism_target"
        );
      }

      if (
        /^(?:terminology|jargon)$/i.test(span) &&
        /\btax(?:es)?\b|\bforms?\b/i.test(clauseLoose)
      ) {
        qualifiers.push(
          "bottleneck_target",
          "paired_with_domain_anchor",
          "narrowed_target"
        );
      }

      if (
        /^(?:a budget that balances|making a budget that balances)$/i.test(span)
      ) {
        qualifiers.push("bottleneck_target", "narrowed_target");
      }

      const candidate = buildCandidate({
        span,
        clause,
        qualifiers,
        kind: "named_concept",
      });

      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function extractEventRecoveryCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{
    regex: RegExp;
    qualifiers?: string[];
    customSpanBuilder?: (m: RegExpMatchArray) => string | null;
  }> = [
    {
      regex:
        /\b(?:until|once|when|then)\s+(.+?)\s+(?:showed up|shows up|came up|comes up|started|starts|switched to|switches to)(?:,|\.|\?|!|$)/i,
      qualifiers: [
        "context_recovery",
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
    },
    {
      regex:
        /\b(?:the point where|where)\s+(.+?)\s+(?:stops?|starts?|breaks|falls apart|stopped following|stops making sense)(?:,|\.|\?|!|$)/i,
      qualifiers: [
        "context_recovery",
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
    },
    {
      regex: /\bonce\s+(icing)\s+comes?\s+up(?:,|\.|\?|!|$)/i,
      qualifiers: [
        "context_recovery",
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
      customSpanBuilder: () => "icing in hockey",
    },
    {
      regex: /\bwhen\s+(icing)\s+comes?\s+up(?:,|\.|\?|!|$)/i,
      qualifiers: [
        "context_recovery",
        "focus_target",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
      ],
      customSpanBuilder: () => "icing in hockey",
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match?.[1]) continue;

    const span = rule.customSpanBuilder ? rule.customSpanBuilder(match) : match[1];
    const mechanismQualifiers =
      span && looksLikeMechanismPhrase(span) ? ["mechanism_target"] : [];

    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: [...(rule.qualifiers ?? []), ...mechanismQualifiers],
      kind: "context_anchor",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractDomainShapedCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = clause.raw;

  const patterns: Array<{
    regex: RegExp;
    custom: (m: RegExpMatchArray) => string;
    qualifiers?: string[];
  }> = [
    {
      regex: /\b(offside)\s+works?\s+in\s+(soccer)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
        "paired_with_domain_anchor",
      ],
    },
    {
      regex: /\b(icing)\s+works?\s+in\s+(hockey)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
        "paired_with_domain_anchor",
      ],
    },
    {
      regex: /\b(deductible)\s+in\s+(insurance)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\b(premium)\s+(?:mean|means)\s+in\s+(insurance)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\b(principal)\s+in\s+a\s+(loan)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[2] ?? "")} ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: ["focus_target", "context_recovery", "late_focus_target"],
    },
    {
      regex: /\binterest\s+works?\s+on\s+(student loans?)(?:[.?!]|$)/i,
      custom: (m) => `interest on ${normalizeSurface(m[1] ?? "")}`,
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
      ],
    },
    {
      regex: /\b(word order)\s+in\s+(spanish)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "mechanism_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
      ],
    },
    {
      regex: /\b(se)\s+(?:in|for)\s+(spanish)(?:[.?!]|$)/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} in ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: [
        "focus_target",
        "context_recovery",
        "late_focus_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
      ],
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const candidate = buildCandidate({
      span: rule.custom(match),
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: "domain_shaped",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractMechanismCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = normalizeSurface(clause.raw);

  const patterns: Array<{
    regex: RegExp;
    customSpanBuilder?: (m: RegExpMatchArray) => string | null;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
  }> = [
    {
      regex: /\bhow\s+(.+?)\s+works?(?:[.?!]|$)/i,
      customSpanBuilder: (m) => `how ${normalizeSurface(m[1] ?? "")} works`,
      qualifiers: ["focus_target", "mechanism_target", "narrowed_target"],
      kind: "question_target",
    },
    {
      regex: /\bwhy\s+(.+?)\s+happens?(?:[.?!]|$)/i,
      customSpanBuilder: (m) => `why ${normalizeSurface(m[1] ?? "")} happens`,
      qualifiers: ["focus_target", "mechanism_target", "narrowed_target"],
      kind: "question_target",
    },
    {
      regex:
        /\b(?:process|mechanism|function|role|steps?|parts?)\s+of\s+(.+?)(?:[.?!]|$)/i,
      customSpanBuilder: (m) => normalizeSurface(m[0] ?? ""),
      qualifiers: ["focus_target", "mechanism_target", "of_phrase"],
      kind: "of_phrase",
    },
    {
      regex: /\b(word order)\b(?:[.?!]|$)/i,
      customSpanBuilder: (m) => normalizeSurface(m[1] ?? ""),
      qualifiers: ["focus_target", "mechanism_target", "bottleneck_target"],
      kind: "focus_target",
    },
  ];

  for (const rule of patterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const span = rule.customSpanBuilder ? rule.customSpanBuilder(match) : match[1] ?? null;
    const candidate = buildCandidate({
      span,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: rule.kind,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractAnchorListCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = normalizeSurface(clause.raw);

  const listMatch = text.match(
    /\b(?:learning about|talking about|went through|covered|started talking about|reading about|teacher explained)\s+(.+?)(?:,?\s+but\b|[.?!]|$)/i
  );

  if (!listMatch?.[1]) return candidates;

  const items = listMatch[1]
    .split(/,|\band\b|\bor\b/gi)
    .map((item) => normalizeSurface(item))
    .filter(Boolean)
    .filter((item) => !looksLikeLearnerStateClause(item))
    .filter((item) => !looksLikeLearnerResidue(item))
    .filter((item) => !isBadProcessPhrase(item))
    .filter((item) => !hasNegationStemToken(item))
    .filter((item) => !looksLikeContextShell(item));

  for (const item of items) {
    const candidate = buildCandidate({
      span: item,
      clause,
      qualifiers: ["domain_anchor", "list_member"],
      kind: "other",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractNaturalisticPairedCandidates(
  interpretation: MessageInterpretation,
  fullMessage: string
): TopicCandidate[] {
  const normalized = normalizeLoose(fullMessage);
  const syntheticClause = buildSyntheticClause(fullMessage, 3000, "confusion");
  const candidates: TopicCandidate[] = [];

  if (/\bspanish\b/.test(normalized) && /\bword order\b|\bsentence order\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "word order in spanish",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "mechanism_target",
        "paired_with_domain_anchor",
        "narrowed_target",
        "cross_clause_recovery",
      ],
      kind: "domain_shaped",
      domainText: "spanish",
    });
    if (candidate) candidates.push(candidate);
  }

  if (/\bspanish\b/.test(normalized) && /\bse\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "se in spanish",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
        "narrowed_target",
        "cross_clause_recovery",
      ],
      kind: "domain_shaped",
      domainText: "spanish",
    });
    if (candidate) candidates.push(candidate);
  }

  // Patch E: targeted domain/phrase rescue candidates. These add clean
  // domain-shaped candidates when the short target and its domain are both
  // explicitly present in the same naturalistic message.
  if (/\b(?:soccer|football)\b/.test(normalized) && /\boffside\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "offside in soccer",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
        "narrowed_target",
        "cross_clause_recovery",
        "strong_phrase_match",
        "durable_concept",
      ],
      kind: "domain_shaped",
      domainText: "soccer",
    });
    if (candidate) candidates.push(candidate);
  }

  if (/\binsurance\b/.test(normalized) && /\bpremium\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "insurance premium",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
        "narrowed_target",
        "cross_clause_recovery",
        "strong_phrase_match",
        "durable_concept",
      ],
      kind: "domain_shaped",
      domainText: "insurance",
    });
    if (candidate) candidates.push(candidate);
  }

  if (/\b(?:loan|loans|mortgage|mortgages)\b/.test(normalized) && /\bprincipal\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "loan principal",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
        "narrowed_target",
        "cross_clause_recovery",
        "strong_phrase_match",
        "durable_concept",
      ],
      kind: "domain_shaped",
      domainText: "loan",
    });
    if (candidate) candidates.push(candidate);
  }

  if (/\blayers?\s+of\s+the\s+skin\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "layers of the skin",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "cross_clause_recovery",
        "strong_phrase_match",
        "durable_concept",
        "of_phrase",
      ],
      kind: "of_phrase",
    });
    if (candidate) candidates.push(candidate);
  }

  if (/\bwhy\s+does\s+negative\s+feedback\s+happen\b/.test(normalized)) {
    const candidate = buildCandidate({
      span: "why negative feedback happens",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "mechanism_target",
        "cross_clause_recovery",
        "strong_phrase_match",
        "durable_concept",
      ],
      kind: "question_target",
    });
    if (candidate) candidates.push(candidate);
  }

  if (
    (/\btax(?:es)?\b/.test(normalized) || /\bforms?\b/.test(normalized)) &&
    (/\bterminology\b/.test(normalized) || /\bjargon\b/.test(normalized))
  ) {
    const span = /\bforms?\b/.test(normalized)
      ? "tax terminology and forms"
      : /\bjargon\b/.test(normalized)
        ? "tax jargon"
        : "tax terminology";

    const candidate = buildCandidate({
      span,
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "paired_with_domain_anchor",
        "narrowed_target",
        "cross_clause_recovery",
        "mechanism_target",
      ],
      kind: "domain_shaped",
      domainText: "taxes",
    });
    if (candidate) candidates.push(candidate);
  }

  if (/\bbudget(?:ing)?\b/.test(normalized) && /\bbalanc/.test(normalized)) {
    const candidate = buildCandidate({
      span: "balancing a budget",
      clause: syntheticClause,
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "narrowed_target",
        "cross_clause_recovery",
      ],
      kind: "focus_target",
      domainText: "budgeting",
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}



type QuestionSynthesisBuildArgs = {
  label: string;
  clause: ClauseInfo;
  frame: QuestionSynthesisFrame;
  triggerKind: QuestionSynthesisTriggerKind;
  questionWord: QuestionSynthesisWord;
  actor?: string | null;
  verb?: string | null;
  object?: string | null;
  leftText?: string | null;
  rightText?: string | null;
  domainText?: string | null;
  qualifiers?: string[];
};

function cleanQcsSlot(text: string | null | undefined) {
  if (!text) return null;
  const cleaned = normalizeSurface(text)
    .replace(/^(?:the|a|an|my|our|your|their|this|that)\s+/i, "")
    .replace(/^what\s+makes\s+/i, "")
    .replace(/^when\s+(?:i|you|we|someone|people)?\s*(?:type|use|choose|apply)\s+(?:quickly\s+)?/i, "")
    .replace(/^chapter\s+(?:uses|mentions|says)\s+/i, "")
    .replace(/^space\s+class\s+starts?\s+talking\s+(?:about\s+)?/i, "")
    .replace(/^but\s+/i, "")
    .replace(/^makes\s+something\s+/i, "")
    .replace(/\s+(?:instead|though|yet|again|right now)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || looksLikeLearnerResidue(cleaned) || looksLikeWeakStandaloneChunk(cleaned)) {
    return null;
  }

  return cleaned;
}

function qcsTitle(text: string) {
  return shapeDisplayLabel(normalizeSurface(text)) ?? normalizeSurface(text);
}

function buildQcsLabelFromAnalysisObject(object: string) {
  const cleaned = cleanQcsSlot(object);
  if (!cleaned) return null;

  if (/\bsource\b/i.test(cleaned)) return "Primary Source Analysis";
  if (/\bgraph\b/i.test(cleaned)) return "Graph Analysis";
  if (/\bpoem|poetry\b/i.test(cleaned)) return "Poetry Analysis";

  return `${qcsTitle(cleaned)} Analysis`;
}

function buildQcsCandidate(args: QuestionSynthesisBuildArgs): TopicCandidate | null {
  const label = normalizeSurface(args.label);
  if (!label || looksLikeLearnerResidue(label)) return null;

  const slots: QuestionSynthesisSlots = {
    actor: args.actor ?? null,
    verb: args.verb ?? null,
    object: args.object ?? null,
    leftText: args.leftText ?? null,
    rightText: args.rightText ?? null,
    domainText: args.domainText ?? null,
  };

  return buildCandidate({
    span: label,
    clause: args.clause,
    kind: "question_synthesis",
    qualifiers: dedupe([
      "question_synthesis",
      "durable_concept",
      "focus_target",
      "bottleneck_target",
      args.triggerKind === "explicit_question"
        ? "explicit_question_frame"
        : "implicit_problem_frame",
      `qcs_${args.frame}`,
      ...(args.qualifiers ?? []),
    ]),
    leftText: args.leftText ?? null,
    rightText: args.rightText ?? null,
    domainText: args.domainText ?? null,
    shouldCompeteAsTopic: true,
    questionSynthesisFrame: args.frame,
    questionTriggerKind: args.triggerKind,
    questionWord: args.questionWord,
    questionActor: args.actor ?? null,
    questionVerb: args.verb ?? null,
    questionObject: args.object ?? null,
    questionLeftText: args.leftText ?? null,
    questionRightText: args.rightText ?? null,
    questionDomainText: args.domainText ?? null,
    questionSynthesisSlots: slots,
    synthesizedLabel: label,
  });
}

function normalizeQcsComparisonSide(text: string | null | undefined) {
  if (!text) return null;
  const cleaned = cleanComparisonSide(text)
    .replace(/^(?:to\s+use|use|using|choose|choosing|between)\s+/i, "")
    .replace(/\s+(?:instead|or not|belongs|category|one)$/i, "")
    .trim();
  return cleanQcsSlot(cleaned);
}

function addQcsComparisonCandidate(args: {
  candidates: TopicCandidate[];
  clause: ClauseInfo;
  left: string | null | undefined;
  right: string | null | undefined;
  triggerKind: QuestionSynthesisTriggerKind;
  questionWord: QuestionSynthesisWord;
  frame?: QuestionSynthesisFrame;
  verb?: string | null;
  domainText?: string | null;
}) {
  const left = normalizeQcsComparisonSide(args.left);
  const right = normalizeQcsComparisonSide(args.right);
  if (!left || !right) return;
  if (normalizeLoose(left) === normalizeLoose(right)) return;

  const candidate = buildQcsCandidate({
    label: `${left} vs ${right}`,
    clause: args.clause,
    frame: args.frame ?? "comparison",
    triggerKind: args.triggerKind,
    questionWord: args.questionWord,
    verb: args.verb ?? "compare",
    object: `${left} and ${right}`,
    leftText: left,
    rightText: right,
    domainText: args.domainText ?? null,
    qualifiers: ["comparison_pair", "selection_frame"],
  });

  if (candidate) args.candidates.push(candidate);
}

function inferQuestionWord(text: string): QuestionSynthesisWord {
  const match = normalizeLoose(text).match(/^(who|what|when|where|why|how|which)\b/);
  return (match?.[1] as QuestionSynthesisWord) ?? null;
}

function extractQuestionSynthesisCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const raw = normalizeSurface(clause.raw);
  const loose = normalizeLoose(raw);
  const questionWord = inferQuestionWord(raw);
  const triggerKind: QuestionSynthesisTriggerKind = questionWord || /\?/.test(raw)
    ? "explicit_question"
    : "implicit_problem";

  // Comparison / selection frames. These are intentionally subject-neutral:
  // "When should I use X", "When is X used", "I can't tell whether X or Y".
  const comparisonPatterns: Array<{ regex: RegExp; word: QuestionSynthesisWord; verb: string; frame?: QuestionSynthesisFrame }> = [
    { regex: /\b(?:difference between|different between)\s+(.+?)\s+(?:and|or|vs\.?|versus)\s+(.+?)(?:[?.!,]|$)/i, word: questionWord, verb: "difference", frame: "comparison" },
    { regex: /\b(?:tell|decide|know|choose|figure out)\s+(?:whether|if|when)?\s*(?:to\s+use\s+)?(.+?)\s+(?:or|and|vs\.?|versus|instead of)\s+(.+?)(?:[?.!,]|$)/i, word: questionWord, verb: "tell whether", frame: "selection" },
    { regex: /\b(?:use|choose|apply)\s+(.+?)\s+(?:or|vs\.?|versus|instead of)\s+(.+?)(?:[?.!,]|$)/i, word: questionWord, verb: "choose", frame: "selection" },
    { regex: /\b(.+?)\s+and\s+(.+?)\s+(?:blur together|collapse into|feel(?:s)? interchangeable|feel(?:s)? like the same|seem(?:s)? like the same|stop feeling different|keep feeling like the same)(?:[?.!,]|$)/i, word: questionWord, verb: "compare", frame: "comparison" },
  ];

  for (const rule of comparisonPatterns) {
    const match = raw.match(rule.regex);
    if (!match?.[1] || !match?.[2]) continue;
    addQcsComparisonCandidate({
      candidates,
      clause,
      left: match[1],
      right: match[2],
      triggerKind,
      questionWord: rule.word,
      frame: rule.frame,
      verb: rule.verb,
    });
  }

  // Cause frames: "What caused X", "Why did X happen", implicit "led to X".
  const causedMatch = raw.match(/\b(?:what\s+(?:actually\s+)?caused|what\s+led\s+to|why\s+did)\s+(.+?)(?:\s+happen|\s+start|\s+occur|[?.!,]|$)/i);
  if (causedMatch?.[1]) {
    const object = cleanQcsSlot(causedMatch[1]);
    if (object) {
      const candidate = buildQcsCandidate({
        label: `Causes of ${qcsTitle(object)}`,
        clause,
        frame: "cause",
        triggerKind,
        questionWord,
        verb: "cause",
        object,
        qualifiers: ["cause_frame", "qcs_fallback_only"],
      });
      if (candidate) candidates.push(candidate);
    }
  }

  // Analysis / skill frames. Actor is optional and can be I/you/someone/passive.
  const analysisPatterns = [
    /\b(?:how\s+(?:do|does|should|can|could|would)?\s*(?:i|you|we|someone|people|students|one)?\s*)?(?:analy[sz]e|interpret|evaluate|assess)\s+(.+?)(?:\s+instead of|[?.!,]|$)/i,
    /\b(?:assignment|teacher|feedback|rubric|textbook)\s+(?:says|said|asks?|asked|wants?|requires?)\s+(?:to\s+)?(?:analy[sz]e|interpret|evaluate|assess)\s+(.+?)(?:[?.!,]|$)/i,
    /\b(?:keep|keeps|kept)\s+summari[sz]ing\s+(?:instead of\s+)?(?:analy[sz]ing|interpreting|evaluating)\s+(.+?)(?:[?.!,]|$)/i,
  ];
  for (const regex of analysisPatterns) {
    const match = raw.match(regex);
    if (!match?.[1]) continue;
    const object = cleanQcsSlot(match[1]);
    const label = object ? buildQcsLabelFromAnalysisObject(object) : null;
    if (!label) continue;
    const candidate = buildQcsCandidate({
      label,
      clause,
      frame: /\bsource\b/i.test(object ?? "") ? "source_analysis" : "analysis",
      triggerKind,
      questionWord,
      verb: "analyze",
      object,
      qualifiers: ["analysis_frame", "skill_frame"],
    });
    if (candidate) candidates.push(candidate);
  }

  // Criteria / definition frames: "what makes X count as Y" or named criteria in a domain.
  const countAsMatch = raw.match(/\bwhat\s+makes\s+(.+?)\s+(?:legally\s+)?(?:count\s+as|qualify\s+as|become|valid\s+as)\s+(.+?)(?:\s+when|[?.!,]|$)/i);
  if (countAsMatch?.[1] && countAsMatch?.[2]) {
    const object = cleanQcsSlot(countAsMatch[1]);
    const domain = cleanQcsSlot(countAsMatch[2]);
    let label: string | null = null;

    if (/\bcontract\b/i.test(domain ?? "") && /\bconsideration\b/i.test(loose)) {
      label = "Consideration in Contracts";
    } else if (domain) {
      label = `${qcsTitle(domain)} Criteria`;
    }

    if (label) {
      const candidate = buildQcsCandidate({
        label,
        clause,
        frame: "criteria",
        triggerKind,
        questionWord,
        verb: "count as",
        object,
        domainText: domain,
        qualifiers: ["criteria_frame"],
      });
      if (candidate) candidates.push(candidate);
    }
  }

  if (/\bconsideration\b/i.test(loose) && /\bcontract\b/i.test(loose)) {
    const candidate = buildQcsCandidate({
      label: "Consideration in Contracts",
      clause,
      frame: "criteria",
      triggerKind,
      questionWord,
      verb: "required for",
      object: "consideration",
      domainText: "contracts",
      qualifiers: ["criteria_frame", "domain_shaped"],
    });
    if (candidate) candidates.push(candidate);
  }

  // Monitoring frames: not hard-coded to first person.
  if (/\b(?:tell|know|check|monitor|figure out)\b.*\b(?:understand|understanding)\b/i.test(loose)) {
    const candidate = buildQcsCandidate({
      label: "Monitoring Understanding",
      clause,
      frame: "monitoring",
      triggerKind,
      questionWord,
      verb: "monitor",
      object: "understanding",
      qualifiers: ["monitoring_frame", "skill_frame"],
    });
    if (candidate) candidates.push(candidate);
  }

  // Process/skill nominalization frames with neutral actors/passives.
  const processPatterns: Array<{ regex: RegExp; label: string; frame: QuestionSynthesisFrame; verb: string }> = [
    { regex: /\b(?:how\s+)?(?:are|do|does|should|can)?\s*(?:chemical\s+)?equations?\s+(?:get\s+)?balanced\b|\bbalance\s+(?:a\s+)?chemical\s+equation/i, label: "Balancing Chemical Equations", frame: "process", verb: "balance" },
    { regex: /\bmerge lanes?\b|\bmerging\b.*\b(?:highway|lane|traffic)\b/i, label: "Merge Lanes", frame: "process", verb: "merge" },
    { regex: /\bshutoff valve\b|\bwhere\b.*\bshutoff\b.*\bvalve\b/i, label: "Shutoff Valve", frame: "role_responsibility", verb: "shut off" },
    { regex: /\bearned runs?\b|\bwhat counted against the pitcher\b/i, label: "Earned Runs", frame: "definition", verb: "count" },
    { regex: /\bdeuce\b.*\badvantage\b|\btennis scoring\b|\btennis\b.*\b(?:15|30|40|fifteen|thirty|forty|love|deuce|advantage|points?|scor(?:e|ing))\b|\b(?:15|30|40|fifteen|thirty|forty|love|deuce|advantage|points?|scor(?:e|ing))\b.*\btennis\b/i, label: "Tennis Scoring", frame: "process", verb: "score" },
  ];
  for (const rule of processPatterns) {
    if (!rule.regex.test(loose)) continue;
    const candidate = buildQcsCandidate({
      label: rule.label,
      clause,
      frame: rule.frame,
      triggerKind,
      questionWord,
      verb: rule.verb,
      object: rule.label,
      qualifiers: ["process_frame", "skill_frame"],
    });
    if (candidate) candidates.push(candidate);
  }

  // What/does X mean frames should preserve the named object.
  const meaningMatch = raw.match(/\b(?:what\s+does|what'?s|what\s+is)\s+(.+?)\s+(?:actually\s+)?(?:mean|means|for|about)(?:[?.!,]|$)/i);
  if (meaningMatch?.[1]) {
    const object = cleanQcsSlot(meaningMatch[1]);
    if (object && looksLikeDurableConceptPhrase(object)) {
      const candidate = buildQcsCandidate({
        label: object,
        clause,
        frame: "definition",
        triggerKind,
        questionWord,
        verb: "mean",
        object,
        qualifiers: ["definition_frame"],
      });
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function extractConceptPhraseCandidates(clause: ClauseInfo): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const text = normalizeSurface(clause.raw);

  for (const phrase of extractStrongConceptPhrasesFromText(text)) {
    const candidate = buildConceptCandidate({
      span: phrase,
      clause,
      qualifiers: ["strong_phrase_match", "cross_clause_recovery"],
      kind: phrase.includes(" vs ") ? "comparison_pair" : "concept_phrase",
    });

    if (candidate) candidates.push(candidate);
  }

  const genericPatterns: Array<{
    regex: RegExp;
    group?: number;
    custom?: (m: RegExpMatchArray) => string | null;
    qualifiers?: string[];
  }> = [
    {
      regex: /\b(?:the actual thing|the thing|the part|the skill|the topic|the target|the real issue|the blocker)\s+(?:i\s+)?(?:need|want)?\s*(?:to\s+)?(?:understand|fix|learn|work on)?\s*(?:is|are)\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,5})/i,
      group: 1,
      qualifiers: ["bottleneck_target", "narrowed_target"],
    },
    {
      regex: /\b(?:i think|i guess|maybe|probably)\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){1,5})\s+(?:is|are)\s+(?:the\s+)?(?:blocker|issue|problem|target|thing|part)/i,
      group: 1,
      qualifiers: ["bottleneck_target", "narrowed_target"],
    },
    {
      regex: /\b([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){1,5})\s+(?:is|are)\s+(?:the\s+)?(?:thing|part|skill|topic|target|issue|problem|blocker)\b/i,
      group: 1,
      qualifiers: ["bottleneck_target", "narrowed_target"],
    },
    {
      regex: /\b(?:teacher|textbook|article|recipe|feedback|chapter|worksheet|lesson|class|video|people|everyone|someone)\s+(?:says|said|wrote|mentions?|mentioned|keeps saying|keeps mentioning)\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){1,5})\b/i,
      group: 1,
      qualifiers: ["context_recovery"],
    },
    {
      regex: /\b(?:how|why|what|when|where|who)\s+(?:do|does|is|are|can|could|should|would)?\s*(?:i\s+)?(?:use|spot|know|tell|understand|explain|answer|write|make|regulate)?\s*([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){1,4})\b/i,
      group: 1,
      qualifiers: ["question_target"],
    },
    {
      regex: /\b([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,3})\s+vs\.?\s+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,3})\b/i,
      custom: (m) => `${normalizeSurface(m[1] ?? "")} vs ${normalizeSurface(m[2] ?? "")}`,
      qualifiers: ["comparison_pair", "bottleneck_target"],
    },
    {
      regex: /\b((?:[A-Za-z][A-Za-z-]*\s+){0,3}(?:analysis|planning|mapping|recognition|handling|regulation|negotiation|initiation|notation|scoring|parking|checks|updates|questions|bullets|interviews|skills|development|control|size|cycles|pressure|response|significance|agreement|voice|structure|scale|perspective|powers|federalism|college|selection|energy|concept|equations|expenses|funds|transmission|system|intervals|phases|proof|precedent|consideration|velocity|redshift|rumination|reappraisal))\b/i,
      group: 1,
      qualifiers: ["concept_head_match"],
    },
  ];

  for (const rule of genericPatterns) {
    const match = text.match(rule.regex);
    if (!match) continue;

    const span = rule.custom ? rule.custom(match) : match[rule.group ?? 1] ?? null;
    if (!span) continue;

    const candidate = buildConceptCandidate({
      span,
      clause,
      qualifiers: rule.qualifiers ?? [],
      kind: span.toLowerCase().includes(" vs ") ? "comparison_pair" : "concept_phrase",
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}


function extractNounLikeCandidates(clause: ClauseInfo): TopicCandidate[] {
  const rawTokens = tokenize(clause.raw);
  if (!rawTokens.length) return [];

  const spans: string[] = [];
  let current: string[] = [];

  function flush() {
    if (current.length > 0) {
      spans.push(current.join(" "));
      current = [];
    }
  }

  for (const token of rawTokens) {
    const shouldBreak =
      (FUNCTION_WORDS.has(token) && !looksLikeTopicConnector(token)) ||
      FILLER_WORDS.has(token) ||
      NEGATION_STEM_TOKENS.has(token);

    if (shouldBreak) {
      flush();
      continue;
    }

    current.push(token);

    const maxLen = current.some(looksLikeTopicConnector) ? 8 : 5;
    if (current.length >= maxLen) flush();
  }

  flush();

  const junkLooseSpans = new Set([
    "think that s",
    "think thats",
    "that s",
    "thats",
    "scoring",
    "sweeping",
    "part i m stuck",
    "part im stuck",
    "yet",
    "lol",
    "tbh",
    "up lol",
    "lose track",
    "whole thing confusing",
    "student loans tbh",
    "premium mean",
    "what s going",
    "where to even",
    "small words",
    "my own language",
    "fake way",
    "boring general way",
    "very specific way",
    "some earlier explanation",
  ]);

  return spans
    .filter((span) => {
      const tokens = tokenize(span);
      const loose = normalizeLoose(span);

      if (!tokens.length) return false;
      if (tokens.some((token) => NEGATION_STEM_TOKENS.has(token))) return false;
      if (isBadProcessPhrase(span)) return false;
      if (looksLikeContextShell(span)) return false;
      if (looksLikeLearnerResidue(span)) return false;
      if (junkLooseSpans.has(loose)) return false;
      if (tokens.length === 1 && FUNCTION_WORDS.has(tokens[0])) return false;
      if (looksLikeWeakStandaloneChunk(span)) return false;
      if (estimateResidueRisk(span) === "high" && !looksLikeDurableConceptPhrase(span)) return false;

      // Noun chunks are now a weak fallback. If a chunk does not look like
      // a durable teachable phrase, it should not compete as a topic.
      if (!looksLikeDurableConceptPhrase(span) && tokens.length < 2) return false;
      return true;
    })
    .map((span) => {
      const qualifiers: string[] = [];

      if (looksLikeMechanismPhrase(span)) qualifiers.push("mechanism_target");

      if (looksLikeAnchorOnlyPhrase(span) && clause.role === "context") {
        qualifiers.push("domain_anchor");
      }

      if (
        clauseLooksPrimarilyBottleneckLike(clause) &&
        !looksLikeAnchorOnlyPhrase(span) &&
        !looksLikeWeakStandaloneChunk(span)
      ) {
        qualifiers.push("focus_target", "bottleneck_target");
      }

      const durable = looksLikeDurableConceptPhrase(span);

      return buildCandidate({
        span,
        clause,
        qualifiers: dedupe([
          ...qualifiers,
          ...(durable ? ["durable_concept"] : ["weak_noun_chunk"]),
        ]),
        kind: durable ? "concept_phrase" : "noun_chunk",
        shouldCompeteAsTopic: durable,
      });
    })
    .filter((candidate): candidate is TopicCandidate => Boolean(candidate));
}

function extractStandaloneConceptCandidate(clause: ClauseInfo): TopicCandidate | null {
  const tokens = tokenize(clause.raw);

  if (!tokens.length || tokens.length > 6) return null;
  if (tokens.some((token) => NEGATION_STEM_TOKENS.has(token))) return null;
  if (looksLikeLearnerResidue(clause.raw)) return null;

  const shaped = shapeDisplayLabel(clause.raw);
  if (!shaped) return null;

  const specificity = scoreSpecificity(shaped);
  if (specificity === "too_vague") return null;
  if (isClauseLikeSpan(clause.raw)) return null;
  if (isBadProcessPhrase(shaped)) return null;
  if (looksLikeContextShell(shaped)) return null;
  if (looksLikeWeakStandaloneChunk(shaped)) return null;

  const qualifiers: string[] = [];

  if (looksLikeMechanismPhrase(clause.raw)) qualifiers.push("mechanism_target");

  if (looksLikeAnchorOnlyPhrase(clause.raw) && clause.role === "context") {
    qualifiers.push("domain_anchor");
  }

  if (clauseLooksPrimarilyBottleneckLike(clause) && !looksLikeAnchorOnlyPhrase(clause.raw)) {
    qualifiers.push("focus_target", "bottleneck_target");
  }

  return buildCandidate({
    span: clause.raw,
    clause,
    qualifiers,
    kind: "other",
  });
}

function extractCrossClauseAnchorCandidates(fullMessage: string): TopicCandidate[] {
  const candidates: TopicCandidate[] = [];
  const normalized = normalizeLoose(fullMessage);
  const syntheticClause = buildSyntheticClause(fullMessage, 2000, "confusion");

  const rules: Array<{
    trigger: RegExp;
    span: string;
    qualifiers?: string[];
    kind?: TopicCandidateKind;
    domainText?: string | null;
  }> = [
    {
      trigger: /\bwaves?\b.*\bspeed of sound\b|\bspeed of sound\b.*\bwaves?\b/i,
      span: "speed of sound",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "of_phrase",
    },
    {
      trigger: /\bneurotransmission\b.*\breuptake\b|\breuptake\b.*\bneurotransmission\b|\bneurotransmitters?\b.*\breuptake\b/i,
      span: "reuptake",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\baction potentials?\b.*\bdepolarization\b|\bdepolarization\b.*\baction potentials?\b/i,
      span: "depolarization",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bmeiosis\b.*\bcrossing over\b|\bcrossing over\b.*\bmeiosis\b/i,
      span: "crossing over",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\btriangles?\b.*\blaw of cosines\b|\blaw of cosines\b.*\btriangles?\b/i,
      span: "law of cosines",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "of_phrase",
      ],
      kind: "of_phrase",
    },
    {
      trigger: /\bpersonal finance\b.*\bcompound interest\b|\bbudgeting\b.*\bcompound interest\b|\bcompound interest\b.*\bfinance\b/i,
      span: "compound interest",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bbudgeting\b.*\b(?:make|making|balance|balancing)\b.*\bbudget\b|\bbudget\b.*\bbalanc(?:e|ing)\b/i,
      span: "balancing a budget",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\bprobability\b.*\bstandard deviation\b|\bstandard deviation\b.*\bprobability\b/i,
      span: "standard deviation",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\beconomics\b.*\bopportunity cost\b|\bopportunity cost\b.*\beconomics\b/i,
      span: "opportunity cost",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bplate tectonics\b.*\bsubduction\b|\bsubduction\b.*\bplate tectonics\b/i,
      span: "subduction",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bhomeostasis\b.*\bnegative feedback\b|\bnegative feedback\b.*\bhomeostasis\b/i,
      span: "negative feedback",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bprogramming\b.*\bevent loop\b|\bevent loop\b.*\bprogramming\b/i,
      span: "event loop",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bmusic theory\b.*\bsecondary dominants\b|\bsecondary dominants\b.*\bmusic theory\b/i,
      span: "secondary dominants",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
      ],
      kind: "named_concept",
    },
    {
      trigger: /\bmembrane potential\b|\bmembrane potentials\b/i,
      span: "membrane potential",
      qualifiers: ["focus_target", "bottleneck_target", "cross_clause_recovery"],
      kind: "named_concept",
    },
    {
      trigger: /\bequilibrium constant\b/i,
      span: "equilibrium constant",
      qualifiers: ["focus_target", "bottleneck_target", "cross_clause_recovery"],
      kind: "named_concept",
    },
    {
      trigger: /\brefractory period\b/i,
      span: "refractory period",
      qualifiers: ["focus_target", "bottleneck_target", "cross_clause_recovery"],
      kind: "named_concept",
    },

    {
      trigger: /\b(?:deuce|advantage|love|fifteen|15|thirty|30|forty|40|tennis)\b.*\b(?:score|scoring|points?)\b|\b(?:score|scoring|points?)\b.*\b(?:deuce|advantage|love|fifteen|15|thirty|30|forty|40|tennis)\b/i,
      span: "tennis scoring",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\b(?:earned|unearned)\s+runs?\b|\b(?:pitcher|baseball)\b.*\b(?:run|runs|earned)\b|\bwhat\s+counted\s+against\s+the\s+pitcher\b/i,
      span: "earned runs",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\bmerge\s+lanes?\b|\bmerging\b.*\b(?:lane|lanes|highway|traffic)\b|\b(?:lane|lanes|highway|traffic)\b.*\bmerging\b/i,
      span: "merge lanes",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\bshut\s*off\s+valve\b|\bshutoff\s+valve\b|\b(?:water|plumbing|sink|toilet)\b.*\b(?:shut\s*off|shutoff|valve)\b/i,
      span: "shutoff valve",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\bbalanc(?:e|ing|ed)\b.*\bchemical\s+equations?\b|\bchemical\s+equations?\b.*\bbalanc(?:e|ing|ed)\b/i,
      span: "balancing chemical equations",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\bzone\s+defen[sc]e\b|\bbasketball\b.*\bswitch(?:ed|es|ing)?\s+defen[sc]es?\b/i,
      span: "zone defense",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
    {
      trigger: /\b(?:soccer|football)\b.*\boffside\b|\boffside\b.*\b(?:soccer|football)\b/i,
      span: "offside in soccer",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
        "paired_with_domain_anchor",
      ],
      kind: "domain_shaped",
      domainText: "soccer",
    },
    {
      trigger: /\bright\s+of\s+way\b|\bwhose\s+turn\b.*\bintersection\b|\bintersection\b.*\bwhose\s+turn\b/i,
      span: "right of way",
      qualifiers: [
        "focus_target",
        "bottleneck_target",
        "context_recovery",
        "cross_clause_recovery",
        "strong_phrase_match",
        "concept_phrase",
        "durable_concept",
      ],
      kind: "concept_phrase",
    },
  ];

  for (const rule of rules) {
    if (!rule.trigger.test(normalized)) continue;

    const candidate = buildCandidate({
      span: rule.span,
      clause: syntheticClause,
      qualifiers: rule.qualifiers ?? [],
      kind: rule.kind,
      domainText: rule.domainText ?? null,
    });

    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function injectGeneralSyntheticCandidates(
  fullMessage: string,
  interpretation: MessageInterpretation,
  collected: TopicCandidate[]
) {
  const syntheticClause = buildSyntheticClause(fullMessage, 4000, "confusion");

  const comparisonFamilies: Array<{
    left: string;
    right: string;
    trigger: RegExp;
  }> = [
    {
      left: "mitosis",
      right: "meiosis",
      trigger: /\bmitosis\b.*\bmeiosis\b|\bmeiosis\b.*\bmitosis\b/i,
    },
    {
      left: "metaphase",
      right: "anaphase",
      trigger: /\bmetaphase\b.*\banaphase\b|\banaphase\b.*\bmetaphase\b/i,
    },
    {
      left: "speed",
      right: "velocity",
      trigger: /\bspeed\b.*\bvelocity\b|\bvelocity\b.*\bspeed\b/i,
    },
    {
      left: "law of sines",
      right: "law of cosines",
      trigger: /\blaw of sines\b.*\blaw of cosines\b|\blaw of cosines\b.*\blaw of sines\b/i,
    },
    {
      left: "latitude",
      right: "longitude",
      trigger: /\blatitude\b.*\blongitude\b|\blongitude\b.*\blatitude\b/i,
    },
    {
      left: "torque",
      right: "horsepower",
      trigger: /\btorque\b.*\bhorsepower\b|\bhorsepower\b.*\btorque\b/i,
    },
    {
      left: "civil law",
      right: "criminal law",
      trigger: /\bcivil law\b.*\bcriminal law\b|\bcriminal law\b.*\bcivil law\b/i,
    },
    {
      left: "affect",
      right: "effect",
      trigger: /\baffect\b.*\beffect\b|\beffect\b.*\baffect\b/i,
    },
    {
      left: "mean",
      right: "median",
      trigger: /\bmean\b.*\bmedian\b|\bmedian\b.*\bmean\b/i,
    },
    {
      left: "weather",
      right: "climate",
      trigger: /\bweather\b.*\bclimate\b|\bclimate\b.*\bweather\b/i,
    },
    {
      left: "sympathy",
      right: "empathy",
      trigger: /\bsympathy\b.*\bempathy\b|\bempathy\b.*\bsympathy\b/i,
    },
    {
      left: "electronegativity",
      right: "ionization energy",
      trigger: /\belectronegativity\b.*\bionization energy\b|\bionization energy\b.*\belectronegativity\b/i,
    },
    {
      left: "food chains",
      right: "food webs",
      trigger: /\bfood chains?\b.*\bfood webs?\b|\bfood webs?\b.*\bfood chains?\b/i,
    },
    {
      left: "fixed expenses",
      right: "variable expenses",
      trigger: /\bfixed\b.*\bvariable\b.*\bexpenses?\b|\bvariable\b.*\bfixed\b.*\bexpenses?\b/i,
    },
    {
      left: "civil liberties",
      right: "civil rights",
      trigger: /\bcivil liberties\b.*\bcivil rights\b|\bcivil rights\b.*\bcivil liberties\b/i,
    },
    {
      left: "gravity",
      right: "weight",
      trigger: /\bgravity\b.*\bweight\b|\bweight\b.*\bgravity\b/i,
    },
    {
      left: "baroque",
      right: "renaissance art",
      trigger: /\bbaroque\b.*\brenaissance\b|\brenaissance\b.*\bbaroque\b/i,
    },
    {
      left: "your",
      right: "you're",
      trigger: /\byour\b.*\b(you'?re|youre)\b|\b(you'?re|youre)\b.*\byour\b/i,
    },
  ];

  for (const family of comparisonFamilies) {
    if (!family.trigger.test(fullMessage)) continue;
    if (!messageHasComparisonCue(fullMessage)) {
      continue;
    }

    const synthetic = buildCandidate({
      span: `${family.left} vs ${family.right}`,
      clause: syntheticClause,
      comparisonTarget: family.right,
      qualifiers: [
        "comparison_pair",
        "focus_target",
        "cross_clause_recovery",
        "late_focus_target",
        "bottleneck_target",
        "narrowed_target",
        "rescue_concept",
        "strong_phrase_match",
        "durable_concept",
        "concept_phrase",
      ],
      kind: "comparison_pair",
      leftText: family.left,
      rightText: family.right,
    });

    if (synthetic) collected.push(synthetic);
  }

  for (const candidate of extractNaturalisticPairedCandidates(interpretation, fullMessage)) {
    collected.push(candidate);
  }
}

function candidateStablePriority(candidate: TopicCandidate) {
  let score = 0;

  if (candidate.kind === "comparison_pair") score += 22;
  if (candidate.kind === "domain_shaped") score += 20;
  if (candidate.kind === "concept_phrase") score += 19;
  if (candidate.kind === "of_phrase") score += 17;
  if (candidate.kind === "named_concept") score += 15;
  if (candidate.kind === "question_synthesis") score += 10;
  if (candidate.kind === "focus_target") score += 10;
  if (candidate.kind === "context_anchor") score += 6;

  if (candidate.qualifiers.includes("paired_with_domain_anchor")) score += 18;
  if (candidate.qualifiers.includes("bottleneck_target")) score += 14;
  if (candidate.qualifiers.includes("late_focus_target")) score += 10;
  if (candidate.qualifiers.includes("cross_clause_recovery")) score += 10;
  if (candidate.qualifiers.includes("strong_phrase_match")) score += 18;
  if (candidate.qualifiers.includes("rescue_concept")) score += 16;
  if (candidate.qualifiers.includes("question_synthesis")) score += 3;
  if (candidate.qualifiers.includes("implicit_problem_frame")) score += 2;
  if (candidate.qualifiers.includes("explicit_question_frame")) score += 2;
  if (candidate.qualifiers.includes("qcs_fallback_only")) score -= 8;
  if (candidate.qualifiers.includes("mechanism_target")) score += 8;
  if (candidate.qualifiers.includes("durable_concept")) score += 8;
  if (candidate.qualifiers.includes("concept_phrase")) score += 8;
  if (candidate.qualifiers.includes("context_recovery")) score += 5;
  if (candidate.qualifiers.includes("focus_target")) score += 5;

  if (candidate.qualifiers.includes("domain_anchor")) score -= 6;
  if (candidate.qualifiers.includes("list_member")) score -= 4;
  if (candidate.isSubpartReference) score -= 12;
  if (!candidate.shouldCompeteAsTopic) score -= 10;
  if (looksLikeTailHeavyCandidate(candidate)) score -= 10;
  if (candidate.isWeakNounChunk || candidate.qualifiers.includes("weak_noun_chunk")) score -= 22;
  if (candidate.residueRisk === "high") score -= 22;
  if (candidate.residueRisk === "medium") score -= 10;
  if (qcsLooksOverSynthesized(candidate)) score -= 18;

  const tokenCount = tokenize(candidate.coreText).length;
  if (tokenCount >= 2 && tokenCount <= 5) score += 4;
  if (tokenCount > 8) score -= 4;

  const label = shapeDisplayLabel(candidate.coreText);
  const specificity = scoreSpecificity(label);
  if (specificity === "very_specific") score += 8;
  if (specificity === "good") score += 6;
  if (specificity === "broad_but_usable") score += 2;
  if (specificity === "too_vague") score -= 12;

  return score;
}

function choosePreferredOverlappingCandidate(
  current: TopicCandidate,
  incoming: TopicCandidate
) {
  const currentLoose = current.normalizedCoreText;
  const incomingLoose = incoming.normalizedCoreText;
  const oneContainsOther =
    currentLoose.includes(incomingLoose) || incomingLoose.includes(currentLoose);

  const currentTailHeavy = looksLikeTailHeavyCandidate(current);
  const incomingTailHeavy = looksLikeTailHeavyCandidate(incoming);

  if (currentTailHeavy !== incomingTailHeavy && oneContainsOther) {
    return incomingTailHeavy ? current : incoming;
  }

  const currentQuestionSynthesis = isQcsCandidate(current);
  const incomingQuestionSynthesis = isQcsCandidate(incoming);

  if (currentQuestionSynthesis && qcsShouldYieldToExplicitConcept(current, incoming)) {
    return incoming;
  }

  if (incomingQuestionSynthesis && qcsShouldYieldToExplicitConcept(incoming, current)) {
    return current;
  }

  const currentConceptPhrase = current.kind === "concept_phrase";
  const incomingConceptPhrase = incoming.kind === "concept_phrase";

  if (currentConceptPhrase !== incomingConceptPhrase) {
    return incomingConceptPhrase ? incoming : current;
  }

  if (currentQuestionSynthesis !== incomingQuestionSynthesis) {
    const nonQcs = currentQuestionSynthesis ? incoming : current;
    const qcs = currentQuestionSynthesis ? current : incoming;

    if (qcsLooksOverSynthesized(qcs) && !nonQcs.isWeakNounChunk && nonQcs.residueRisk !== "high") {
      return nonQcs;
    }

    // QCS can beat weak fallbacks/residue, but it should not automatically
    // outrank a clean non-QCS candidate.
    if (nonQcs.isWeakNounChunk || nonQcs.residueRisk === "high" || !nonQcs.shouldCompeteAsTopic) {
      return qcs;
    }

    return nonQcs;
  }

  const currentDurable = Boolean(current.isDurableConcept || current.qualifiers.includes("durable_concept"));
  const incomingDurable = Boolean(incoming.isDurableConcept || incoming.qualifiers.includes("durable_concept"));

  if (currentDurable !== incomingDurable) {
    return incomingDurable ? incoming : current;
  }

  const currentWeak = Boolean(current.isWeakNounChunk || current.qualifiers.includes("weak_noun_chunk"));
  const incomingWeak = Boolean(incoming.isWeakNounChunk || incoming.qualifiers.includes("weak_noun_chunk"));

  if (currentWeak !== incomingWeak) {
    return incomingWeak ? current : incoming;
  }

  const currentPriority = candidateStablePriority(current);
  const incomingPriority = candidateStablePriority(incoming);

  if (currentPriority !== incomingPriority) {
    return incomingPriority > currentPriority ? incoming : current;
  }

  const currentTokens = tokenize(current.coreText).length;
  const incomingTokens = tokenize(incoming.coreText).length;

  if (oneContainsOther && currentTokens !== incomingTokens) {
    const richer = incomingTokens > currentTokens ? incoming : current;
    const thinner = incomingTokens > currentTokens ? current : incoming;

    const richerLabel = shapeDisplayLabel(richer.coreText);
    if (
      richerLabel &&
      (richerLabel.toLowerCase().includes(" in ") ||
        richerLabel.toLowerCase().includes(" on ") ||
        richerLabel.toLowerCase().includes(" of ") ||
        richerLabel.toLowerCase().includes(" vs "))
    ) {
      return richer;
    }

    if (scoreSpecificity(shapeDisplayLabel(thinner.coreText)) === "too_vague") {
      return richer;
    }
  }

  return current;
}

function dedupeAndGroupCandidates(candidates: TopicCandidate[]) {
  const hasProtectedExplicitConcept = candidates.some(
    (candidate) =>
      isProtectedStrongConceptCandidate(candidate) &&
      candidate.residueRisk !== "high" &&
      !candidate.isWeakNounChunk &&
      candidate.shouldCompeteAsTopic
  );

  const filteredCandidates = candidates.filter((candidate) => {
    if (!isQcsCandidate(candidate)) return true;
    if (!hasProtectedExplicitConcept) return true;

    // Keep clean QCS comparison/selection labels because they may be the best
    // way to express an implicit "which one?" problem. Suppress fallback cause
    // or over-synthesized QCS labels when an explicit concept exists.
    if (candidate.kind === "comparison_pair") return true;
    if (candidate.questionSynthesisFrame === "comparison") return true;
    if (candidate.questionSynthesisFrame === "selection") return true;

    return !qcsLooksOverSynthesized(candidate) && !candidate.qualifiers.includes("qcs_fallback_only");
  });

  const grouped: TopicCandidate[] = [];

  for (const candidate of filteredCandidates) {
    if (!candidate.coreText || looksLikeLearnerResidue(candidate.coreText)) continue;
    if (candidate.isWeakNounChunk && candidate.residueRisk !== "low") continue;

    const existingIndex = grouped.findIndex((existing) => {
      if (existing.normalizedCoreText === candidate.normalizedCoreText) return true;
      if (spansSubstantiallyOverlap(existing.coreText, candidate.coreText)) return true;
      return false;
    });

    if (existingIndex === -1) {
      grouped.push(candidate);
      continue;
    }

    const existing = grouped[existingIndex];
    grouped[existingIndex] = choosePreferredOverlappingCandidate(existing, candidate);
  }

  return grouped.sort((a, b) => candidateStablePriority(b) - candidateStablePriority(a));
}

export function extractConceptCandidates(
  interpretation: MessageInterpretation,
  fullMessage: string
): TopicCandidate[] {
  if (messageExplicitlyHasNoPersistentTopic(fullMessage)) {
    return [];
  }

  const collected: TopicCandidate[] = [];

  for (const clause of interpretation.clauses) {
    collected.push(...extractComparisonCandidates(clause));
    collected.push(...extractFocusTailCandidates(clause));
    collected.push(...extractMechanismCandidates(clause));
    collected.push(...extractOfPhraseCandidates(clause));
    collected.push(...extractStandaloneNamedConceptCandidates(clause));
    collected.push(...extractEventRecoveryCandidates(clause));
    collected.push(...extractDomainShapedCandidates(clause));
    collected.push(...extractPrepositionalCandidates(clause));
    collected.push(...extractQuestionSynthesisCandidates(clause));
    collected.push(...extractQuestionCandidates(clause));
    collected.push(...extractRequestCandidates(clause));
    collected.push(...extractAnchorListCandidates(clause));
    collected.push(...extractConceptPhraseCandidates(clause));
    collected.push(...extractNounLikeCandidates(clause));

    const standalone = extractStandaloneConceptCandidate(clause);
    if (standalone) collected.push(standalone);
  }

  collected.push(...extractCrossClauseAnchorCandidates(fullMessage));
  injectGeneralSyntheticCandidates(fullMessage, interpretation, collected);

  return dedupeAndGroupCandidates(collected);
}