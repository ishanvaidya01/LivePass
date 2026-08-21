import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
  await prisma.auditLog.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.checkInToken.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding Organizer...');
  const hashedPass = await bcrypt.hash('password123', 10);
  
  const organizer = await prisma.user.create({
    data: {
      email: 'admin@checkedin.local',
      password: hashedPass,
      name: 'Event Organizer',
      role: 'ORGANIZER'
    }
  });

  console.log('Seeding Attendees...');
  const attendeeA = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      password: hashedPass,
      name: 'Alice Attendee',
      role: 'ATTENDEE'
    }
  });

  const attendeeB = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      password: hashedPass,
      name: 'Bob Attendee',
      role: 'ATTENDEE'
    }
  });

  console.log('Seeding Event...');
  const event = await prisma.event.create({
    data: {
      name: 'Tech Innovators Summit 2026',
      date: new Date(Date.now() + 86400000 * 7), // 7 days from now
      venue: 'Grand Convention Center',
      capacity: 100, // Lots of capacity
      description: 'The premier conference for tech innovation and networking.',
      status: 'PUBLISHED',
      registeredCount: 0
    }
  });

  console.log('Seeding Registrations...');
  await prisma.$transaction(async (tx) => {
    await tx.registration.create({
      data: { userId: attendeeA.id, eventId: event.id, status: 'REGISTERED' }
    });
    await tx.registration.create({
      data: { userId: attendeeB.id, eventId: event.id, status: 'REGISTERED' }
    });
    
    await tx.$executeRaw`
      UPDATE "Event"
      SET "registeredCount" = 2
      WHERE id = ${event.id}
    `;
  });

  console.log('Database seeded successfully!');
  console.log('---');
  console.log('Organizer Login: admin@checkedin.local / password123');
  console.log('Attendee Login: alice@example.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
