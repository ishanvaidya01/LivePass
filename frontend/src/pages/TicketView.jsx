import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiCall } from '../services/api';
import QRCode from 'qrcode';
import { Sun, AlertCircle, CheckCircle } from 'lucide-react';
import { io } from 'socket.io-client';

export default function TicketView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticketData, setTicketData] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [verified, setVerified] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const loadTicketRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function loadTicket() {
      try {
        const data = await apiCall(`/registrations/${id}/token?t=${Date.now()}`);
        if (!isMounted) return;

        if (data.alreadyCheckedIn) {
          setTicketData(data);
          setVerified(true);
          return;
        }
        
        // Generate high-res QR code first
        const url = await QRCode.toDataURL(data.token, {
          width: 400,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });
        
        if (!isMounted) return;
        
        // Update all state simultaneously to prevent staggered rendering
        setQrUrl(url);
        setTicketData(data);
        setIsOffline(false);
        setTimeLeft(60); // Reset timer upon successful load
      } catch (err) {
        if (!isMounted) return;
        
        console.error("Failed to refresh ticket:", err);
        const errMsg = err.message || '';
        
        if (!errMsg.includes('Failed to fetch') && !errMsg.includes('NetworkError') && navigator.onLine) {
          if (!ticketData) { 
            setErrorMsg(errMsg || 'Ticket unavailable');
          }
        } else {
          setIsOffline(true);
        }
      }
    }
    
    loadTicketRef.current = loadTicket;
    loadTicket();
    const intervalId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (loadTicketRef.current) loadTicketRef.current();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    const socket = io('http://localhost:5000');
    
    socket.on('ticket_verified', (data) => {
      setVerified(true);
    });

    socket.on('ticket_error', (data) => {
      if (data.error === 'outdated') {
        // Instantly and silently fetch a new QR code without disrupting the UI
        if (loadTicketRef.current) loadTicketRef.current();
      } else if (data.error === 'invalid_event') {
        setErrorMsg('You scanned at the wrong event!');
        setTimeout(() => {
          setErrorMsg('');
        }, 4000);
      }
    });

    socket.on('disconnect', () => {
      setIsOffline(true);
    });

    let isInitialConnect = true;
    socket.on('connect', () => {
      setIsOffline(false);
      socket.emit('join_ticket', { registrationId: id });
      
      // Only reload on reconnect, not on the initial mount, to prevent flickering
      if (!isInitialConnect && loadTicketRef.current) {
        loadTicketRef.current();
      }
      isInitialConnect = false;
    });

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      socket.disconnect();
    };
  }, [id]);

  if (errorMsg) return (
    <div className="min-h-screen bg-red-500 text-white font-sans flex flex-col items-center justify-center p-6 text-center animate-fade-in relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-400 to-red-600 opacity-50 pointer-events-none"></div>
      <AlertCircle className="w-32 h-32 mb-6 relative z-10" />
      <h1 className="text-4xl font-black mb-2 relative z-10 drop-shadow-md">TICKET ERROR</h1>
      <p className="text-xl font-bold opacity-90 relative z-10">{errorMsg}</p>
      <button onClick={() => navigate(-1)} className="mt-12 text-sm font-bold bg-white/20 hover:bg-white/30 px-6 py-3 rounded-full backdrop-blur-md transition relative z-10">
        Back to Dashboard
      </button>
    </div>
  );

  if (!ticketData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Loading digital pass...</p>
      </div>
    </div>
  );

  if (verified) return (
    <div className="min-h-screen bg-green-500 text-white font-sans flex flex-col items-center justify-center p-6 text-center animate-fade-in relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-green-400 to-green-600 opacity-50 pointer-events-none"></div>
      <CheckCircle className="w-32 h-32 mb-6 animate-bounce relative z-10" />
      <h1 className="text-5xl font-black mb-2 relative z-10 drop-shadow-md">VERIFIED!</h1>
      <p className="text-xl font-bold opacity-90 relative z-10">Welcome to {ticketData.event.name}</p>
      <button onClick={() => navigate(-1)} className="mt-12 text-sm font-bold bg-white/20 hover:bg-white/30 px-6 py-3 rounded-full backdrop-blur-md transition relative z-10">
        Back to Dashboard
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden relative">
      
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-600/30 to-transparent blur-3xl pointer-events-none"></div>
      
      <button onClick={() => navigate(-1)} className="absolute top-4 lg:top-6 left-4 lg:left-6 text-sm font-bold text-gray-300 hover:text-white flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition z-20">
        <span>&larr;</span> Close Pass
      </button>

      {/* Wallet Pass Container */}
      <div className="w-full max-w-sm mt-12 sm:mt-0 relative z-10 animate-fade-in-up">
        
        {/* Offline Popup */}
        {isOffline && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-red-500 text-white p-4 rounded-2xl shadow-[0_4px_20px_rgba(239,68,68,0.5)] flex gap-3 items-center z-50 animate-fade-in-up">
            <AlertCircle className="w-8 h-8 shrink-0 text-red-100" />
            <div className="text-left">
              <p className="font-black text-sm uppercase tracking-wider mb-0.5">Server Offline</p>
              <p className="text-xs font-bold text-red-100">Sorry for the inconvenience. Please refer to the ticket checker person for further instructions.</p>
            </div>
          </div>
        )}

        {/* Brightness Warning */}
        <div className="flex items-center justify-center gap-2 text-brand-200 mb-4 bg-brand-900/50 py-2.5 px-4 rounded-full border border-brand-500/30 backdrop-blur-md">
          <Sun className="w-4 h-4 animate-pulse text-yellow-400" />
          <span className="text-xs font-bold tracking-wide">Turn screen brightness to max</span>
        </div>

        {/* The Pass */}
        <div className="bg-white text-gray-900 rounded-[32px] overflow-hidden shadow-2xl relative">
          
          {/* Pass Header */}
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent"></div>
            <h2 className="text-2xl font-black mb-1 relative z-10 drop-shadow-md">{ticketData.event.name}</h2>
            <p className="text-brand-100 font-bold text-sm flex items-center justify-center gap-2 relative z-10">
              <span>{new Date(ticketData.event.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className="opacity-50">•</span>
              <span>{new Date(ticketData.event.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            </p>
          </div>

          {/* Scallop details (wallet notch) */}
          <div className="flex justify-between items-center px-4 -mt-3 relative z-10">
            <div className="w-6 h-6 bg-gray-900 rounded-full shadow-inner"></div>
            <div className="flex-1 border-b-2 border-dashed border-gray-300 mx-2"></div>
            <div className="w-6 h-6 bg-gray-900 rounded-full shadow-inner"></div>
          </div>

          {/* Pass Body (QR Code) */}
          <div className="p-8 flex flex-col items-center">
            <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 mb-6 w-full max-w-[280px] aspect-square relative">
              {qrUrl ? (
                <img src={qrUrl} alt="Ticket QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-gray-100 rounded-xl animate-pulse"></div>
              )}
            </div>
            
            {/* Visual Timer Pill */}
            <div className="flex items-center justify-center gap-2 mb-6 text-brand-600 font-bold bg-brand-50 px-4 py-1.5 rounded-full text-xs border border-brand-100 shadow-sm">
               <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
               Refreshes in {timeLeft}s
            </div>
            
            <div className="text-center w-full">
              <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Admit One</p>
              <h3 className="text-2xl font-black text-gray-900 truncate">{ticketData.user.name}</h3>
              <p className="text-gray-500 font-bold text-sm mt-1">{ticketData.user.email}</p>
            </div>
          </div>
          
          {/* Pass Footer */}
          <div className="bg-gray-50 p-5 lg:p-6 border-t border-gray-100 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Venue</p>
              <p className="text-sm font-black text-gray-900 truncate max-w-[150px]">{ticketData.event.venue}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Ticket ID</p>
              <p className="text-sm font-mono font-black text-gray-900">{id.split('-')[0].toUpperCase()}</p>
            </div>
          </div>

        </div>
        
        {/* Help text */}
        <p className="text-center text-gray-400 text-xs mt-6 font-bold flex items-center justify-center gap-1.5 opacity-80">
          <AlertCircle className="w-4 h-4" /> Present this pass at the entrance
        </p>

      </div>
    </div>
  );
}
