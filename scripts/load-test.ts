import axios from 'axios';

const API_URL1 = 'http://localhost:4000/api';
const API_URL2 = 'http://localhost:4001/api';

async function runLoadTest() {
  console.log('--- Starting Registration Concurrency Load Test ---');
  
  try {
    // 1. Create an Organizer to set up the event
    const orgRes = await axios.post(`${API_URL1}/auth/signup`, {
      email: `org_loadtest_${Date.now()}@test.com`,
      password: 'password',
      name: 'Load Test Org',
      role: 'ORGANIZER'
    });
    const orgToken = orgRes.data.token;

    // 2. Create an event with capacity 50
    const CAPACITY = 50;
    const eventRes = await axios.post(`${API_URL1}/events`, {
      name: `Load Test Event ${Date.now()}`,
      date: new Date(Date.now() + 86400000).toISOString(),
      capacity: CAPACITY
    }, {
      headers: { Authorization: `Bearer ${orgToken}` }
    });
    const eventId = eventRes.data.id;
    console.log(`✅ Created Event ${eventId} with Capacity ${CAPACITY}`);

    // 3. Create 500 Attendees sequentially (so signup doesn't trip rate limits/DB locks as hard, but we'll fire registration concurrently)
    const NUM_REQUESTS = 500;
    console.log(`\nGenerating ${NUM_REQUESTS} attendees...`);
    
    // Batch attendee creation to prevent ECONNRESET during setup
    const attendees = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < NUM_REQUESTS; i += BATCH_SIZE) {
      const batchPromises = [];
      for (let j = 0; j < BATCH_SIZE && i + j < NUM_REQUESTS; j++) {
        const email = `attendee_${Date.now()}_${i + j}@test.com`;
        batchPromises.push(
          axios.post(`${API_URL1}/auth/signup`, {
            email, password: 'password', name: `Test ${i + j}`, role: 'ATTENDEE'
          }).then(res => res.data.token)
        );
      }
      const batchTokens = await Promise.all(batchPromises);
      attendees.push(...batchTokens);
    }
    console.log(`✅ ${NUM_REQUESTS} attendees created.`);

    // 4. FIRE CONCURRENT REGISTRATIONS
    console.log(`\nFiring ${NUM_REQUESTS} concurrent registration requests to Event ${eventId}...`);
    const start = Date.now();
    
    const registrationPromises = attendees.map((token, index) => {
      const isPort4000 = index % 2 === 0;
      const url = isPort4000 ? API_URL1 : API_URL2;
      return axios.post(`${url}/events/${eventId}/register`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => ({ ...res.data, port: isPort4000 ? 4000 : 4001 }))
        .catch(err => ({ ...(err.response?.data || { error: err.message }), port: isPort4000 ? 4000 : 4001 }));
    });

    const results = await Promise.all(registrationPromises);
    const duration = Date.now() - start;

    console.log(`✅ All requests finished in ${duration}ms.`);

    // 5. Analyze results
    let portStats = {
      4000: { sent: 0, registered: 0, waitlisted: 0, errors: 0 },
      4001: { sent: 0, registered: 0, waitlisted: 0, errors: 0 }
    };
    
    let registeredCount = 0;
    let waitlistedCount = 0;
    let errorCount = 0;

    for (const result of results) {
      const p = result.port as 4000 | 4001;
      portStats[p].sent++;
      
      if (result.status === 'REGISTERED') {
        registeredCount++;
        portStats[p].registered++;
      }
      else if (result.status === 'WAITLISTED') {
        waitlistedCount++;
        portStats[p].waitlisted++;
      }
      else {
        errorCount++;
        portStats[p].errors++;
      }
    }

    console.log(`\n--- Results ---`);
    console.log(`Port 4000: ${portStats[4000].sent} sent -> ${portStats[4000].registered} succeeded, ${portStats[4000].waitlisted} waitlisted`);
    console.log(`Port 4001: ${portStats[4001].sent} sent -> ${portStats[4001].registered} succeeded, ${portStats[4001].waitlisted} waitlisted`);
    console.log(`Combined: ${registeredCount} succeeded, ${waitlistedCount} waitlisted, ${errorCount} errors`);

    if (registeredCount > CAPACITY) {
      console.error(`❌ CONCURRENCY FAILURE: Registered count exceeded capacity!`);
    } else if (registeredCount === CAPACITY) {
      console.log(`✅ CONCURRENCY SUCCESS: Exactly ${CAPACITY} users registered.`);
    }

    // --- PHASE 3: SCANNING CONCURRENCY TEST ---
    console.log('\n--- Starting Scanning Concurrency Test ---');

    // Find the token of the first attendee who successfully registered
    const firstRegisteredIndex = results.findIndex(r => r.status === 'REGISTERED');
    const registeredAttendeeToken = attendees[firstRegisteredIndex];
    const registeredRegistrationId = results[firstRegisteredIndex].id;

    // 1. Fetch QR token
    const tokenRes = await axios.get(`${API_URL1}/registrations/${registeredRegistrationId}/token`, {
      headers: { Authorization: `Bearer ${registeredAttendeeToken}` }
    });
    const qrToken = tokenRes.data.token;
    console.log(`✅ QR Token generated: ${qrToken}`);

    // 2. Fire 100 concurrent scan requests
    const NUM_SCAN_REQUESTS = 100;
    console.log(`\nFiring ${NUM_SCAN_REQUESTS} concurrent scan requests across both processes...`);
    const scanStart = Date.now();

    const scanPromises = [];
    for (let i = 0; i < NUM_SCAN_REQUESTS; i++) {
      const url = i % 2 === 0 ? API_URL1 : API_URL2;
      scanPromises.push(
        axios.post(`${url}/events/${eventId}/scan`, {
          token: qrToken,
          stationId: `station-${i}`
        }, {
          headers: { Authorization: `Bearer ${orgToken}` }
        }).then(res => res.data)
          .catch(err => err.response?.data || { error: err.message, status: err.response?.status })
      );
    }

    const scanResults = await Promise.all(scanPromises);
    const scanDuration = Date.now() - scanStart;
    console.log(`✅ All scan requests finished in ${scanDuration}ms.`);

    let successScans = 0;
    let conflictScans = 0;
    let otherScanErrors = 0;

    for (const res of scanResults) {
      if (res.status === 'SUCCESS') successScans++;
      else if (res.error && res.error.includes('Already checked in at')) conflictScans++;
      else {
        console.error('Unexpected scan result:', res);
        otherScanErrors++;
      }
    }

    console.log(`\n--- Scan Results ---`);
    console.log(`Total Scans Sent: ${NUM_SCAN_REQUESTS}`);
    console.log(`Successful Scans: ${successScans} (Expected: 1)`);
    console.log(`Conflict Scans (409): ${conflictScans} (Expected: ${NUM_SCAN_REQUESTS - 1})`);
    console.log(`Other Errors: ${otherScanErrors} (Expected: 0)`);

    if (successScans === 1 && conflictScans === NUM_SCAN_REQUESTS - 1) {
      console.log(`✅ SCANNING CONCURRENCY SUCCESS: Database unique constraint perfectly handled concurrent scans.`);
    } else {
      console.error(`❌ SCANNING CONCURRENCY FAILURE: Found ${successScans} successful scans.`);
    }

  } catch (err: any) {
    console.error('Load test failed to execute:', err.response?.data || err.message);
  }
}

runLoadTest();
