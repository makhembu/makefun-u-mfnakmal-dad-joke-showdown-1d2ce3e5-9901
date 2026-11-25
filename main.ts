const { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const MAX_ENTRY_LENGTH = 200;
const MIN_ENTRY_LENGTH = 1;
const PRIMARY_OUTPUT = "/output/entry.txt";
const FALLBACK_OUTPUTS = ["./output/entry.txt", "./entry.txt"];
const OUTPUT_TARGETS: string[] = [...new Set([PRIMARY_OUTPUT, ...FALLBACK_OUTPUTS])];

type Candidate = {
  id: string;
  text: string;
  tags: string[];
};

type Measures = {
  chars: number;
  bytes: number;
  words: number;
  sentences: number;
  averageWordLength: number;
  syllables: number;
  fillerHits: number;
  clicheHits: number;
  punHits: number;
  tableHits: number;
  contentRepeated: number;
  exclamations: number;
  hasDialogue: boolean;
  endsOnPun: boolean;
};

type Scored = {
  candidate: Candidate;
  entry: string;
  total: number;
  measures: Measures;
};

type TestCase = {
  name: string;
  check: () => boolean;
};

const CANDIDATES: Candidate[] = [
  {
    id: "one-track",
    text: 'My wife said I have a one-track mind. I said, "That\'s not true. I also think about trains."',
    tags: ["wife", "pun", "trains", "dialogue"],
  },
  {
    id: "ocean-call",
    text: 'My wife said the ocean called. I asked what it wanted. She said, "It just wanted to wave."',
    tags: ["wife", "pun", "ocean", "dialogue"],
  },
  {
    id: "garden-grow",
    text: 'My wife asked me to stop telling jokes about gardening. I said, "I\'m trying to grow on you."',
    tags: ["wife", "pun", "garden", "dialogue"],
  },
  {
    id: "calendar-off",
    text: "I got fired from the calendar factory. I took a day off.",
    tags: ["pun", "work", "calendar"],
  },
  {
    id: "camp-tents",
    text: 'I asked my wife if she wanted to go camping. She said, "I\'m not into that." I said, "Come on, it\'s in tents."',
    tags: ["wife", "pun", "camping", "dialogue"],
  },
  {
    id: "stairs-step",
    text: 'My son asked for a joke about stairs. I said, "I\'ll take it one step at a time."',
    tags: ["son", "pun", "stairs", "dialogue"],
  },
  {
    id: "baker-dough",
    text: 'I told my wife I wanted to be a baker. She said, "You already know how to make dough."',
    tags: ["wife", "pun", "baker", "dialogue"],
  },
  {
    id: "vacuum-dust",
    text: "I finally sold my old vacuum cleaner. It had been gathering dust for years.",
    tags: ["pun", "home", "vacuum"],
  },
  {
    id: "library-glue",
    text: 'I told my wife I was writing a book about glue. She said, "I hope it sticks."',
    tags: ["wife", "pun", "library", "dialogue"],
  },
  {
    id: "bakery-roll",
    text: 'I asked my wife for a joke about bread. She said, "Sure, I\'m on a roll."',
    tags: ["wife", "pun", "bakery", "dialogue"],
  },
  {
    id: "fish-scale",
    text: 'My wife asked me to stop telling fish jokes. I said, "Fine, I\'ll scale it back."',
    tags: ["wife", "pun", "fish", "dialogue"],
  },
  {
    id: "elevator-level",
    text: 'My son asked for a joke about elevators. I said, "I\'ll take it to the next level."',
    tags: ["son", "pun", "elevator", "dialogue"],
  },
];

const FILLER_WORDS = new Set([
  "actually",
  "basically",
  "certainly",
  "definitely",
  "honestly",
  "just",
  "literally",
  "really",
  "simply",
  "totally",
  "very",
]);

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "asked",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "said",
  "she",
  "so",
  "that",
  "the",
  "then",
  "there",
  "this",
  "to",
  "told",
  "was",
  "we",
  "what",
  "when",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

const CLICHE_PHRASES = [
  "walk into a bar",
  "why did the chicken",
  "what do you call",
  "restaurant on the moon",
  "seafood diet",
  "facial hair",
  "anti-gravity",
  "scientists trust atoms",
  "the chicken crossed",
  "dad joke",
];

const PUN_MARKERS = [
  "one-track",
  "trains",
  "wave",
  "grow on",
  "day off",
  "in tents",
  "step at a time",
  "make dough",
  "gathering dust",
  "sticks",
  "on a roll",
  "scale it back",
  "next level",
];

const TABLE_WORDS = new Set([
  "wife",
  "husband",
  "son",
  "daughter",
  "kitchen",
  "dinner",
  "table",
  "barbecue",
  "family",
  "home",
  "morning",
]);

const FALLBACK_ENTRY =
  'My wife said I have a one-track mind. I said, "That\'s not true. I also think about trains."';

const LAST_RESORT_ENTRY =
  "Why did the scarecrow win an award? Because he was outstanding in his field.";

let tempCounter = 0;

function normalizeText(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function countSentences(text: string): number {
  const endings = text.match(/[.!?]+(?=\s|$)/g);
  return endings === null ? 1 : Math.max(1, endings.length);
}

function lastSentence(text: string): string {
  const trimmed = text.trim();
  const endings = [...trimmed.matchAll(/[.!?](?=\s|$)/g)];
  if (endings.length <= 1) return trimmed;
  const previous = endings[endings.length - 2];
  const start = (previous.index ?? 0) + 1;
  return trimmed.slice(start).trim() || trimmed;
}

function guessSyllables(word: string): number {
  const cleaned = word.replace(/[^a-z]/g, "");
  if (cleaned.length === 0) return 0;
  if (cleaned.length <= 3) return 1;
  const groups = cleaned.match(/[aeiouy]+/g);
  const base = groups === null ? 1 : groups.length;
  const silentE = cleaned.endsWith("e") && !cleaned.endsWith("le") ? 1 : 0;
  return Math.max(1, base - silentE);
}

function isWellFormed(text: string): boolean {
  const checker = (text as { isWellFormed?: () => boolean }).isWellFormed;
  return typeof checker === "function" ? checker.call(text) : true;
}

function isValidEntry(entry: string): boolean {
  if (typeof entry !== "string") return false;
  const length = codePointLength(entry);
  return (
    length >= MIN_ENTRY_LENGTH &&
    length <= MAX_ENTRY_LENGTH &&
    entry.trim().length > 0 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(entry) &&
    isWellFormed(entry)
  );
}

function truncateAtBoundary(text: string, maxLength: number): string {
  const points = Array.from(text);
  if (points.length <= maxLength) return text;
  const clipped = points.slice(0, maxLength).join("");
  const sentenceCut = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? "),
  );
  if (sentenceCut >= Math.floor(maxLength * 0.6)) {
    return clipped.slice(0, sentenceCut + 1).trim();
  }
  const wordCut = clipped.lastIndexOf(" ");
  if (wordCut >= Math.floor(maxLength * 0.5)) return clipped.slice(0, wordCut).trim();
  return clipped.trim();
}

function normalizeEntry(text: string): string {
  return truncateAtBoundary(normalizeText(text), MAX_ENTRY_LENGTH).trim();
}

function measureEntry(text: string): Measures {
  const words = splitWords(text);
  const chars = codePointLength(text);
  const lowercase = text.toLowerCase();
  const wordCount = words.length;
  const totalLetters = words.reduce((sum, word) => sum + word.replace(/[^a-z]/g, "").length, 0);
  const fillerHits = words.filter((word) => FILLER_WORDS.has(word)).length;
  const clicheHits = CLICHE_PHRASES.filter((phrase) => lowercase.includes(phrase)).length;
  const punHits = PUN_MARKERS.filter((marker) => lowercase.includes(marker)).length;
  const tableHits = new Set(words.filter((word) => TABLE_WORDS.has(word))).size;
  const syllables = words.reduce((sum, word) => sum + guessSyllables(word), 0);
  const content = words.filter((word) => !STOP_WORDS.has(word));
  const contentRepeated = Math.max(0, content.length - new Set(content).size);
  const finalSentence = lastSentence(lowercase);

  return {
    chars,
    bytes: Buffer.byteLength(text, "utf8"),
    words: wordCount,
    sentences: countSentences(text),
    averageWordLength: wordCount === 0 ? 0 : totalLetters / wordCount,
    syllables,
    fillerHits,
    clicheHits,
    punHits,
    tableHits,
    contentRepeated,
    exclamations: (text.match(/!/g) ?? []).length,
    hasDialogue: /["']/.test(text) && /\b(said|asked|told|replied)\b/i.test(text),
    endsOnPun: PUN_MARKERS.some((marker) => finalSentence.includes(marker)),
  };
}

function scorePun(measures: Measures, entry: string): number {
  let score = measures.punHits * 3;
  if (measures.hasDialogue) score += 2;
  if (/\b(also|but|yet)\b/i.test(entry)) score += 1.5;
  if (/\b(not|never|only|already|still)\b/i.test(entry)) score += 0.5;
  return score;
}

function scoreFreshness(measures: Measures): number {
  return Math.max(0, 10 - measures.clicheHits * 6);
}

function scoreTightness(measures: Measures): number {
  let score = 10;
  if (measures.sentences >= 2 && measures.sentences <= 3) score += 2;
  if (measures.sentences > 4) score -= (measures.sentences - 4) * 1.5;
  score -= measures.fillerHits * 1.5;
  score -= measures.contentRepeated * 0.6;
  if (measures.chars > 120) score -= (measures.chars - 120) * 0.05;
  if (measures.words > 38) score -= (measures.words - 38) * 0.15;
  return score;
}

function scoreDelivery(measures: Measures, entry: string): number {
  let score = 8;
  if (measures.averageWordLength >= 3.5 && measures.averageWordLength <= 5.4) score += 2;
  if (measures.averageWordLength > 6) score -= 2;
  if (measures.words >= 8 && measures.words <= 32) score += 1;
  if (measures.syllables > 0 && measures.syllables / Math.max(1, measures.words) <= 1.8) score += 1;
  if (measures.sentences >= 2) score += 0.5;
  const allCaps = (entry.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  score -= allCaps * 0.75;
  if (/[!?]{2,}/.test(entry)) score -= 1;
  return score;
}

function scorePunchline(measures: Measures): number {
  let score = measures.endsOnPun ? 4 : 0;
  if (measures.sentences >= 2) score += 1;
  if (measures.exclamations === 0) score += 0.5;
  return score;
}

function scoreTableTalk(measures: Measures): number {
  let score = measures.tableHits * 2;
  if (measures.hasDialogue) score += 1;
  return score;
}

function scoreCandidate(candidate: Candidate): Scored {
  const entry = normalizeEntry(candidate.text);
  const measures = measureEntry(entry);
  const total =
    scorePun(measures, entry) * 1.35 +
    scoreFreshness(measures) * 1.1 +
    scoreTightness(measures) +
    scoreDelivery(measures, entry) * 0.85 +
    scoreTableTalk(measures) * 0.8 +
    scorePunchline(measures) * 1.2;

  return { candidate, entry, total, measures };
}

function candidateIssues(
  candidate: Candidate,
  seenIds: Set<string>,
  seenTexts: Set<string>,
): string[] {
  const issues: string[] = [];
  if (typeof candidate.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(candidate.id)) {
    issues.push(`candidate id is invalid: ${String(candidate.id)}`);
  } else if (seenIds.has(candidate.id)) {
    issues.push(`duplicate candidate id: ${candidate.id}`);
  }
  if (
    !Array.isArray(candidate.tags) ||
    candidate.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)
  ) {
    issues.push(`candidate tags are invalid: ${String(candidate.id)}`);
  }
  const normalized = typeof candidate.text === "string" ? normalizeEntry(candidate.text) : "";
  if (!isValidEntry(normalized)) {
    issues.push(`candidate text is invalid: ${String(candidate.id)}`);
  } else if (seenTexts.has(normalized.toLowerCase())) {
    issues.push(`duplicate candidate text: ${String(candidate.id)}`);
  }
  return issues;
}

function collectValidCandidates(): Candidate[] {
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const valid: Candidate[] = [];
  for (const candidate of CANDIDATES) {
    if (candidateIssues(candidate, seenIds, seenTexts).length > 0) continue;
    const normalized = normalizeEntry(candidate.text);
    seenIds.add(candidate.id);
    seenTexts.add(normalized.toLowerCase());
    valid.push({ ...candidate, text: normalized });
  }
  return valid;
}

function auditCandidatePool(): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  for (const candidate of CANDIDATES) {
    issues.push(...candidateIssues(candidate, seenIds, seenTexts));
    if (typeof candidate.id === "string") seenIds.add(candidate.id);
    if (typeof candidate.text === "string") {
      seenTexts.add(normalizeEntry(candidate.text).toLowerCase());
    }
  }
  return issues;
}

function selectBestEntry(): string {
  const scored = collectValidCandidates()
    .map(scoreCandidate)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      if (left.entry.length !== right.entry.length) return left.entry.length - right.entry.length;
      return left.candidate.id.localeCompare(right.candidate.id);
    });

  if (scored.length > 0) return scored[0].entry;
  const fallback = normalizeEntry(FALLBACK_ENTRY);
  if (isValidEntry(fallback)) return fallback;
  return normalizeEntry(LAST_RESORT_ENTRY);
}

