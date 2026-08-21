import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall } from '../services/api';

export default function AttendeeDashboard() {
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    if (!localStorage.getItem('token') || user?.role !== 'ATTENDEE') {
      navigate('/');
    }
  }, [navigate, user]);

  const fetchData = useCallback(async () => {
    try {
      const [regs, events] = await Promise.all([
        apiCall('/registrations/me'),
        apiCall('/events')
      ]);
      setMyRegistrations(regs);
      setAllEvents(events);
      setError('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect to server');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRegister = async (eventId) => {
    setError('');
    try {
      await apiCall(`/events/${eventId}/register`, { method: 'POST' });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const registeredEventIds = myRegistrations.map(r => r.eventId);
  const availableEvents = allEvents.filter(e => !registeredEventIds.includes(e.id));

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white font-bold">A</div>
          <h1 className="text-xl font-bold tracking-tight">Attendee Hub</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-600">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-6 space-y-10">
        {error && !error.includes('Failed to fetch') && !error.includes('NetworkError') && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium mb-6">
            {error}
          </div>
        )}

        <section>
          <h2 className="text-2xl font-bold mb-6">My Tickets</h2>
          {(error && (error.includes('Failed to fetch') || error.includes('NetworkError'))) ? (
            <div className="bg-red-50 p-10 rounded-2xl border border-red-100 text-center animate-fade-in">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-red-900 mb-2">Ticket Unavailable Offline</h3>
              <p className="text-sm font-medium text-red-700">Sorry for the inconvenience. Please proceed to <strong>Table 3</strong> for manual verification.</p>
            </div>
          ) : myRegistrations.length === 0 ? (
            <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-200 text-center">
              <div className="text-4xl mb-4">🎟️</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">No Tickets Yet</h3>
              <p className="text-sm text-gray-500">Register for an event below to get your ticket.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {myRegistrations.map(reg => (
                <div key={reg.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col group hover:shadow-md transition">
                  <div className="h-3 bg-brand-500 w-full"></div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          reg.isCheckedIn ? 'bg-green-100 text-green-800' :
                          reg.status === 'REGISTERED' ? 'bg-blue-100 text-blue-800' : 
                          reg.status === 'WAITLISTED' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {reg.isCheckedIn ? 'CHECKED IN' : reg.status}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-brand-600 transition">{reg.event.name}</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-2 mb-1">
                        📅 {new Date(reg.event.date).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        📍 {reg.event.venue || 'TBA'}
                      </p>
                    </div>
                    {reg.status === 'REGISTERED' && (
                      <div className="mt-6">
                        <button onClick={() => navigate(`/ticket/${reg.id}`)} className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition">
                          {reg.isCheckedIn ? "View Status" : "View QR Ticket"}
                        </button>
                        <p className="text-center text-xs text-gray-500 mt-2 font-medium">
                          {reg.isCheckedIn ? "You are checked in!" : "Ticket ready for scanning"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-6">Upcoming Events</h2>
          {availableEvents.length === 0 ? (
            <p className="text-gray-500">No more events available right now.</p>
          ) : (
            <div className="space-y-4">
              {availableEvents.map(event => (
                <div key={event.id} className="bg-white p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-gray-300 transition">
                  <div className="w-full sm:w-auto">
                    <h3 className="text-lg font-bold text-gray-900">{event.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(event.date).toLocaleDateString()} • {event.venue || 'No venue'}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                        {event.registeredCount} Registered
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                        {Math.max(0, event.capacity - event.registeredCount)} Seats Left
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRegister(event.id)} 
                    className="w-full sm:w-auto bg-brand-50 text-brand-700 hover:bg-brand-100 px-6 py-3 rounded-xl font-bold text-sm transition shadow-sm"
                  >
                    Register
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
