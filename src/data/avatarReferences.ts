export type AvatarReference = {
  id: string;
  uri?: string;
};

type Unreferenced = (uri: string) => void;

/** Tracks profile URLs across the current chat/story/self snapshots. */
export function createAvatarReferenceIndex(onUnreferenced: Unreferenced) {
  const scopes = new Map<string, Map<string, string>>();
  const counts = new Map<string, number>();

  function add(uri: string | undefined) {
    if (!uri || !/^https?:\/\//i.test(uri)) return;
    counts.set(uri, (counts.get(uri) ?? 0) + 1);
  }

  function remove(uri: string | undefined) {
    if (!uri || !/^https?:\/\//i.test(uri)) return;
    const count = (counts.get(uri) ?? 0) - 1;
    if (count > 0) {
      counts.set(uri, count);
      return;
    }
    counts.delete(uri);
    onUnreferenced(uri);
  }

  function sync(scope: string, references: AvatarReference[]) {
    const previous = scopes.get(scope) ?? new Map<string, string>();
    const next = new Map<string, string>();
    for (const reference of references) {
      if (!reference.uri || !/^https?:\/\//i.test(reference.uri)) continue;
      next.set(reference.id, reference.uri);
    }
    for (const [id, uri] of previous) {
      if (next.get(id) !== uri) remove(uri);
    }
    for (const [id, uri] of next) {
      if (previous.get(id) !== uri) add(uri);
    }
    if (next.size) scopes.set(scope, next);
    else scopes.delete(scope);
  }

  function clear() {
    scopes.clear();
    counts.clear();
  }

  return {
    sync,
    clear,
    isReferenced: (uri: string) => (counts.get(uri) ?? 0) > 0,
    references: () => new Set(counts.keys()),
  };
}
