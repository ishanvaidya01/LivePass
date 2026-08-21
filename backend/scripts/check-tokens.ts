import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const tokens = await prisma.checkInToken.findMany();
  console.log('Tokens in DB:', tokens.map(t => t.token));
}

check().finally(() => prisma.$disconnect());
