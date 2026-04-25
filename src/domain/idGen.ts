export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/^[0-9]+/, "")
    .replace(/^-+/, "");
}

export function uniqueId(
  base: string,
  taken: ReadonlySet<string>,
  fallback = "node",
): string {
  const seed = base.length > 0 ? base : fallback;
  if (!taken.has(seed)) return seed;
  let i = 2;
  while (taken.has(`${seed}-${i}`)) i++;
  return `${seed}-${i}`;
}
