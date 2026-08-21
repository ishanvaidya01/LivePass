import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const API_URLS = ['http://localhost:4000/api', 'http://localhost:4001/api'];
const CONCURRENT_REQUESTS = 500;

async function main() {
  console.log("--- Manual-Override Concurrency Load Test ---");
  console.log(`Sending ${CONCURRENT_REQUESTS} parallel override requests across 2 ports...`);

  const organizer = await prisma.user.findFirst({ where: { role: 'ORGANIZER' } });
  if (!organizer) throw new Error("No organizer found");

  const secret = process.env.JWT_SECRET || 'supersecretjwtkey_dev_only';
  const token = jwt.sign({ userId: organizer.id, role: organizer.role }, secret);
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const event = await prisma.event.findFirst();
  if (!event) throw new Error("No event found");

  // Create a brand new registration just for this test so we know it has no check-ins
  // Actually, let's just find Alice's registration and delete any existing checkins.
  const alice = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
  
  let reg = await prisma.registration.findUnique({
    where: { userId_eventId: { userId: alice!.id, eventId: event.id } }
  });

  if (!reg) {
    reg = await prisma.registration.create({
      data: { userId: alice!.id, eventId: event.id, status: 'REGISTERED' }
    });
  } else {
    // Ensure it's registered
    await prisma.registration.update({ where: { id: reg.id }, data: { status: 'REGISTERED' } });
    // Clean up any old checkins for Alice
    await prisma.checkIn.deleteMany({ where: { registrationId: reg.id } });
  }

  const endpointPath = `/registrations/${reg.id}/manual-checkin`;
  
  const promises = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const portUrl = API_URLS[i % API_URLS.length];
    promises.push(
      fetch(`${portUrl}${endpointPath}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: "load test" })
      }).then(async res => ({
        status: res.status,
        body: await res.json()
      }))
    );
  }

  const results = await Promise.all(promises);
  
  const successes = results.filter(r => r.status === 200 || r.status === 201).length;
  const conflicts = results.filter(r => r.status === 409).length;
  const others = results.filter(r => r.status !== 200 && r.status !== 201 && r.status !== 409);

  console.log(`\nResults:`);
  console.log(`  Successes (200/201): ${successes} (Expected: 1)`);
  console.log(`  Conflicts (409): ${conflicts} (Expected: ${CONCURRENT_REQUESTS - 1})`);
  
  if (others.length > 0) {
    console.error(`  Unexpected Failures: ${others.length}`);
    console.log(others.slice(0, 5));
  }

  if (successes === 1 && conflicts === CONCURRENT_REQUESTS - 1) {
    console.log(`\nTEST PASSED: Concurrency strictly enforced with Postgres unique constraints.`);
    process.exit(0);
  } else {
    console.error(`\nTEST FAILED.`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
