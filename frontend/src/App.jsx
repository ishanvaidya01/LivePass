import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import OrganizerDashboard from './pages/OrganizerDashboard';
import AttendeeDashboard from './pages/AttendeeDashboard';
import TicketView from './pages/TicketView';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<OrganizerDashboard />} />
        <Route path="/attendee" element={<AttendeeDashboard />} />
        <Route path="/ticket/:id" element={<TicketView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
