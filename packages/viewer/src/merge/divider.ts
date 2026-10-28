// Divider between two merge editors: DiffDividerDrawUtil.paintPolygons with ResolvablePainter — unresolved changes are
// filled curved trapezia, resolved ones only get a bold dotted border (no fill) — plus the wavy connectors of
// collapsed unchanged fragments (DiffLineSeparatorRenderer.drawConnectorLine).
import type { EditorView } from '@codemirror/view';
import type { TextDiffType } from '@ide-diff/core';
import { markerPaintRange } from '../common/geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CTRL_PROXIMITY_X = 0.3;

export interface MergeDividerChange {
  startLine1: number;
  endLine1: number;
  startLine2: number;
  endLine2: number;
  type: TextDiffType;
  resolved: boolean;
}

export interface MergeDividerFold {
  /** document y of the fold widget on each side */
  pos1: number;
  pos2: number;
}

export class MergeDivider {
  readonly dom: HTMLDivElement;
  private readonly svg: SVGSVGElement;

  constructor() {
    this.dom = document.createElement('div');
    this.dom.className = 'idd-divider';
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.dom.appendChild(this.svg);
  }

  paint(view1: EditorView, view2: EditorView, changes: MergeDividerChange[], folds: MergeDividerFold[]): void {
    const rect = this.dom.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;
    const top1 = view1.documentTop - rect.top;
    const top2 = view2.documentTop - rect.top;
    const a = width * CTRL_PROXIMITY_X;
    const b = width * (1 - CTRL_PROXIMITY_X);
    const curve = (y1: number, y2: number) => `M0 ${y1} C${a} ${y1} ${b} ${y2} ${width} ${y2}`;
    const parts: string[] = [];

    for (const c of changes) {
      const r1 = markerPaintRange(view1, c.startLine1, c.endLine1);
      const r2 = markerPaintRange(view2, c.startLine2, c.endLine2);
      const start1 = r1.y1 + top1;
      const end1 = r1.y2 + top1;
      const start2 = r2.y1 + top2;
      const end2 = r2.y2 + top2;
      if ((end1 < 0 && end2 < 0) || (start1 > height && start2 > height)) continue;

      // DividerPolygon.paint
      let sY1: number, eY1: number, sY2: number, eY2: number;
      if (end1 - start1 < 2) {
        sY1 = start1 - 1;
        eY1 = start1;
      } else {
        sY1 = start1;
        eY1 = end1 - 1;
      }
      if (end2 - start2 < 2) {
        sY2 = start2 - 1;
        eY2 = start2;
      } else {
        sY2 = start2;
        eY2 = end2 - 1;
      }
      const color = `var(--idd-diff-${c.type.toLowerCase()}-bg)`;
      if (c.resolved) {
        // ResolvablePainter: border only, BOLD_DOTTED_STROKE
        const dotted = `fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="2 2"`;
        parts.push(`<path d="${curve(sY1, sY2)}" ${dotted}/>`, `<path d="${curve(eY1 + 1, eY2 + 1)}" ${dotted}/>`);
      } else {
        const path =
          `M0 ${sY1} C${a} ${sY1} ${b} ${sY2} ${width} ${sY2} ` +
          `L${width} ${eY2 + 1} C${b} ${eY2 + 1} ${a} ${eY1 + 1} 0 ${eY1 + 1} Z`;
        parts.push(
          `<path d="${path}" fill="${color}"/>`,
          // drawCurveTrapezium: never thinner than 1px for high slopes
          `<path d="${curve((sY1 + eY1) / 2, (sY2 + eY2) / 2)}" fill="none" stroke="${color}" stroke-width="1"/>`,
        );
      }
    }

    for (const f of folds) {
      const y1 = f.pos1 + top1;
      const y2 = f.pos2 + top2;
      if ((y1 < -20 && y2 < -20) || (y1 > height + 20 && y2 > height + 20)) continue;
      parts.push(`<path d="${wavePath(width, y1, y2)}" fill="none" stroke="var(--idd-diff-separator-wave)" stroke-width="1"/>`);
    }

    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.innerHTML = parts.join('');
  }
}

/** A wave (period 16px, amplitude 3px) whose baseline follows the divider curve from y1 to y2. */
function wavePath(width: number, y1: number, y2: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 1) {
    const t = x / width;
    const s = 3 * (1 - t) * t * t + t * t * t;
    const y = y1 + (y2 - y1) * s - 3 * Math.cos((2 * Math.PI * x) / 16);
    pts.push(`${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`);
  }
  return pts.join(' ');
}
