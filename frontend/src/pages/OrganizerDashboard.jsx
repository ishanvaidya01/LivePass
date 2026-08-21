import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall } from '../services/api';
import ScannerPanel from './ScannerPanel';
import { useScanQueue } from '../hooks/useScanQueue';
import { io } from 'socket.io-client';
import { WifiOff, AlertTriangle } from 'lucide-react';

export default function OrganizerDashboard() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', date: '', venue: '', capacity: '100' });
  const [error, setError] = useState('');
  const [insights, setInsights] = useState({});
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const token = localStorage.getItem('token');
  
  // Use currentEventId = null to fetch the GLOBAL offline queue across all events
  const { queue, conflicts, clearAllConflicts } = useScanQueue(token, null);
  const pendingScans = queue.filter(s => s.status === 'PENDING' || s.status === 'SYNC_FAILED');

  useEffect(() => {
    if (!token || user?.role !== 'ORGANIZER') {
      navigate('/');
    }
  }, [navigate, user, token]);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await apiCall('/events');
      setEvents(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { 
    fetchEvents(); 
    
    // Listen for live updates across all events
    const socket = io('http://localhost:5000');
    
    socket.on('connect', () => {
      events.forEach(e => socket.emit('join_event', { eventId: e.id }));
    });
    
    socket.on('checkin_success', () => {
      fetchEvents();
    });
    
    return () => socket.disconnect();
  }, [fetchEvents, events.length]);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiCall('/events', {
        method: 'POST',
        body: JSON.stringify(newEvent)
      });
      setShowCreate(false);
      setNewEvent({ name: '', date: '', venue: '', capacity: '100' });
      fetchEvents();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteEvent = async (e, eventId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this event? This will also delete all registrations and check-ins.')) return;
    try {
      await apiCall(`/events/${eventId}`, { method: 'DELETE' });
      fetchEvents();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const getInsights = async (e, eventId) => {
    e.stopPropagation();
    try {
      const data = await apiCall(`/events/${eventId}/insights`);
      setInsights({ ...insights, [eventId]: data.insight });
    } catch (err) {
      setInsights({ ...insights, [eventId]: err.message });
    }
  };

  if (selectedEventId) {
    return (
      <ScannerPanel 
        eventId={selectedEventId} 
        onBack={() => { setSelectedEventId(null); fetchEvents(); }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white font-bold">O</div>
          <h1 className="text-xl font-bold tracking-tight">Organizer Hub</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-600">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600 transition">Logout</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 lg:p-6 space-y-6">
        
        {/* Global Sync Status Banner */}
        {(pendingScans.length > 0 || conflicts.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-down">
            {pendingScans.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 shrink-0">
                  <WifiOff className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-yellow-900">Global Offline Queue</h3>
                  <p className="text-sm text-yellow-800">{pendingScans.length} ticket(s) scanned offline waiting to sync.</p>
                </div>
              </div>
            )}
            {conflicts.length > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-900">Global Sync Conflicts</h3>
                    <p className="text-sm text-red-800">{conflicts.length} ticket(s) rejected.</p>
                  </div>
                </div>
                <button onClick={clearAllConflicts} className="bg-red-100 text-red-700 hover:bg-red-200 px-4 py-2 rounded-xl text-xs font-bold transition">
                  Dismiss All
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* KPI Section */}
        <section className="grid grid-cols-1 md:grid-cols-1 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between items-center text-center">
            <h3 className="text-sm font-bold tracking-widest uppercase text-gray-400">Total Events Managed</h3>
            <p className="text-5xl font-black text-gray-900 mt-2">{events.length}</p>
          </div>
        </section>

        {/* Header & Create */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Manage Events</h2>
          <button onClick={() => setShowCreate(!showCreate)} className="bg-brand-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-brand-700 shadow-sm transition">
            {showCreate ? 'Cancel' : '+ New Event'}
          </button>
        </div>

        {showCreate && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-100">
            <h3 className="text-lg font-bold mb-4">Create New Event</h3>
            <form onSubmit={handleCreateEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                <input type="text" required value={newEvent.name} onChange={e => setNewEvent({...newEvent, name: e.target.value})}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                <input type="datetime-local" required value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input type="number" required min="1" value={newEvent.capacity} onChange={e => setNewEvent({...newEvent, capacity: e.target.value})}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
                <input type="text" value={newEvent.venue} onChange={e => setNewEvent({...newEvent, venue: e.target.value})}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="bg-brand-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-700 transition">Save Event</button>
              </div>
            </form>
          </div>
        )}

        {events.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-200 rounded-2xl shadow-sm">
            <p className="text-gray-500 text-lg">No events configured yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {events.map(event => (
              <div key={event.id} className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 hover:border-brand-200 transition group cursor-pointer" onClick={() => setSelectedEventId(event.id)}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="w-full md:w-auto">
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-brand-600 transition">{event.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(event.date).toLocaleString()} • {event.venue || 'No venue'}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        {event.status}
                      </span>
                      <button onClick={(e) => getInsights(e, event.id)} className="text-xs font-bold text-brand-600 hover:underline py-2 px-1">
                        Generate AI Insights
                      </button>
                    </div>
                    {insights[event.id] && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-900 shadow-inner">
                        <span className="font-bold block mb-1">✨ AI Insight: </span> {insights[event.id]}
                      </div>
                    )}
                    {/* Metrics */}
                    <div className="flex gap-6 mt-6 pt-6 border-t border-gray-100">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Registered</p>
                        <p className="text-xl font-black text-gray-900">{event.registeredCount}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Verified</p>
                        <p className="text-xl font-black text-brand-600">{event.checkedInCount}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Capacity</p>
                        <p className="text-xl font-black text-gray-900">{event.capacity}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto border-t md:border-t-0 border-gray-100 pt-4 md:pt-0">
                    <div className="flex gap-2">
                      <a href={`http://localhost:5000/api/events/${event.id}/export?token=${localStorage.getItem('token')}`} onClick={e => e.stopPropagation()} target="_blank" rel="noreferrer" className="text-xs text-gray-700 hover:text-gray-900 font-bold px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition shadow-sm">
                        Export CSV
                      </a>
                      <button onClick={(e) => handleDeleteEvent(e, event.id)} className="text-xs text-red-600 hover:text-white hover:bg-red-600 font-bold px-4 py-2.5 border border-red-200 rounded-xl transition shadow-sm">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
