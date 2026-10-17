import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async loader when the component appears and whenever `deps` change.
// Returns { data, error, loading, reload, setData }. A slow answer for an old request never overwrites a newer one.
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const latest = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const ticket = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef.current().then(
      (data) => { if (ticket === latest.current) setState({ data, error: null, loading: false }); },
      (error) => { if (ticket === latest.current) setState({ data: undefined, error, loading: false }); },
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); return () => { latest.current++; }; }, deps);

  const setData = useCallback((next) => setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next })), []);
  return { ...state, reload: run, setData };
}
