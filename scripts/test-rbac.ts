import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

async function run() {
  console.log('Testing RBAC Middleware...');

  try {
    // 1. Create an Attendee
    console.log('\n[1] Registering Attendee...');
    const attendeeRes = await axios.post(`${API_URL}/auth/signup`, {
      email: `attendee_${Date.now()}@test.com`,
      password: 'password123',
      name: 'Test Attendee',
      role: 'ATTENDEE'
    });
    const attendeeToken = attendeeRes.data.token;
    console.log('✅ Attendee registered. Token received.');

    // 2. Attendee attempts to access an Organizer-only route (Create Event)
    console.log('\n[2] Attendee attempting to access Organizer route (POST /events)...');
    try {
      await axios.post(`${API_URL}/events`, {}, {
        headers: { Authorization: `Bearer ${attendeeToken}` }
      });
      console.error('❌ Fail: Attendee was able to access an organizer route!');
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.log(`✅ Success: Attendee blocked with 403 Forbidden. Response:`, err.response.data);
      } else {
        console.error('❌ Fail: Expected 403, got', err.response?.status);
      }
    }

    // 3. Create an Organizer
    console.log('\n[3] Registering Organizer...');
    const orgRes = await axios.post(`${API_URL}/auth/signup`, {
      email: `org_${Date.now()}@test.com`,
      password: 'password123',
      name: 'Test Organizer',
      role: 'ORGANIZER'
    });
    const orgToken = orgRes.data.token;
    console.log('✅ Organizer registered. Token received.');

    // 4. Organizer attempts to access an Organizer-only route (Create Event)
    console.log('\n[4] Organizer attempting to access Organizer route (POST /events)...');
    const createEventRes = await axios.post(`${API_URL}/events`, {}, {
      headers: { Authorization: `Bearer ${orgToken}` }
    });
    console.log(`✅ Success: Organizer accessed the route. Response:`, createEventRes.data);

  } catch (error: any) {
    console.error('Test script failed completely:', error.response?.data || error.message);
  }
}

run();
