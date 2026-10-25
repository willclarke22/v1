// Curated sandbox-only mock reference corpus; no live learner data or database dependencies.
// Each label and each learning-difficulty description is embedded independently.
export const MOCK_TOPICS = Object.freeze([
  {
    "label": "Double-slit experiment",
    "rootProblem": "Assumes that a particle must always have a single definite slit trajectory, and struggles to connect which-path evidence to interference."
  },
  {
    "label": "Wave-particle duality",
    "rootProblem": "Treats wave-like and particle-like experimental observations as mutually exclusive rather than context-dependent."
  },
  {
    "label": "Quantum interference",
    "rootProblem": "Cannot connect probability amplitudes and their combination with the distribution of observed detection events."
  },
  {
    "label": "Which-path information",
    "rootProblem": "Assumes observing a particle path is passive and cannot affect the presence of an interference pattern."
  },
  {
    "label": "Probability amplitudes",
    "rootProblem": "Confuses probability amplitudes with ordinary probabilities and expects them to add in the same way."
  },
  {
    "label": "Diffraction of light",
    "rootProblem": "Treats light as moving only in straight geometric rays even through narrow openings."
  },
  {
    "label": "Superposition in quantum mechanics",
    "rootProblem": "Interprets superposition as ordinary uncertainty about a definite hidden state rather than a quantum state."
  },
  {
    "label": "Photon detection",
    "rootProblem": "Cannot reconcile individual localized detector clicks with a statistical pattern that emerges across many trials."
  },
  {
    "label": "Measurement in quantum physics",
    "rootProblem": "Assumes measurement only reveals a preexisting classical value without considering the measurement context."
  },
  {
    "label": "Uncertainty principle",
    "rootProblem": "Believes measurement instruments alone cause the uncertainty, rather than limits encoded in the quantum description."
  },
  {
    "label": "Electric circuits",
    "rootProblem": "Assumes a battery supplies electrical current to a disconnected bulb without a closed conducting loop."
  },
  {
    "label": "Electrical current",
    "rootProblem": "Conflates current with the amount of stored energy and struggles to distinguish flow rate from energy transfer."
  },
  {
    "label": "Voltage and potential difference",
    "rootProblem": "Treats voltage as a substance that flows rather than a difference in electric potential."
  },
  {
    "label": "Electrical resistance",
    "rootProblem": "Assumes resistance consumes current so less current returns to a battery than leaves it in a simple series loop."
  },
  {
    "label": "Magnetic fields",
    "rootProblem": "Has trouble reasoning how an unseen field can produce forces without direct physical contact."
  },
  {
    "label": "Gravity and falling objects",
    "rootProblem": "Believes heavier objects necessarily fall faster when air resistance is negligible."
  },
  {
    "label": "Newton’s first law",
    "rootProblem": "Assumes objects need a continuous forward force to keep moving at constant speed."
  },
  {
    "label": "Newton’s second law",
    "rootProblem": "Confuses the net force acting on a body with its velocity rather than its acceleration."
  },
  {
    "label": "Conservation of momentum",
    "rootProblem": "Believes an interaction can create net momentum in an isolated system."
  },
  {
    "label": "Energy conservation",
    "rootProblem": "Assumes energy disappears when it changes into less visible forms such as thermal energy."
  },
  {
    "label": "Sound waves",
    "rootProblem": "Confuses the vibration of a medium with the long-distance transport of the medium itself."
  },
  {
    "label": "Heat transfer",
    "rootProblem": "Confuses temperature with total thermal energy and ignores the role of mass and material."
  },
  {
    "label": "Photosynthesis",
    "rootProblem": "Assumes most plant biomass comes directly from soil nutrients rather than atmospheric carbon dioxide."
  },
  {
    "label": "Cellular respiration",
    "rootProblem": "Believes cells obtain usable energy only through breathing rather than molecular reactions in cells."
  },
  {
    "label": "Krebs cycle",
    "rootProblem": "Memorizes reaction names but cannot connect carbon rearrangement with electron carrier production."
  },
  {
    "label": "ATP and cellular energy",
    "rootProblem": "Treats ATP as energy itself rather than a molecule that participates in coupled reactions."
  },
  {
    "label": "Enzyme catalysis",
    "rootProblem": "Believes an enzyme is consumed as a reactant each time it speeds a reaction."
  },
  {
    "label": "DNA replication",
    "rootProblem": "Confuses copying genetic information with making a protein from that information."
  },
  {
    "label": "Natural selection",
    "rootProblem": "Assumes organisms evolve traits because they consciously need them during their lifetimes."
  },
  {
    "label": "Genetic inheritance",
    "rootProblem": "Confuses inherited alleles with traits acquired through experience."
  },
  {
    "label": "Ecosystem food webs",
    "rootProblem": "Assumes matter and energy move through ecosystems in identical closed cycles."
  },
  {
    "label": "Osmosis",
    "rootProblem": "Believes dissolved solutes move through a selectively permeable membrane in the same way water does."
  },
  {
    "label": "Immune response",
    "rootProblem": "Assumes every encounter with a pathogen triggers the same response regardless of immune memory."
  },
  {
    "label": "Fractions and ratios",
    "rootProblem": "Treats a larger denominator as always representing a larger quantity without considering the numerator."
  },
  {
    "label": "Negative numbers",
    "rootProblem": "Believes subtracting a negative quantity must always reduce the final value."
  },
  {
    "label": "Linear functions",
    "rootProblem": "Confuses the slope of a line with its vertical intercept and cannot distinguish rate from starting amount."
  },
  {
    "label": "Exponential growth",
    "rootProblem": "Assumes quantities increase by equal absolute amounts rather than equal multiplicative factors."
  },
  {
    "label": "Conditional probability",
    "rootProblem": "Treats an updated probability as independent of new evidence or the reference population."
  },
  {
    "label": "Statistical correlation",
    "rootProblem": "Interprets an observed association as proof that one variable causes the other."
  },
  {
    "label": "Sampling bias",
    "rootProblem": "Assumes a large sample automatically represents the full population regardless of selection process."
  },
  {
    "label": "Spanish reflexive pronouns",
    "rootProblem": "Confuses reflexive pronoun use with verb meaning and assumes se always indicates the same grammatical function."
  },
  {
    "label": "Spanish ser versus estar",
    "rootProblem": "Assumes one-to-one English translation is sufficient to decide between ser and estar."
  },
  {
    "label": "English verb tense",
    "rootProblem": "Confuses time of an event with the grammatical marking that expresses tense and aspect."
  },
  {
    "label": "Sentence clauses",
    "rootProblem": "Cannot distinguish a complete independent clause from a dependent clause with a subordinating conjunction."
  },
  {
    "label": "Reading inference",
    "rootProblem": "Treats implied information as explicitly stated and has difficulty supporting inferences with textual evidence."
  },
  {
    "label": "Metaphor and figurative language",
    "rootProblem": "Interprets a figurative phrase literally without using surrounding context to infer intended meaning."
  },
  {
    "label": "Computer algorithms",
    "rootProblem": "Assumes an algorithm gives the correct result simply because its code runs without an error."
  },
  {
    "label": "Machine learning generalization",
    "rootProblem": "Assumes high accuracy on training examples guarantees performance on unfamiliar data."
  },
  {
    "label": "Feedback control systems",
    "rootProblem": "Does not recognize how a system can continually adjust its behavior using measured output as feedback."
  },
  {
    "label": "Climate and weather",
    "rootProblem": "Treats individual short-term weather events as direct proof for or against long-term climate trends."
  }
]);
