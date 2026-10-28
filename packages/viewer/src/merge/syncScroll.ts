// Synchronized scrolling of the three merge editors (SyncScrollSupport.ThreesideSyncScrollSupport): the master editor
// drives its neighbour(s) through the change anchors of each editor pair (left↔result, result↔right); the far editor
// follows the middle one.
import type { EditorView } from '@codemirror/view';
import { lineToY } from '../common/geometry';

/** One anchor pair: [startLineA, endLineA, startLineB, endLineB] for an editor pair (A = left one). */
export type AnchorRange = [number, number, number, number];

export class MergeSyncScroll {
  enabled = true;
  /** pairs[0] = left↔result, pairs[1] = result↔right */
  private pairs: [AnchorRange[], AnchorRange[]] = [[], []];
  private lockUntil = [0, 0, 0];

  constructor(private readonly views: [EditorView, EditorView, EditorView]) {}

  setAnchors(leftResult: AnchorRange[], resultRight: AnchorRange[]): void {
    this.pairs = [leftResult, resultRight];
  }

  /** Called on a scroll event of editor `master` (0 = left, 1 = result, 2 = right). */
  onScroll(master: 0 | 1 | 2): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now < this.lockUntil[master]!) return; // caused by us
    if (master === 1) {
      this.follow(1, 0, now);
      this.follow(1, 2, now);
    } else {
      this.follow(master, 1, now);
      this.follow(1, master === 0 ? 2 : 0, now);
    }
  }

  private follow(from: 0 | 1 | 2, to: 0 | 1 | 2, now: number): void {
    const m = this.views[from].scrollDOM;
    const s = this.views[to].scrollDOM;
    const target = this.transfer(from, to, m.scrollTop + m.clientHeight / 2) - s.clientHeight / 2;
    const clamped = Math.max(0, Math.min(target, s.scrollHeight - s.clientHeight));
    if (Math.abs(clamped - s.scrollTop) < 0.5) return;
    this.lockUntil[to] = now + 50;
    s.scrollTop = clamped;
  }

  /** Maps a document y of editor `from` to the adjacent editor `to` (|from - to| = 1). */
  transfer(from: 0 | 1 | 2, to: 0 | 1 | 2, y: number): number {
    const v1 = this.views[from];
    const v2 = this.views[to];
    const pair = this.pairs[Math.min(from, to)]!;
    const forward = from < to;
    const anchors: Array<[number, number]> = [[0, 0]];
    for (const [sA, eA, sB, eB] of pair) {
      const [s1, e1, s2, e2] = forward ? [sA, eA, sB, eB] : [sB, eB, sA, eA];
      anchors.push([lineToY(v1, s1, true), lineToY(v2, s2, true)]);
      anchors.push([lineToY(v1, e1, true), lineToY(v2, e2, true)]);
    }
    anchors.push([Math.max(v1.contentHeight, 1), Math.max(v2.contentHeight, 1)]);

    let prev = anchors[0]!;
    for (let i = 1; i < anchors.length; i++) {
      const next = anchors[i]!;
      if (y <= next[0]) {
        const span = next[0] - prev[0];
        if (span <= 0) return next[1];
        return prev[1] + ((y - prev[0]) / span) * (next[1] - prev[1]);
      }
      prev = next;
    }
    return prev[1] + (y - prev[0]);
  }

  /** Align the other editors to `master` immediately. */
  sync(master: 0 | 1 | 2): void {
    this.lockUntil[master] = 0;
    this.onScroll(master);
  }
}
