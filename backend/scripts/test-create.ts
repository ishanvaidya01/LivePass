import { PrismaClient } from '@prisma/client';

async function test() {
  const reqBody = {
    name: 'MIC Hackathon 2026',
    date: '21-08-2026 02:31',
    venue: 'AB-1 Portico',
    capacity: '100'
  };

  const res = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@checkedin.local', password: 'password123' })
  });
  
  const authData = await res.json();
  const token = authData.token;

  console.log('Got token:', token ? 'yes' : 'no');

  const createRes = await fetch('http://localhost:4000/api/events', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(reqBody)
  });

  const responseText = await createRes.text();
  console.log('Create Response:', createRes.status, responseText);
}

test().catch(console.error);
