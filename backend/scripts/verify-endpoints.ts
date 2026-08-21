import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function test() {
  const org = await prisma.user.findFirst({ where: { role: 'ORGANIZER' } });
  if (!org) throw new Error('No organizer found');
  const token = jwt.sign({ userId: org.id, role: org.role }, process.env.JWT_SECRET || 'supersecretjwtkey_dev_only');
  
  const eventsRes = await fetch('http://localhost:4000/api/events');
  const events = await eventsRes.json();
  const eventId = events[0].id;
  
  console.log('=== Testing CSV Export ===');
  const res = await fetch(`http://localhost:4000/api/events/${eventId}/export`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  const text = await res.text();
  console.log(text.substring(0, 500));

  console.log('\n=== Testing AI Insights ===');
  const res2 = await fetch(`http://localhost:4000/api/events/${eventId}/insights`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Status:', res2.status);
  const data = await res2.json();
  console.log('Insight:', data.insight);
  console.log('Stats:', JSON.stringify(data.stats));

  await prisma.$disconnect();
}

test().catch(e => { console.error(e); process.exit(1); });
