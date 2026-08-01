import { Component, Input } from '@angular/core';
import { SlicePipe } from '@angular/common';
import type { KinshipGraphPayload } from '../../core/services/kinship-api.service';

@Component({
  selector: 'app-kinship-graph',
  imports: [SlicePipe],
  templateUrl: './kinship-graph.html',
  styleUrl: './kinship-graph.css',
})
export class KinshipGraphComponent {
  @Input() graph: KinshipGraphPayload | null = null;
  @Input() highlightIds: string[] = [];

  readonly width = 760;

  get height(): number {
    if (!this.graph?.nodes.length) return 360;
    const maxY = Math.max(...this.graph.nodes.map((n) => n.y), 120);
    return Math.max(360, maxY + 100);
  }

  nodePos(id: string) {
    return this.graph?.nodes.find((n) => n.id === id);
  }

  isHighlight(id: string): boolean {
    return this.highlightIds.includes(id);
  }

  edgePath(e: KinshipGraphPayload['edges'][number]): string {
    const a = this.nodePos(e.source);
    const b = this.nodePos(e.target);
    if (!a || !b) return '';
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 20;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }

  midX(e: KinshipGraphPayload['edges'][number]): number {
    const a = this.nodePos(e.source);
    const b = this.nodePos(e.target);
    if (!a || !b) return 0;
    return (a.x + b.x) / 2;
  }

  midY(e: KinshipGraphPayload['edges'][number]): number {
    const a = this.nodePos(e.source);
    const b = this.nodePos(e.target);
    if (!a || !b) return 0;
    return (a.y + b.y) / 2 - 8;
  }
}