function writeEntry(entry: string, target: string): boolean {
  const directory = dirname(target);
  tempCounter += 1;
  const tempPath = join(directory, `.entry-${process.pid}-${tempCounter}.tmp`);
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(tempPath, entry, { encoding: "utf8" });
    if (readFileSync(tempPath, "utf8") !== entry) {
      throw new Error("temporary write did not verify");
    }
    renameSync(tempPath, target);
    return readFileSync(target, "utf8") === entry;
  } catch {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // The temporary file may already be gone; nothing else to clean up.
    }
    try {
      writeFileSync(target, entry, { encoding: "utf8" });
      return readFileSync(target, "utf8") === entry;
    } catch {
      return false;
    }
  }
}

function emitEntry(entry: string): string | null {
  const normalized = normalizeEntry(entry);
  const safeEntry = isValidEntry(normalized) ? normalized : normalizeEntry(FALLBACK_ENTRY);
  const finalEntry = isValidEntry(safeEntry) ? safeEntry : normalizeEntry(LAST_RESORT_ENTRY);

  for (const target of OUTPUT_TARGETS) {
    if (writeEntry(finalEntry, target)) return target;
  }
  return null;
}

function auditInvariants(): string[] {
  const issues = auditCandidatePool();
  const fallback = normalizeEntry(FALLBACK_ENTRY);
  if (!isValidEntry(fallback)) issues.push("fallback entry is invalid");
  if (!isValidEntry(normalizeEntry(LAST_RESORT_ENTRY))) issues.push("last-resort entry is invalid");
  const sample = "  A  dad\n joke  ";
  if (normalizeText(normalizeText(sample)) !== normalizeText(sample)) {
    issues.push("text normalization is not idempotent");
  }
  if (codePointLength("AB") !== 2) issues.push("code point counting is broken");
  return issues;
}

