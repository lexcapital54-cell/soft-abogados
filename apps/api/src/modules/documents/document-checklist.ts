import { DocumentCategory } from '@prisma/client';

export type ChecklistScope = 'TITULAR' | 'LEGAL' | 'FAMILIAR';

export type ChecklistTemplate = {
  code: string;
  name: string;
  category: DocumentCategory;
  scope: ChecklistScope;
  isRequired: boolean;
  sortOrder: number;
};

/** Checklist operativo Lex Capital — precarga por caso */
export const DOCUMENT_CHECKLIST: ChecklistTemplate[] = [
  // A. Titular / Causante
  {
    code: 'TIT_CEDULA',
    name: 'Cédula de ciudadanía',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: true,
    sortOrder: 10,
  },
  {
    code: 'TIT_VIGENCIA_CEDULA',
    name: 'Certificado de vigencia de cédula',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: true,
    sortOrder: 20,
  },
  {
    code: 'TIT_RC_NACIMIENTO',
    name: 'Registro civil de nacimiento',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: true,
    sortOrder: 30,
  },
  {
    code: 'TIT_RC_DEFUNCION',
    name: 'Registro civil de defunción',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: true,
    sortOrder: 40,
  },
  {
    code: 'TIT_RC_MATRIMONIO',
    name: 'Registro civil de matrimonio (si aplica)',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: false,
    sortOrder: 50,
  },
  {
    code: 'TIT_CERT_MATRIMONIO',
    name: 'Certificado de Matrimonio - Registraduría',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: false,
    sortOrder: 60,
  },
  {
    code: 'TIT_DECL_CONVIVENCIA',
    name: 'Declaración extrajuicio / Declaración juramentada de convivencia',
    category: DocumentCategory.FALLECIDO,
    scope: 'TITULAR',
    isRequired: false,
    sortOrder: 70,
  },
  {
    code: 'TIT_HISTORIA_LABORAL',
    name: 'Historia laboral',
    category: DocumentCategory.FINANCIERO,
    scope: 'TITULAR',
    isRequired: false,
    sortOrder: 80,
  },
  {
    code: 'TIT_REPORTE_UBICA',
    name: 'Reporte UBICA (Datos de contacto / Skiptracing)',
    category: DocumentCategory.OTRO,
    scope: 'TITULAR',
    isRequired: false,
    sortOrder: 90,
  },
  {
    code: 'TIT_CONTRATO_CLIENTE',
    name: 'Contrato cliente',
    category: DocumentCategory.CONTRATO,
    scope: 'TITULAR',
    isRequired: true,
    sortOrder: 100,
  },

  // B. Legal
  {
    code: 'LEG_PODER',
    name: 'Poder Autenticado',
    category: DocumentCategory.PODER,
    scope: 'LEGAL',
    isRequired: true,
    sortOrder: 110,
  },
  {
    code: 'LEG_CONTRATO_SERVICIOS',
    name: 'Contrato de Prestación de Servicios Firmado',
    category: DocumentCategory.CONTRATO,
    scope: 'LEGAL',
    isRequired: true,
    sortOrder: 120,
  },

  // C. Familiares (se instancia por cada heredero)
  {
    code: 'FAM_CEDULA_150',
    name: 'Fotocopia de Cédula al 150%',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: true,
    sortOrder: 200,
  },
  {
    code: 'FAM_RC_NACIMIENTO',
    name: 'Registro Civil de Nacimiento (copia auténtica)',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: true,
    sortOrder: 210,
  },
  {
    code: 'FAM_RC_DEFUNCION_PADRES',
    name: 'Registro Civil de Defunción de los padres (si aplica)',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: false,
    sortOrder: 220,
  },
  {
    code: 'FAM_CERT_BANCARIO',
    name: 'Certificado de cuenta bancaria',
    category: DocumentCategory.FINANCIERO,
    scope: 'FAMILIAR',
    isRequired: true,
    sortOrder: 230,
  },
  {
    code: 'FAM_FORM_CONYUGE',
    name: 'Formulario de Reclamación - Cónyuge',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: false,
    sortOrder: 240,
  },
  {
    code: 'FAM_FORM_HIJOS',
    name: 'Formulario de Reclamación - Hijos',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: false,
    sortOrder: 250,
  },
  {
    code: 'FAM_FORM_HERMANOS',
    name: 'Formulario de Reclamación - Hermanos',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: false,
    sortOrder: 260,
  },
  {
    code: 'FAM_FORM_HEREDEROS',
    name: 'Formulario de Reclamación - Herederos',
    category: DocumentCategory.FAMILIAR,
    scope: 'FAMILIAR',
    isRequired: true,
    sortOrder: 270,
  },
];
