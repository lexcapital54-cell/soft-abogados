import { createHash } from 'node:crypto';
import type {
  GraphEdge,
  InferredKinshipLabel,
  KinshipDegree,
  KinshipGraphPayload,
  KinshipRelation,
  Person,
} from './kinship.types';

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string | null | undefined): string[] {
  return norm(value).split(' ').filter(Boolean);
}

function yearGap(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

function genderGuess(nombres: string): 'M' | 'F' | 'U' {
  const first = tokens(nombres)[0] ?? '';
  if (!first) return 'U';
  if (
    /(A|IA|INA|ELA|ISA|ANA|ENIA|EZ|UD)$/.test(first) &&
    !/(JOSE|JOSHUA|JONAS|MATIAS|NICOLAS|ANDRES)$/.test(first)
  ) {
    return 'F';
  }
  return 'M';
}

function labelFor(
  degree: KinshipDegree,
  titular: Person,
  familiar: Person,
  preferred?: InferredKinshipLabel,
): { label: InferredKinshipLabel; display: string } {
  if (preferred) {
    const map: Record<InferredKinshipLabel, string> = {
      PADRE: '1er Grado — Padre',
      MADRE: '1er Grado — Madre',
      HIJO: '1er Grado — Hijo',
      HIJA: '1er Grado — Hija',
      HERMANO: '2do Grado — Hermano',
      HERMANA: '2do Grado — Hermana',
      ABUELO: '2do Grado — Abuelo',
      ABUELA: '2do Grado — Abuela',
      NIETO: '2do Grado — Nieto',
      NIETA: '2do Grado — Nieta',
      TIO: '3er Grado — Tío',
      TIA: '3er Grado — Tía',
      SOBRINO: '3er Grado — Sobrino',
      SOBRINA: '3er Grado — Sobrina',
      OTRO: `${degree}er Grado — Parentesco`,
    };
    return { label: preferred, display: map[preferred] };
  }

  const g = genderGuess(familiar.nombres);
  const gap = yearGap(titular.anioNacimiento, familiar.anioNacimiento);
  if (degree === 1) {
    if (gap != null && familiar.anioNacimiento != null && titular.anioNacimiento != null) {
      if (familiar.anioNacimiento < titular.anioNacimiento) {
        return g === 'F'
          ? { label: 'MADRE', display: '1er Grado — Madre' }
          : { label: 'PADRE', display: '1er Grado — Padre' };
      }
      return g === 'F'
        ? { label: 'HIJA', display: '1er Grado — Hija' }
        : { label: 'HIJO', display: '1er Grado — Hijo' };
    }
    return { label: 'HIJO', display: '1er Grado — Hijo/a' };
  }
  if (degree === 2) {
    if (gap != null && gap <= 15) {
      return g === 'F'
        ? { label: 'HERMANA', display: '2do Grado — Hermana' }
        : { label: 'HERMANO', display: '2do Grado — Hermano' };
    }
    if (
      gap != null &&
      familiar.anioNacimiento != null &&
      titular.anioNacimiento != null &&
      familiar.anioNacimiento > titular.anioNacimiento
    ) {
      return g === 'F'
        ? { label: 'NIETA', display: '2do Grado — Nieta' }
        : { label: 'NIETO', display: '2do Grado — Nieto' };
    }
    return g === 'F'
      ? { label: 'ABUELA', display: '2do Grado — Abuela' }
      : { label: 'ABUELO', display: '2do Grado — Abuelo' };
  }
  if (degree === 3) {
    if (
      gap != null &&
      familiar.anioNacimiento != null &&
      titular.anioNacimiento != null &&
      familiar.anioNacimiento > titular.anioNacimiento
    ) {
      return g === 'F'
        ? { label: 'SOBRINA', display: '3er Grado — Sobrina' }
        : { label: 'SOBRINO', display: '3er Grado — Sobrino' };
    }
    return g === 'F'
      ? { label: 'TIA', display: '3er Grado — Tía' }
      : { label: 'TIO', display: '3er Grado — Tío' };
  }
  return { label: 'OTRO', display: '4to Grado — Colateral' };
}

/**
 * Motor de emparejamiento y cálculo de grados por BFS sobre grafo bidireccional.
 */
export class KinshipEngine {
  private readonly people = new Map<string, Person>();
  private readonly adj = new Map<string, Map<string, GraphEdge>>();

  constructor(titulares: Person[], candidatos: Person[]) {
    for (const p of [...titulares, ...candidatos]) {
      this.people.set(p.id, p);
      this.adj.set(p.id, new Map());
    }
  }

  analyze(): KinshipRelation[] {
    this.linkDirectParents();
    this.linkBySurnameAge();
    this.linkSiblings();
    return this.extractRelations();
  }

  buildGraphForRelation(relation: KinshipRelation): KinshipGraphPayload {
    const ids = new Set<string>([
      relation.titularId,
      relation.familiarId,
      ...(relation.edgePath ?? []),
    ]);
    // Incluye vecinos inmediatos del titular para contexto
    for (const [to] of this.adj.get(relation.titularId) ?? []) {
      ids.add(to);
    }

    const nodes = [...ids]
      .map((id) => this.people.get(id))
      .filter((p): p is Person => !!p);

    const titular = relation.titular;
    const layout = this.layoutTree(titular.id, nodes);

    const edges: KinshipGraphPayload['edges'] = [];
    for (const n of nodes) {
      for (const [to, edge] of this.adj.get(n.id) ?? []) {
        if (!ids.has(to) || n.id > to) continue;
        const deg = this.bfsDegree(n.id, to) ?? 1;
        edges.push({
          id: `${n.id}-${to}`,
          source: n.id,
          target: to,
          degree: deg,
          label: `${deg}°`,
        });
      }
    }

    return {
      nodes: nodes.map((p) => ({
        id: p.id,
        label: p.fullName,
        cedula: p.cedula,
        anioNacimiento: p.anioNacimiento,
        source: p.source,
        x: layout.get(p.id)?.x ?? 0,
        y: layout.get(p.id)?.y ?? 0,
      })),
      edges,
    };
  }

  private addEdge(
    a: string,
    b: string,
    kind: GraphEdge['kind'],
    weight: number,
    reasons: string[],
  ) {
    if (a === b) return;
    if (!this.adj.has(a) || !this.adj.has(b)) return;
    const existing = this.adj.get(a)!.get(b);
    if (existing && existing.weight >= weight) {
      existing.reasons = [...new Set([...existing.reasons, ...reasons])];
      return;
    }
    const edge: GraphEdge = { from: a, to: b, kind, weight, reasons };
    this.adj.get(a)!.set(b, edge);
    this.adj.get(b)!.set(a, { ...edge, from: b, to: a });
  }

  /** Regla 1: mención explícita de padre/madre */
  private linkDirectParents() {
    const titulares = [...this.people.values()].filter(
      (p) => p.source === 'TITULAR',
    );
    const candidatos = [...this.people.values()].filter(
      (p) => p.source === 'CANDIDATO',
    );

    for (const c of candidatos) {
      const parentsBlob = norm(c.nombresPadres);
      if (!parentsBlob) continue;
      for (const t of titulares) {
        const tName = norm(t.fullName);
        const tTokens = tokens(t.fullName).filter((x) => x.length > 2);
        const hit =
          (tName.length > 5 && parentsBlob.includes(tName)) ||
          (tTokens.length >= 2 &&
            tTokens.every((tok) => parentsBlob.includes(tok)));
        if (!hit) continue;
        this.addEdge(t.id, c.id, 'PARENT_CHILD', 0.95, [
          'Mención explícita del titular en nombres de padres',
        ]);
      }
    }
  }

  /** Regla 2: apellidos + diferencia de edad 18–45 → padre/hijo */
  private linkBySurnameAge() {
    const titulares = [...this.people.values()].filter(
      (p) => p.source === 'TITULAR',
    );
    const byFirst = new Map<string, Person[]>();
    for (const c of this.people.values()) {
      if (c.source !== 'CANDIDATO') continue;
      const key = norm(c.primerApellido);
      if (!key) continue;
      const list = byFirst.get(key) ?? [];
      list.push(c);
      byFirst.set(key, list);
    }

    for (const t of titulares) {
      const key = norm(t.primerApellido);
      if (!key) continue;
      const pool = byFirst.get(key) ?? [];
      for (const c of pool) {
        const gap = yearGap(t.anioNacimiento, c.anioNacimiento);
        const sameSecond =
          !!norm(t.segundoApellido) &&
          norm(t.segundoApellido) === norm(c.segundoApellido);
        const sameCity =
          !!norm(t.ciudadNacimiento) &&
          norm(t.ciudadNacimiento) === norm(c.ciudadNacimiento);

        if (gap != null && gap >= 18 && gap <= 45) {
          const weight = 0.72 + (sameSecond ? 0.12 : 0) + (sameCity ? 0.08 : 0);
          const reasons = [
            `Apellido paterno coincidente (${t.primerApellido})`,
            `Diferencia de edad ${gap} años (rango 18–45)`,
          ];
          if (sameSecond) reasons.push('Segundo apellido coincidente');
          if (sameCity) reasons.push('Misma ciudad de nacimiento');
          this.addEdge(t.id, c.id, 'PARENT_CHILD', Math.min(0.96, weight), reasons);
        } else if (gap != null && gap >= 46 && gap <= 70 && sameSecond) {
          this.addEdge(t.id, c.id, 'INFERRED', 0.62, [
            'Apellidos compartidos',
            `Diferencia generacional ${gap} años (posible abuelo/nieto)`,
          ]);
        }
      }
    }
  }

  /** Regla 3: hermanos por dos apellidos + ciudad + años cercanos */
  private linkSiblings() {
    const all = [...this.people.values()];
    const buckets = new Map<string, Person[]>();
    for (const p of all) {
      const a1 = norm(p.primerApellido);
      const a2 = norm(p.segundoApellido);
      if (!a1 || !a2) continue;
      const key = `${a1}|${a2}`;
      const list = buckets.get(key) ?? [];
      list.push(p);
      buckets.set(key, list);
    }

    for (const group of buckets.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]!;
          const b = group[j]!;
          const gap = yearGap(a.anioNacimiento, b.anioNacimiento);
          const sameCity =
            !!norm(a.ciudadNacimiento) &&
            norm(a.ciudadNacimiento) === norm(b.ciudadNacimiento);
          if (gap != null && gap <= 18) {
            const weight = 0.7 + (sameCity ? 0.15 : 0);
            const reasons = [
              'Dos apellidos idénticos',
              `Años de nacimiento cercanos (Δ${gap})`,
            ];
            if (sameCity) reasons.push('Misma ciudad de nacimiento');
            this.addEdge(a.id, b.id, 'SIBLING', Math.min(0.94, weight), reasons);
          }
        }
      }
    }
  }

  private bfsDegree(from: string, to: string): number | null {
    if (from === to) return 0;
    const q: Array<{ id: string; d: number }> = [{ id: from, d: 0 }];
    const seen = new Set<string>([from]);
    while (q.length) {
      const cur = q.shift()!;
      for (const [next] of this.adj.get(cur.id) ?? []) {
        if (seen.has(next)) continue;
        const d = cur.d + 1;
        if (next === to) return d;
        if (d >= 4) continue;
        seen.add(next);
        q.push({ id: next, d });
      }
    }
    return null;
  }

  private bfsPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    const q: string[] = [from];
    const prev = new Map<string, string | null>([[from, null]]);
    while (q.length) {
      const cur = q.shift()!;
      for (const [next] of this.adj.get(cur) ?? []) {
        if (prev.has(next)) continue;
        prev.set(next, cur);
        if (next === to) {
          const path: string[] = [];
          let walk: string | null = to;
          while (walk) {
            path.push(walk);
            walk = prev.get(walk) ?? null;
          }
          return path.reverse();
        }
        q.push(next);
      }
    }
    return null;
  }

  private extractRelations(): KinshipRelation[] {
    const titulares = [...this.people.values()].filter(
      (p) => p.source === 'TITULAR',
    );
    const out: KinshipRelation[] = [];
    const seenPairs = new Set<string>();

    for (const t of titulares) {
      // Distancia directa por aristas y por BFS hasta grado 3
      const reachable = new Map<string, number>();
      const q: Array<{ id: string; d: number }> = [{ id: t.id, d: 0 }];
      const visited = new Set<string>([t.id]);
      while (q.length) {
        const cur = q.shift()!;
        for (const [next, edge] of this.adj.get(cur.id) ?? []) {
          if (visited.has(next)) continue;
          const d = cur.d + 1;
          if (d > 3) continue;
          visited.add(next);
          reachable.set(next, d);
          // Preferir peso de arista para confianza
          q.push({ id: next, d });
          void edge;
        }
      }

      for (const [fid, degree] of reachable) {
        const familiar = this.people.get(fid);
        if (!familiar || familiar.source === 'TITULAR') continue;
        const pairKey = `${t.id}|${fid}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const direct = this.adj.get(t.id)?.get(fid);
        const path = this.bfsPath(t.id, fid) ?? [t.id, fid];
        let confidence = direct?.weight ?? 0.55;
        const reasons = [...(direct?.reasons ?? [])];

        if (!direct && degree === 2) {
          confidence = 0.58;
          reasons.push('Inferido por camino de 2 aristas (BFS)');
        } else if (!direct && degree === 3) {
          confidence = 0.48;
          reasons.push('Inferido por camino de 3 aristas (BFS)');
        }

        // Bonus cédulas distintas pero ciudad expedición
        if (
          !!norm(t.ciudadExpedicion) &&
          norm(t.ciudadExpedicion) === norm(familiar.ciudadExpedicion)
        ) {
          confidence = Math.min(0.99, confidence + 0.04);
          reasons.push('Misma ciudad de expedición de cédula');
        }

        const preferred: InferredKinshipLabel | undefined =
          direct?.kind === 'SIBLING'
            ? genderGuess(familiar.nombres) === 'F'
              ? 'HERMANA'
              : 'HERMANO'
            : undefined;

        const { label, display } = labelFor(
          degree as KinshipDegree,
          t,
          familiar,
          preferred,
        );

        out.push({
          id: createHash('sha1').update(pairKey).digest('hex').slice(0, 16),
          titularId: t.id,
          familiarId: fid,
          titular: t,
          familiar,
          degree: degree as KinshipDegree,
          label,
          labelDisplay: display,
          confidence: Math.round(confidence * 100),
          reasons: [...new Set(reasons)],
          edgePath: path,
        });
      }
    }

    return out.sort((a, b) => b.confidence - a.confidence);
  }

  private layoutTree(
    rootId: string,
    nodes: Person[],
  ): Map<string, { x: number; y: number }> {
    const pos = new Map<string, { x: number; y: number }>();
    const levels = new Map<number, string[]>();
    const dist = new Map<string, number>([[rootId, 0]]);
    const q = [rootId];
    const idSet = new Set(nodes.map((n) => n.id));

    while (q.length) {
      const cur = q.shift()!;
      const d = dist.get(cur) ?? 0;
      const list = levels.get(d) ?? [];
      list.push(cur);
      levels.set(d, list);
      for (const [next] of this.adj.get(cur) ?? []) {
        if (!idSet.has(next) || dist.has(next)) continue;
        dist.set(next, d + 1);
        q.push(next);
      }
    }

    for (const n of nodes) {
      if (!dist.has(n.id)) {
        const orphan = levels.get(99) ?? [];
        orphan.push(n.id);
        levels.set(99, orphan);
        dist.set(n.id, 99);
      }
    }

    const width = 720;
    const levelH = 110;
    for (const [level, ids] of levels) {
      const y = 40 + level * levelH;
      ids.forEach((id, i) => {
        const x =
          ids.length === 1
            ? width / 2
            : ((i + 1) / (ids.length + 1)) * width;
        pos.set(id, { x, y });
      });
    }
    return pos;
  }
}
