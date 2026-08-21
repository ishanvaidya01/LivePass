import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { io } from 'socket.io-client';
import { useScanQueue } from '../hooks/useScanQueue';
import { addScan, removeScan, updateScanStatus } from '../lib/idb';
import { apiCall } from '../services/api';
import { v4 as uuidv4 } from 'uuid';
import { CheckCircle, XCircle, WifiOff, Loader2 } from 'lucide-react';

export default function ScannerPanel({ eventId, onBack }) {
  const [stationId] = useState(localStorage.getItem('stationId') || `STATION-${Math.floor(Math.random()*1000)}`);
  const [liveFeed, setLiveFeed] = useState(() => {
    const saved = localStorage.getItem(`liveFeed-${eventId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [scanFeedback, setScanFeedback] = useState(null); // { status: 'success' | 'error' | 'offline' | 'loading', message: '' }
  const token = localStorage.getItem('token');
  const { queue, conflicts, refreshQueue, processQueue, removeScansByRegistrationId } = useScanQueue(token, eventId);
  const scannerRef = useRef(null);
  const scannerInitialized = useRef(false);

  useEffect(() => {
    localStorage.setItem(`liveFeed-${eventId}`, JSON.stringify(liveFeed));
  }, [liveFeed, eventId]);

  useEffect(() => {
    localStorage.setItem('stationId', stationId);
    
    // Fetch recent checkins initially
    if (navigator.onLine) {
      apiCall(`/events/${eventId}/checkins`)
        .then(data => setLiveFeed(data))
        .catch(err => console.error("Failed to load initial checkins:", err));
    }

    // Connect to Flask Socket.IO
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    
    socket.on('connect', () => {
      socket.emit('join_event', { eventId });
    });
    
    socket.on('checkin_success', (data) => {
      setLiveFeed(prev => [data, ...prev].slice(0, 10));
      if (data.registrationId) {
        removeScansByRegistrationId(data.registrationId).then(() => refreshQueue());
      }
    });
    return () => socket.disconnect();
  }, [eventId, stationId, removeScansByRegistrationId, refreshQueue]);

  useEffect(() => {
    if (scannerInitialized.current) return;
    scannerInitialized.current = true;

    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;
    
    scanner.start({ facingMode: "environment" }, {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        return { 
          width: Math.floor(viewfinderWidth * 0.9), 
          height: Math.floor(viewfinderHeight * 0.9) 
        };
      }
    }, async (decodedText) => {
      if (scanner.getState() !== 3) {
        scanner.pause(true);
      }
      
      setScanFeedback({ status: 'loading', message: 'Verifying...' });
      
      let payload = {};
      try {
        const parts = decodedText.split('.');
        if (parts.length === 3) {
          payload = JSON.parse(atob(parts[1]));
        }
      } catch (e) {
        console.error("Could not parse JWT token payload", e);
      }

      const idempotencyKey = uuidv4();
      const newScan = {
        id: idempotencyKey,
        eventId,
        token: decodedText,
        stationId,
        scannedAt: Date.now(),
        status: 'PENDING',
        syncAttempts: 0,
        attendeeName: payload.n || payload.name || 'Unknown Attendee',
        registrationId: payload.r || payload.registrationId || null
      };
      
      await addScan(newScan);
      
      if (navigator.onLine) {
        try {
          await apiCall(`/events/${eventId}/scan`, {
            method: 'POST',
            body: JSON.stringify({ token: decodedText, stationId, idempotencyKey })
          });
          await removeScan(idempotencyKey);
          if (newScan.registrationId) {
            await removeScansByRegistrationId(newScan.registrationId);
          }
          setScanFeedback({ status: 'success', message: 'Verified!' });
        } catch (err) {
          const errorMsg = err.message || 'Verification Failed';
          if (errorMsg.includes('Already checked in') || errorMsg.includes('Invalid') || errorMsg.includes('expired') || errorMsg.includes('different event')) {
            await updateScanStatus(idempotencyKey, 'REJECTED_CONFLICT', errorMsg);
            setScanFeedback({ status: 'error', message: errorMsg });
          } else {
            await updateScanStatus(idempotencyKey, 'SYNC_FAILED', undefined, true);
            setScanFeedback({ status: 'offline', message: 'OFFLINE QUEUE - DIRECT ATTENDEE TO TABLE 3' });
          }
        }
      } else {
        setScanFeedback({ status: 'offline', message: 'OFFLINE QUEUE - DIRECT ATTENDEE TO TABLE 3' });
      }
      
      refreshQueue(); // Refresh the visual queue
      
      setTimeout(() => {
        setScanFeedback(null);
        if (scannerRef.current?.getState() === 3) { // 3 = PAUSED
          scannerRef.current?.resume();
        }
      }, 2500);
      
    }, undefined).catch(err => {
      console.error("Scanner start error:", err);
      scannerInitialized.current = false;
    });

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(console.error);
        } catch(e) {}
      }
    };
  }, [eventId, stationId, refreshQueue, removeScansByRegistrationId]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-2 transition">
          <span>&larr;</span> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
            <span className={`w-2.5 h-2.5 rounded-full ${navigator.onLine ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></span>
            <span className="text-xs font-bold text-gray-700">{navigator.onLine ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto w-full">
        
        {/* Left Column: Scanner and Queue */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 lg:p-5 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-black text-gray-900 text-lg">QR Scanner</h2>
              <span className="text-xs font-bold text-gray-400">Position QR within frame</span>
            </div>
            <div className="relative bg-gray-900 aspect-video lg:aspect-[4/3] w-full overflow-hidden">
              <div id="reader" className="w-full h-full object-cover"></div>
              
              {/* Instant Feedback Overlay */}
              {scanFeedback && (
                <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in
                  ${scanFeedback.status === 'success' ? 'text-green-400' : 
                    scanFeedback.status === 'error' ? 'text-red-400' : 
                    scanFeedback.status === 'loading' ? 'text-white' : 'text-yellow-400'}`}>
                  
                  {scanFeedback.status === 'success' && <CheckCircle className="w-24 h-24 mb-4 animate-bounce" />}
                  {scanFeedback.status === 'error' && <XCircle className="w-24 h-24 mb-4 animate-shake" />}
                  {scanFeedback.status === 'offline' && <WifiOff className="w-24 h-24 mb-4 opacity-90" />}
                  {scanFeedback.status === 'loading' && <Loader2 className="w-16 h-16 mb-4 animate-spin opacity-50" />}
                  
                  <span className="text-2xl lg:text-3xl font-black text-center px-4 tracking-tight drop-shadow-md">
                    {scanFeedback.message}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-bold text-gray-500">Pending Sync</h3>
              <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{queue.filter(s => s.status === 'PENDING' || s.status === 'SYNC_FAILED').length}</span>
            </div>
            <p className="text-xs font-medium text-gray-400 mb-3">Scans queued for server</p>
            <ul className="space-y-1.5 overflow-y-auto max-h-32 pr-1">
              {queue.filter(s => s.status === 'PENDING' || s.status === 'SYNC_FAILED').map(c => (
                <li key={c.id} className="text-xs flex flex-col gap-0.5 border-b border-gray-100 pb-1.5 last:border-0">
                  <div className="flex justify-between text-gray-700 font-bold">
                    <span className="truncate">{c.attendeeName}</span>
                    <span className="shrink-0 text-[10px] text-gray-400">{new Date(c.scannedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  {c.error && <span className="text-[10px] text-red-500 font-medium">{c.error}</span>}
                </li>
              ))}
            </ul>
          </div>
          
          {conflicts.length > 0 && (
            <div className="bg-red-50 p-4 lg:p-5 rounded-2xl border border-red-100">
              <h4 className="text-sm font-black text-red-800 mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Attention Required ({conflicts.length})
              </h4>
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {conflicts.map(c => (
                  <li key={c.id} className="text-xs text-red-700 bg-white p-3 rounded-xl border border-red-100 shadow-sm flex flex-col gap-1">
                    <div className="flex justify-between items-center font-black text-red-900">
                      <span className="truncate">{c.attendeeName}</span>
                      <span className="shrink-0 text-[10px] opacity-70">{new Date(c.scannedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <span className="font-medium opacity-90">{c.error || 'Conflict detected'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Live Activity Feed */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col overflow-hidden h-[500px] lg:h-[600px] sticky top-20">
          <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="font-black text-gray-900">Live Check-ins</h2>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {liveFeed.length === 0 ? (
              <div className="text-center text-gray-400 font-medium text-sm py-12 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center opacity-50 mb-2">
                  <CheckCircle className="w-6 h-6 text-gray-400" />
                </div>
                No recent check-ins
              </div>
            ) : (
              liveFeed.map((feed, idx) => (
                <div key={idx} className="bg-white border border-gray-100 p-3 lg:p-4 rounded-2xl shadow-sm hover:border-brand-100 transition animate-fade-in-down flex items-center gap-3 lg:gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center text-brand-700 font-black text-sm shrink-0">
                    {feed.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">{feed.userName}</p>
                    <p className="text-xs text-green-600 font-bold mt-0.5">Checked in • {new Date(feed.checkedInAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
