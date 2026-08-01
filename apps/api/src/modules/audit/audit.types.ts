/** Códigos de acción del Audit Trail forense Lex Capital */
export const AuditAction = {
  CASO_CREADO: 'CASO_CREADO',
  CASO_ACTUALIZADO: 'CASO_ACTUALIZADO',
  CAMBIO_HONORARIOS: 'CAMBIO_HONORARIOS',
  CAMBIO_ETAPA: 'CAMBIO_ETAPA',
  CASO_REASIGNADO: 'CASO_REASIGNADO',
  CASO_ELIMINADO: 'CASO_ELIMINADO',
  DOCUMENTO_CARGADO: 'DOCUMENTO_CARGADO',
  CAMBIO_ESTADO_DOCUMENTO: 'CAMBIO_ESTADO_DOCUMENTO',
  DOCUMENTO_ELIMINADO: 'DOCUMENTO_ELIMINADO',
  HEREDERO_CREADO: 'HEREDERO_CREADO',
  HEREDERO_ACTUALIZADO: 'HEREDERO_ACTUALIZADO',
  HEREDERO_CONTACTADO: 'HEREDERO_CONTACTADO',
  SLA_REAGENDADO: 'SLA_REAGENDADO',
  NOTA_ESTRATEGICA: 'NOTA_ESTRATEGICA',
  ACTIVIDAD_REGISTRADA: 'ACTIVIDAD_REGISTRADA',
  TAREA_CREADA: 'TAREA_CREADA',
  TAREA_ACTUALIZADA: 'TAREA_ACTUALIZADA',
  TAREA_COMPLETADA: 'TAREA_COMPLETADA',
  TAREA_REASIGNADA: 'TAREA_REASIGNADA',
  TAREA_REPROGRAMADA: 'TAREA_REPROGRAMADA',
  CORREO_ENVIADO: 'CORREO_ENVIADO',
  REPO_DOCUMENTO_SUBIDO: 'REPO_DOCUMENTO_SUBIDO',
  TRASLADO_AREA_JURIDICA: 'TRASLADO_AREA_JURIDICA',
} as const;

export type AuditActionCode =
  (typeof AuditAction)[keyof typeof AuditAction];

export const AuditEntity = {
  CASO: 'Caso',
  DOCUMENTO: 'Documento',
  HEREDERO: 'Heredero',
  TAREA: 'Tarea',
  ACTIVIDAD: 'Actividad',
} as const;

export type AuditEntityName =
  (typeof AuditEntity)[keyof typeof AuditEntity];

export type RegistrarAuditoriaInput = {
  usuarioId?: string | null;
  accion: AuditActionCode | string;
  entidadAfectada: AuditEntityName | string;
  entidadId?: string | null;
  caseId?: string | null;
  prevData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
};
