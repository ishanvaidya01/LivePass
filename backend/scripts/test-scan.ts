import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  const event = await prisma.event.findFirst();
  if (!event) return console.log('No event found');

  const tokenRec = await prisma.checkInToken.findFirst();
  if (!tokenRec) return console.log('No token found in DB');

  console.log('Found token in DB:', tokenRec.token);

  const res = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@checkedin.local', password: 'password123' })
  });
  
  const authData = await res.json();
  const jwt = authData.token;

  console.log('Scanning token:', tokenRec.token);

  const scanRes = await fetch(`http://localhost:4000/api/events/${event.id}/scan`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`
    },
    body: JSON.stringify({ token: tokenRec.token, stationId: 'Test-1' })
  });

  const responseText = await scanRes.text();
  console.log('Scan Response:', scanRes.status, responseText);
}

test().catch(console.error).finally(() => prisma.$disconnect());
