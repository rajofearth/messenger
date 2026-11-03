/**
 * Pure conversation rules: the direct-chat lookup key, member deduplication,
 * the group name fallback and the membership test.
 *
 * Nothing here touches a Convex context, so `scripts/conversations.test.mjs`
 * can import it directly and both the mutation and the query paths agree on
 * the same rules.
 */

/**
 * The key that makes a direct conversation unique. Sorting the two subjects
 * means either side finds the row the other already created.
 */
export function directKey(a: string, b: string): string {
  return `direct:${[a, b].sort().join(":")}`;
}

/** Keeps the caller's order, so the creator stays first, and drops repeats. */
export function uniqueMembers(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** A group needs a visible name; a blank or whitespace-only one gets a default. */
export function groupTitle(input: string): string {
  return input.trim() || "New group";
}

export function isMember(ids: readonly string[], subjectId: string): boolean {
  return ids.includes(subjectId);
}
