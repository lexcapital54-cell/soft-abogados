/** Persona normalizada para el motor de cruce */
export type Person = {
  id: string;
  source: 'TITULAR' | 'CANDIDATO';
  cedula: string | null;
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  fullName: string;
  ciudadNacimiento: string | null;
  ciudadExpedicion: string | null;
  anioNacimiento: number | null;
  nombresPadres: string | null;
  raw?: Record<string, unknown>;
};

export type KinshipDegree = 1 | 2 | 3 | 4;

export type InferredKinshipLabel =
  | 'PADRE'
  | 'MADRE'
  | 'HIJO'
  | 'HIJA'
  | 'HERMANO'
  | 'HERMANA'
  | 'ABUELO'
  | 'ABUELA'
  | 'NIETO'
  | 'NIETA'
  | 'TIO'
  | 'TIA'
  | 'SOBRINO'
  | 'SOBRINA'
  | 'OTRO';

export type KinshipRelation = {
  id: string;
  titularId: string;
  familiarId: string;
  titular: Person;
  familiar: Person;
  degree: KinshipDegree;
  label: InferredKinshipLabel;
  labelDisplay: string;
  confidence: number;
  reasons: string[];
  edgePath?: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: 'PARENT_CHILD' | 'SIBLING' | 'INFERRED';
  weight: number;
  reasons: string[];
};

export type KinshipGraphPayload = {
  nodes: Array<{
    id: string;
    label: string;
    cedula: string | null;
    anioNacimiento: number | null;
    source: Person['source'];
    x: number;
    y: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    degree: number;
    label: string;
  }>;
};

export type KinshipAnalyzeResult = {
  titulares: Person[];
  candidatos: Person[];
  relations: KinshipRelation[];
  stats: {
    titulares: number;
    candidatos: number;
    matches: number;
    avgConfidence: number;
    usedAi: boolean;
  };
};
