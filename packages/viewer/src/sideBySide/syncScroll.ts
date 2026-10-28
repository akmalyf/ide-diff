// Synchronized vertical scrolling (SyncScrollSupport.TwosideSyncScrollSupport). The master editor's viewport
// center is mapped to the other editor through anchor points at every change boundary; inside a change the
// position is interpolated, so an insertion on one side holds the other side still.
import type { EditorView } from '@codemirror/view';
import { lineToY } from '../common/geometry';
import type { DividerChange } from './divider';

export class SyncScroll {
  enabled = true;
  private changes: DividerChange[] = [];
  private lockUntil = [0, 0];

  constructor(private readonly views: [EditorView, EditorView]) {}

  setChanges(changes: DividerChange[]): void {
    this.changes = changes;
  }

  /** Called on a scroll event of editor `master` (0 = left, 1 = right). */
  onScroll(master: 0 | 1): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now < this.lockUntil[master]!) return; // this scroll was caused by us
    const slave = (1 - master) as 0 | 1;
    const m = this.views[master].scrollDOM;
    const s = this.views[slave].scrollDOM;
    const target = this.transfer(master, m.scrollTop + m.clientHeight / 2) - s.clientHeight / 2;
    const clamped = Math.max(0, Math.min(target, s.scrollHeight - s.clientHeight));
    if (Math.abs(clamped - s.scrollTop) < 0.5) return;
    this.lockUntil[slave] = now + 50;
    s.scrollTop = clamped;
  }

  /** Maps a document y of side `from` to the corresponding y on the other side. */
  transfer(from: 0 | 1, y: number): number {
    const v1 = this.views[from];
    const v2 = this.views[1 - from]!;
    const anchors: Array<[number, number]> = [[0, 0]];
    for (const c of this.changes) {
      const s1 = from === 0 ? c.startLine1 : c.startLine2;
      const e1 = from === 0 ? c.endLine1 : c.endLine2;
      const s2 = from === 0 ? c.startLine2 : c.startLine1;
      const e2 = from === 0 ? c.endLine2 : c.endLine1;
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

  /** Align the other editor to `master` immediately (used after toggling sync on, folding, etc.). */
  sync(master: 0 | 1): void {
    this.lockUntil[master] = 0;
    this.onScroll(master);
  }
}
