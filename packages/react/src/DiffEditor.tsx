import { useEffect, useRef, type CSSProperties, type Ref } from 'react';
import { createDiffViewer, type DiffViewerHost, type DiffViewerOptions, type LineFragment } from '@ide-diff/viewer';
import { useViewer } from './useViewer';

export interface DiffEditorProps extends DiffViewerOptions {
  /** called with the modified text after every edit */
  onChange?: (modified: string) => void;
  /** called whenever the diff is recomputed */
  onDiffUpdate?: (changes: LineFragment[]) => void;
  /** called once with the viewer instance after it is created */
  onMount?: (viewer: DiffViewerHost) => void;
  /** receives the viewer instance */
  ref?: Ref<DiffViewerHost | null>;
  /** container size; defaults to 100% (the parent needs a height) */
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

const CONTROLLED = ['original', 'modified'] as const;

/**
 * JetBrains-style side-by-side / unified diff editor.
 * Pass `language` from a stable reference (module constant or useMemo) to avoid reconfiguring on every render.
 */
export function DiffEditor(props: DiffEditorProps) {
  const { onChange, onDiffUpdate, onMount, ref, height = '100%', width = '100%', className, style, ...options } = props;
  const callbacks = useRef({ onChange, onDiffUpdate });
  callbacks.current = { onChange, onDiffUpdate };

  const { container, viewer } = useViewer<DiffViewerHost, DiffViewerOptions>(
    (el, o) => {
      const v = createDiffViewer(el, o);
      v.onDidChange((text) => callbacks.current.onChange?.(text));
      v.onDidUpdateDiff((changes) => callbacks.current.onDiffUpdate?.(changes));
      return v;
    },
    options,
    ref,
    onMount,
    CONTROLLED,
  );

  // `original` / `modified` behave like controlled values: only push them when they differ from the editor
  // (so echoing onChange back into `modified` does not reset the cursor)
  useEffect(() => {
    const v = viewer.current;
    if (v && v.getOriginal() !== options.original) v.setOriginal(options.original);
  }, [options.original, viewer]);
  useEffect(() => {
    const v = viewer.current;
    if (v && v.getModified() !== options.modified) v.setModified(options.modified);
  }, [options.modified, viewer]);

  return <div ref={container} className={className} style={{ height, width, ...style }} />;
}
