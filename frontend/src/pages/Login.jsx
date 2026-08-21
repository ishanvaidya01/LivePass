import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiCall } from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
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
          <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-500 mt-2 text-sm">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" 
              placeholder="you@example.com" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" 
              placeholder="••••••••" 
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700 transition shadow-sm"
          >
            Sign In
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-600">
          Don't have an account? <Link to="/register" className="text-brand-600 hover:text-brand-700 font-semibold">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
