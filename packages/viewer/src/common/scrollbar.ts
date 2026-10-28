// Overlay vertical scrollbar with error-stripe change markers (EditorMarkupModel / DiffStripeMarkerTextAttributes).
// The left diff editor puts it on the left edge (VERTICAL_SCROLLBAR_LEFT), the right one on the right edge.
import type { EditorView } from '@codemirror/view';
import { el } from '../toolbar/ui';

export interface StripeMark {
  /** document offsets on this side */
  from: number;
  to: number;
  type: string; // inserted | deleted | modified | conflict
}

export class OverlayScrollbar {
  readonly dom: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly stripes: HTMLDivElement;
  private marks: StripeMark[] = [];
  private dragOffset = -1;

  constructor(
    private readonly view: EditorView,
    side: 'left' | 'right',
  ) {
    this.dom = el('div', `idd-vscroll idd-vscroll-${side}`);
    this.stripes = el('div');
    this.thumb = el('div', 'idd-thumb');
    this.dom.append(this.stripes, this.thumb);
    this.dom.addEventListener('mousedown', this.onMouseDown);
  }

  setMarks(marks: StripeMark[]): void {
    this.marks = marks;
    this.update();
  }

  /** Re-measure; call on scroll / geometry change. */
  update(): void {
    const scroller = this.view.scrollDOM;
    const track = this.dom.clientHeight;
    const total = Math.max(scroller.scrollHeight, 1);
    const visible = scroller.clientHeight;
    if (track <= 0) return;
    const scrollable = total > visible + 1;
    this.thumb.style.display = scrollable ? '' : 'none';
    if (scrollable) {
      const height = Math.max(16, (visible / total) * track);
      const top = (scroller.scrollTop / (total - visible)) * (track - height);
      this.thumb.style.height = `${height}px`;
      this.thumb.style.top = `${top}px`;
    }
    this.renderStripes(track);
  }

  private renderStripes(track: number): void {
    const view = this.view;
    const docHeight = Math.max(view.contentHeight, 1);
    const frag = document.createDocumentFragment();
    for (const mark of this.marks) {
      const from = Math.min(mark.from, view.state.doc.length);
      const to = Math.min(Math.max(mark.to, from), view.state.doc.length);
      const top = view.lineBlockAt(from).top;
      const bottom = view.lineBlockAt(to).bottom;
      const stripe = el('div', 'idd-stripe');
      const y = (top / docHeight) * track;
      const h = Math.max(2, ((bottom - top) / docHeight) * track);
      stripe.style.top = `${y}px`;
      stripe.style.height = `${mark.from === mark.to ? 2 : h}px`;
      stripe.style.background = `var(--idd-diff-${mark.type}-stripe)`;
      frag.appendChild(stripe);
    }
    this.stripes.replaceChildren(frag);
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const scroller = this.view.scrollDOM;
    const rect = this.dom.getBoundingClientRect();
    const thumbRect = this.thumb.getBoundingClientRect();
    const onThumb = this.thumb.style.display !== 'none' && e.clientY >= thumbRect.top && e.clientY <= thumbRect.bottom;
    const thumbHeight = thumbRect.height;
    this.dragOffset = onThumb ? e.clientY - thumbRect.top : thumbHeight / 2;
    const apply = (clientY: number) => {
      const track = rect.height - thumbHeight;
      const ratio = track > 0 ? (clientY - rect.top - this.dragOffset) / track : 0;
      scroller.scrollTop = Math.max(0, Math.min(1, ratio)) * (scroller.scrollHeight - scroller.clientHeight);
    };
    if (!onThumb) apply(e.clientY);
    this.dom.classList.add('idd-dragging');
    const move = (ev: MouseEvent) => apply(ev.clientY);
    const up = () => {
      this.dom.classList.remove('idd-dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  destroy(): void {
    this.dom.remove();
  }
}
