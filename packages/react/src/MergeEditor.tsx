import { useRef, type CSSProperties, type Ref } from 'react';
import { createMergeViewer, type MergeStatus, type MergeViewerOptions, type TextMergeViewer } from '@ide-diff/viewer';
import { useViewer } from './useViewer';

export interface MergeEditorProps extends MergeViewerOptions {
  /** called with the result text after every change */
  onChange?: (result: string) => void;
  /** called when the number of unresolved changes / conflicts changes */
  onStatusChange?: (status: MergeStatus) => void;
  onMount?: (viewer: TextMergeViewer) => void;
  ref?: Ref<TextMergeViewer | null>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** JetBrains-style 3-way merge editor (Left | Result | Right). */
export function MergeEditor(props: MergeEditorProps) {
  const { onChange, onStatusChange, onMount, ref, height = '100%', width = '100%', className, style, ...options } = props;
  const callbacks = useRef({ onChange, onStatusChange });
  callbacks.current = { onChange, onStatusChange };

  const { container } = useViewer<TextMergeViewer, MergeViewerOptions>(
    (el, o) => {
      const v = createMergeViewer(el, o);
      v.onDidChange((text) => callbacks.current.onChange?.(text));
      v.onDidUpdateStatus((status) => callbacks.current.onStatusChange?.(status));
      return v;
    },
    options,
    ref,
    onMount,
  );

  return <div ref={container} className={className} style={{ height, width, ...style }} />;
}