const SELF_TESTS: TestCase[] = [
  {
    name: "normalizeText collapses whitespace",
    check: () => normalizeText("  a \n\t b  ") === "a b",
  },
  {
    name: "codePointLength counts an emoji once",
    check: () => codePointLength("A😀B") === 3,
  },
  {
    name: "splitWords removes punctuation",
    check: () => splitWords('Hi, "dad"!').join("|") === "hi|dad",
  },
  {
    name: "countSentences handles multiple endings",
    check: () => countSentences("One. Two! Three?") === 3,
  },
  {
    name: "lastSentence isolates the punchline",
    check: () => lastSentence("Setup. Final line.") === "Final line.",
  },
  {
    name: "guessSyllables handles edge cases",
    check: () => guessSyllables("cat") === 1 && guessSyllables("") === 0,
  },
  {
    name: "truncateAtBoundary respects the limit",
    check: () => {
      const cut = truncateAtBoundary("alpha beta gamma delta", 12);
      return codePointLength(cut) <= 12 && !cut.endsWith(" ");
    },
  },
  {
    name: "isValidEntry rejects blank and oversized text",
    check: () => !isValidEntry("   ") && !isValidEntry("x".repeat(MAX_ENTRY_LENGTH + 1)),
  },
  {
    name: "measureEntry detects filler and dialogue",
    check: () => {
      const measures = measureEntry('My wife said, "This is very nice."');
      return measures.fillerHits === 1 && measures.hasDialogue;
    },
  },
  {
    name: "candidate pool is non-empty and unique",
    check: () => {
      const pool = collectValidCandidates();
      const ids = new Set(pool.map((candidate) => candidate.id));
      const texts = new Set(pool.map((candidate) => candidate.text.toLowerCase()));
      return pool.length > 0 && ids.size === pool.length && texts.size === pool.length;
    },
  },
  {
    name: "selection is deterministic and valid",
    check: () => {
      const first = selectBestEntry();
      const second = selectBestEntry();
      return first === second && isValidEntry(first);
    },
  },
  {
    name: "invariant audit is clean",
    check: () => auditInvariants().length === 0,
  },
];

function runSelfTests(): boolean {
  let failures = 0;
  for (const test of SELF_TESTS) {
    let passed = false;
    try {
      passed = test.check();
    } catch {
      passed = false;
    }
    if (!passed) failures += 1;
    process.stdout.write(`${passed ? "PASS" : "FAIL"} ${test.name}\n`);
  }
  const total = SELF_TESTS.length;
  process.stdout.write(`${total - failures}/${total} checks passed\n`);
  return failures === 0;
}

if (process.argv.includes("--self-test")) {
  process.exitCode = runSelfTests() ? 0 : 1;
} else {
  const issues = auditInvariants();
  if (issues.length > 0) {
    process.stderr.write(`entry audit warnings:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n`);
  }
  const selected = selectBestEntry();
  const writtenTo = emitEntry(selected);
  if (writtenTo === null) {
    process.exitCode = 1;
  }
}
