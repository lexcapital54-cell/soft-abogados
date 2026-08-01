/**
 * Configuración operativa de consultores / asesores.
 * Actualizar aquí nombres, cupos y correos ante rotación de personal.
 */

export type ConsultantStatus = 'ACTIVE' | 'INACTIVE';

export type ConsultantProfile = {
  id: string;
  fullName: string;
  role: string;
  initials: string;
  status: ConsultantStatus;
  email?: string;
  vacant?: boolean;
};

export const CONSULTANTS: ConsultantProfile[] = [
  {
    id: 'c-luisa',
    fullName: 'Luisa Fernanda Morales Londoño',
    role: 'Asesor Jurídico',
    initials: 'LM',
    status: 'ACTIVE',
    email: 'luisafmorales@lexcapital.com.co',
  },
  {
    id: 'c-victor',
    fullName: 'Victor Julio Pedroso Arias',
    role: 'Asesor Jurídico',
    initials: 'VP',
    status: 'ACTIVE',
    email: 'victorjpedroso@lexcapital.com.co',
  },
  {
    id: 'c-johana',
    fullName: 'Johana Gómez Largo',
    role: 'Asesor Jurídico',
    initials: 'JG',
    status: 'ACTIVE',
    email: 'johanagomez@lexcapital.com.co',
  },
  {
    id: 'c-michelle',
    fullName: 'Michelle Aguilar Henao',
    role: 'Asesor Jurídico',
    initials: 'MA',
    status: 'ACTIVE',
    email: 'michelleaguilar@lexcapital.com.co',
  },
  {
    id: 'c-asesor5',
    fullName: 'Asesor 5',
    role: 'Asesor Jurídico',
    initials: 'A5',
    status: 'ACTIVE',
    email: 'asesor@lexcapital.com',
  },
];
