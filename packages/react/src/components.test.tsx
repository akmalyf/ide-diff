import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import type { DiffViewerHost, TextMergeViewer } from '@ide-diff/viewer';
import { DiffEditor, MergeEditor } from './index';

beforeAll(() => {
  // jsdom has no layout APIs that CodeMirror and the viewers poke at
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
});

afterEach(cleanup);

describe('DiffEditor', () => {
  it('creates the viewer, exposes it through ref/onMount and follows prop changes', () => {
    const ref = createRef<DiffViewerHost>();
    const onMount = vi.fn();
    const { rerender, container } = render(<DiffEditor ref={ref} onMount={onMount} original={'a\nb\n'} modified={'a\nc\n'} />);
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(onMount.mock.calls[0]![0]);
    expect(ref.current!.getChanges()).toHaveLength(1);
    expect(container.querySelector('.idd-root.idd-theme-dark')).not.toBeNull();

    rerender(<DiffEditor ref={ref} onMount={onMount} original={'a\nb\n'} modified={'a\nb\n'} theme="light" />);
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(ref.current!.getModified()).toBe('a\nb\n');
    expect(ref.current!.getChanges()).toHaveLength(0);
    expect(container.querySelector('.idd-root.idd-theme-light')).not.toBeNull();

    rerender(<DiffEditor ref={ref} original={'a\nb\n'} modified={'a\nb\n'} theme="light" mode="unified" />);
    expect(ref.current!.mode).toBe('unified');
  });

  it('disposes the viewer on unmount', () => {
    const ref = createRef<DiffViewerHost>();
    const { unmount, container } = render(<DiffEditor ref={ref} original="x" modified="y" />);
    unmount();
    expect(ref.current).toBeNull();
    expect(container.querySelector('.idd-root')).toBeNull();
  });
});

describe('MergeEditor', () => {
  it('renders a 3-way merge and reports the result', () => {
    const ref = createRef<TextMergeViewer>();
    const onChange = vi.fn();
    render(<MergeEditor ref={ref} left={'A\nb\nc\nd\n'} base={'a\nb\nc\nd\n'} right={'a\nb\nc\nD\n'} onChange={onChange} />);
    expect(ref.current!.getResult()).toBe('a\nb\nc\nd\n');
    ref.current!.applyNonConflicting('all');
    expect(ref.current!.getResult()).toBe('A\nb\nc\nD\n');
    expect(onChange).toHaveBeenLastCalledWith('A\nb\nc\nD\n');
  });
});
