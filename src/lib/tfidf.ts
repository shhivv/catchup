const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for",
  "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his",
  "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my",
  "one", "all", "would", "there", "their", "what", "so", "up", "out", "if",
  "about", "who", "get", "which", "go", "me", "when", "make", "can", "like",
  "time", "no", "just", "him", "know", "take", "people", "into", "year",
  "your", "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also", "back",
  "after", "use", "two", "how", "our", "work", "first", "well", "way",
  "even", "new", "want", "because", "any", "these", "give", "day", "most",
  "us", "was", "were", "been", "has", "had", "are", "did", "does", "is",
  "am", "more", "very", "much", "such", "many", "may", "still", "should",
  "each", "where", "here", "while", "said", "own", "same", "being",
  "through", "between", "both", "those", "under", "since", "down",
  "before", "right", "too", "long", "made", "thing", "things",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function extractKeywords(
  text: string,
  maxKeywords = 15
): { term: string; weight: number }[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);

  const maxFreq = Math.max(...freq.values());
  const scored = Array.from(freq.entries()).map(([term, count]) => ({
    term,
    weight: count / maxFreq,
  }));

  scored.sort((a, b) => b.weight - a.weight);
  return scored.slice(0, maxKeywords);
}

export function buildProfile(
  allKeywords: { term: string; weight: number }[][]
): Map<string, number> {
  const profile = new Map<string, number>();
  for (const keywords of allKeywords) {
    for (const { term, weight } of keywords) {
      profile.set(term, (profile.get(term) || 0) + weight);
    }
  }

  if (profile.size === 0) return profile;
  const maxVal = Math.max(...profile.values());
  for (const [k, v] of profile) profile.set(k, v / maxVal);

  return profile;
}

export function scoreArticle(
  articleText: string,
  profile: Map<string, number>
): number {
  if (profile.size === 0) return 0;

  const tokens = tokenize(articleText);
  if (tokens.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const maxFreq = Math.max(...freq.values());

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, pWeight] of profile) {
    normA += pWeight * pWeight;
    const aWeight = (freq.get(term) || 0) / maxFreq;
    if (aWeight > 0) dot += pWeight * aWeight;
  }

  for (const [, count] of freq) {
    const w = count / maxFreq;
    normB += w * w;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function segmentHtml(
  html: string
): { html: string; text: string; index: number }[] {
  const segments: { html: string; text: string; index: number }[] = [];

  const blockPattern =
    /<(p|h[1-6]|blockquote|li|figcaption|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let index = 0;

  while ((match = blockPattern.exec(html)) !== null) {
    const segHtml = match[0];
    const text = match[2].replace(/<[^>]*>/g, "").trim();
    if (text.length > 20) {
      segments.push({ html: segHtml, text, index });
      index++;
    }
  }

  if (segments.length === 0 && html.length > 0) {
    const plainText = html.replace(/<[^>]*>/g, "").trim();
    const paragraphs = plainText.split(/\n\n+/).filter((p) => p.length > 20);
    for (const p of paragraphs) {
      segments.push({ html: `<p>${p}</p>`, text: p, index });
      index++;
    }
  }

  return segments;
}
