/**
 * Pure bookkeeping for blobs that more than one message can reference.
 *
 * A `files` row lists the ids of the live messages pointing at its blob.
 * `undefined` marks a row created before this list existed: its references are
 * unknown, so retention leaves the blob alone rather than risk deleting bytes
 * another message still shows.
 */

/** Returns `undefined` for a legacy row, otherwise the list plus `messageId`. */
export function addMessageRef(
  refs: string[] | undefined,
  messageId: string,
): string[] | undefined {
  if (refs === undefined) return undefined;
  return refs.includes(messageId) ? refs : [...refs, messageId];
}

/** Returns `undefined` for a legacy row, otherwise the list without `messageId`. */
export function removeMessageRef(
  refs: string[] | undefined,
  messageId: string,
): string[] | undefined {
  if (refs === undefined) return undefined;
  return refs.filter((id) => id !== messageId);
}

/** True only when the list is defined and empty, i.e. nobody needs the blob. */
export function shouldDeleteBlob(refs: string[] | undefined): boolean {
  return refs !== undefined && refs.length === 0;
}
