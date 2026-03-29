import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const result = await login(identifier, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message || 'Failed to login');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">
      <Navbar />
      
      <div className="fixed inset-0 z-0 bg-grid-pattern opacity-10"></div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md bg-zinc-900 border border-white/10 p-8 rounded-2xl shadow-2xl backdrop-blur-sm">
          <h2 className="text-3xl font-bold mb-6 text-center tracking-tight">Welcome Back</h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Username or Email</label>
              <input
                type="text"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                placeholder="Enter your username or email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
              <input
                type="password"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full neo-brutalism bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition-colors"
            >
              LOG IN
            </button>
          </form>

          <p className="mt-8 text-center text-zinc-500 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="text-purple-400 hover:text-purple-300 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
