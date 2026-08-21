import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function main() {
  console.log("--- Role Enforcement Proof Script ---");

  // 1. Get an Attendee user
  const alice = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
  if (!alice) {
    console.error("User alice@example.com not found. Run seed script first.");
    process.exit(1);
  }

  // Generate an Attendee token for Alice
  const secret = process.env.JWT_SECRET || 'supersecretjwtkey_dev_only';
  const token = jwt.sign(
    { userId: alice.id, role: alice.role },
    secret,
    { expiresIn: '1h' }
  );

  console.log(`Authenticated as: ${alice.email} (Role: ${alice.role})`);

  // We need a dummy event ID and registration ID to hit the routes
  const event = await prisma.event.findFirst();
  if (!event) {
    console.error("No events found. Run seed script first.");
    process.exit(1);
  }

  const reg = await prisma.registration.findFirst({ where: { eventId: event.id } });
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const API_URL = 'http://localhost:4000/api';

  const tests = [
    { name: 'Create Event', method: 'POST', url: `${API_URL}/events`, body: JSON.stringify({ name: "Hack", capacity: 10, date: new Date() }) },
    { name: 'Scan Ticket', method: 'POST', url: `${API_URL}/events/${event.id}/scan`, body: JSON.stringify({ token: "test" }) },
    { name: 'Manual Override', method: 'POST', url: `${API_URL}/registrations/${reg?.id || 'fake-id'}/manual-checkin`, body: JSON.stringify({ reason: "test" }) },
    { name: 'Export CSV', method: 'GET', url: `${API_URL}/events/${event.id}/export`, body: undefined },
    { name: 'AI Insights', method: 'GET', url: `${API_URL}/events/${event.id}/insights`, body: undefined }
  ];

  let passed = 0;

  for (const test of tests) {
    console.log(`\nTesting [${test.method}] ${test.url}`);
    const res = await fetch(test.url, {
      method: test.method,
      headers,
      body: test.body
    });

    const bodyText = await res.text();
    console.log(`  -> Status: ${res.status}`);
    
    if (res.status === 403) {
      console.log(`  -> SUCCESS: Correctly blocked by requireRole middleware.`);
      passed++;
    } else {
      console.error(`  -> FAIL: Expected 403, got ${res.status}. Body: ${bodyText}`);
    }
  }

  console.log(`\nResults: ${passed}/${tests.length} tests passed (403 Forbidden properly asserted).`);
  process.exit(passed === tests.length ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
