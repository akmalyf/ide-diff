// Shared lifecycle for the viewer components: create once on mount, forward option changes with setOptions,
// dispose on unmount, keep callbacks fresh without re-creating the viewer.
import { useLayoutEffect, useRef, type Ref, type RefObject } from 'react';

export function assignRef<T>(ref: Ref<T> | undefined, value: T): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as RefObject<T>).current = value;
}

interface Viewer<O> {
  setOptions(options: Partial<O>): void;
  dispose(): void;
}

/**
 * Creates the viewer in a layout effect (so the instance is available to parent layout effects and refs),
 * then diffs `options` key by key on every render and forwards only the changed keys.
 */
export function useViewer<V extends Viewer<O>, O extends object>(
  create: (container: HTMLDivElement, options: O) => V,
  options: O,
  ref: Ref<V | null> | undefined,
  onMount?: (viewer: V) => void,
  /** keys handled elsewhere (e.g. controlled texts) and never forwarded through setOptions */
  skip: ReadonlyArray<keyof O> = [],
): { container: RefObject<HTMLDivElement | null>; viewer: RefObject<V | null> } {
  const container = useRef<HTMLDivElement | null>(null);
  const viewer = useRef<V | null>(null);
  const applied = useRef<O>(options);

  useLayoutEffect(() => {
    const instance = create(container.current!, options);
    viewer.current = instance;
    applied.current = options;
    assignRef(ref, instance);
    onMount?.(instance);
    return () => {
      instance.dispose();
      viewer.current = null;
      assignRef(ref, null);
    };
    // the viewer is created once; later prop changes go through setOptions below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const instance = viewer.current;
    if (!instance) return;
    const changed: Partial<O> = {};
    let any = false;
    for (const key of Object.keys(options) as Array<keyof O>) {
      if (!skip.includes(key) && !Object.is(options[key], applied.current[key])) {
        changed[key] = options[key];
        any = true;
      }
    }
    applied.current = options;
    if (any) instance.setOptions(changed);
  });

  return { container, viewer };
}
