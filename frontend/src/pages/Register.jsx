import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiCall } from '../services/api';

export default function Register() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'ATTENDEE' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiCall('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      if (data.user.role === 'ORGANIZER') {
        navigate('/dashboard');
      } else {
        navigate('/attendee');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-2 text-sm">Join us to manage or attend events</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input 
              type="text" required 
              value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-brand-500 outline-none transition" 
              placeholder="John Doe" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" required 
              value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-brand-500 outline-none transition" 
              placeholder="you@example.com" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              type="password" required 
              value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-brand-500 outline-none transition" 
              placeholder="••••••••" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">I am a</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({...formData, role: 'ATTENDEE'})}
                className={`py-3 px-4 rounded-xl font-medium text-sm transition border outline-none ${formData.role === 'ATTENDEE' ? 'bg-brand-50 border-brand-500 text-brand-700 ring-1 ring-brand-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Attendee
              </button>
              <button
                type="button"
                onClick={() => setFormData({...formData, role: 'ORGANIZER'})}
                className={`py-3 px-4 rounded-xl font-medium text-sm transition border outline-none ${formData.role === 'ORGANIZER' ? 'bg-brand-50 border-brand-500 text-brand-700 ring-1 ring-brand-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Organizer
              </button>
            </div>
          </div>
          
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">{error}</div>}

          <button type="submit" className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700 transition shadow-sm">
            Sign Up
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-600">
          Already have an account? <Link to="/" className="text-brand-600 hover:text-brand-700 font-semibold">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
