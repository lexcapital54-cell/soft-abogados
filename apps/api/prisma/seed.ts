import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  buildAdvisorLabelMap,
  importRebalancedCsv,
} from './import-rebalanced-csv';

const prisma = new PrismaClient();

async function seedUsers() {
  const superPassword = await bcrypt.hash('LexCapital2026!', 10);
  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const consultantPin = await bcrypt.hash('2468', 10);

  const laura = await prisma.user.upsert({
    where: { email: 'lauracastrog@lexcapital.com.co' },
    update: {
      role: UserRole.SUPER_ADMIN,
      firstName: 'Laura',
      lastName: 'Castro G.',
      status: 'ACTIVE',
      passwordHash: superPassword,
    },
    create: {
      email: 'lauracastrog@lexcapital.com.co',
      passwordHash: superPassword,
      firstName: 'Laura',
      lastName: 'Castro G.',
      role: UserRole.SUPER_ADMIN,
      phone: '3127420002',
    },
  });

  const danko = await prisma.user.upsert({
    where: { email: 'dankojimenez@lexcapital.com.co' },
    update: {
      role: UserRole.SUPER_ADMIN,
      firstName: 'Danko',
      lastName: 'Jiménez L.',
      status: 'ACTIVE',
      passwordHash: superPassword,
    },
    create: {
      email: 'dankojimenez@lexcapital.com.co',
      passwordHash: superPassword,
      firstName: 'Danko',
      lastName: 'Jiménez L.',
      role: UserRole.SUPER_ADMIN,
      phone: '3177000568',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@lexcapital.com' },
    update: {},
    create: {
      email: 'admin@lexcapital.com',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'LexCapital',
      role: UserRole.ADMIN,
    },
  });

  const advisor = await prisma.user.upsert({
    where: { email: 'asesor@lexcapital.com' },
    update: {
      firstName: 'Asesor',
      lastName: '5',
      role: UserRole.ASESOR,
      status: 'ACTIVE',
      passwordHash: consultantPin,
    },
    create: {
      email: 'asesor@lexcapital.com',
      passwordHash: consultantPin,
      firstName: 'Asesor',
      lastName: '5',
      role: UserRole.ASESOR,
    },
  });

  const consultants = [
    {
      email: 'luisafmorales@lexcapital.com.co',
      firstName: 'Luisa Fernanda',
      lastName: 'Morales Londoño',
      phone: '3000000001',
    },
    {
      email: 'victorjpedroso@lexcapital.com.co',
      firstName: 'Victor Julio',
      lastName: 'Pedroso Arias',
      phone: '3000000002',
    },
    {
      email: 'johanagomez@lexcapital.com.co',
      firstName: 'Johana',
      lastName: 'Gómez Largo',
      phone: '3000000003',
    },
    {
      email: 'michelleaguilar@lexcapital.com.co',
      firstName: 'Michelle',
      lastName: 'Aguilar Henao',
      phone: '3000000004',
    },
  ] as const;

  const consultantIds: string[] = [];
  for (const c of consultants) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        firstName: c.firstName,
        lastName: c.lastName,
        role: UserRole.ASESOR,
        status: 'ACTIVE',
        passwordHash: consultantPin,
        phone: c.phone,
      },
      create: {
        email: c.email,
        passwordHash: consultantPin,
        firstName: c.firstName,
        lastName: c.lastName,
        role: UserRole.ASESOR,
        phone: c.phone,
      },
    });
    consultantIds.push(u.id);
  }

  return {
    laura,
    danko,
    admin,
    advisor,
    consultantIds,
  };
}

async function main() {
  console.log('1) Usuarios base…');
  const users = await seedUsers();

  const advisorMap = buildAdvisorLabelMap({
    asesor1: users.consultantIds[0],
    asesor2: users.consultantIds[1],
    asesor3: users.consultantIds[2],
    asesor4: users.consultantIds[3],
    asesor5: users.advisor.id,
  });

  console.log('2) Import CSV rebalanceada (agrupación 1 caso : N herederos)…');
  const result = await importRebalancedCsv(prisma, advisorMap);

  console.log('Seed OK');
  console.log(`  Casos cargados: ${result.ok}`);
  console.log(`  Casos con error: ${result.failed}`);
  console.log(`  Herederos: ${result.heirs}`);
  console.log('  Usuarios operativos sembrados (credenciales solo en entorno local).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
