/**
 * Actualiza PINs únicos por consultor (idempotente).
 * Uso: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/reset-consultant-pins.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PINS: { email: string; pin: string; firstName: string; lastName: string }[] =
  [
    {
      email: 'luisafmorales@lexcapital.com.co',
      pin: '1111',
      firstName: 'Luisa Fernanda',
      lastName: 'Morales Londoño',
    },
    {
      email: 'victorjpedroso@lexcapital.com.co',
      pin: '2222',
      firstName: 'Victor Julio',
      lastName: 'Pedroso Arias',
    },
    {
      email: 'johanagomez@lexcapital.com.co',
      pin: '3333',
      firstName: 'Johana',
      lastName: 'Gómez Largo',
    },
    {
      email: 'michelleaguilar@lexcapital.com.co',
      pin: '4444',
      firstName: 'Michelle',
      lastName: 'Aguilar Henao',
    },
    {
      email: 'asesor@lexcapital.com',
      pin: '2468',
      firstName: 'Asesor',
      lastName: '5',
    },
  ];

async function main() {
  for (const c of PINS) {
    const passwordHash = await bcrypt.hash(c.pin, 10);
    const updated = await prisma.user.updateMany({
      where: { email: c.email },
      data: {
        passwordHash,
        firstName: c.firstName,
        lastName: c.lastName,
        status: 'ACTIVE',
      },
    });
    console.log(
      `${c.email} → PIN ${c.pin} (${updated.count ? 'actualizado' : 'NO ENCONTRADO'})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
