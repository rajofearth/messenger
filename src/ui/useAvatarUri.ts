import { useEffect, useState } from "react";
import {
  cachedAvatarUri,
  localAvatarUri,
  subscribeAvatarCache,
} from "../data/avatars";

type AvatarState = {
  input?: string;
  resolved?: string;
};

/** Resolves an avatar through the shared file cache before allowing remote fallback. */
export function useAvatarUri(uri: string | undefined): string | undefined {
  const [state, setState] = useState<AvatarState>(() => ({
    input: uri,
    resolved: cachedAvatarUri(uri),
  }));
  const [, refresh] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeAvatarCache(() => {
      refresh((value) => value + 1);
      setState((current) => {
        if (current.input !== uri) return current;
        const cached = cachedAvatarUri(uri);
        return {
          input: uri,
          resolved: cached ?? (uri && /^(https?:\/\/)/i.test(uri) ? uri : undefined),
        };
      });
    });
    return () => {
      unsubscribe();
    };
  }, [uri]);

  useEffect(() => {
    let active = true;
    const cached = cachedAvatarUri(uri);
    setState({ input: uri, resolved: cached });
    if (!uri || cached || /^(file|content|asset|data):/i.test(uri)) return;
    void localAvatarUri(uri).then((local) => {
      if (active) setState({ input: uri, resolved: local ?? uri });
    });
    return () => {
      active = false;
    };
  }, [uri]);

  if (cachedAvatarUri(uri)) return cachedAvatarUri(uri);
  return state.input === uri ? state.resolved : undefined;
}
