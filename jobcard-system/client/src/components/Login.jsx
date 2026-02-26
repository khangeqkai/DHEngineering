import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Lock } from 'lucide-react';
import dhLogo from '../assets/dh-logo.png';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startCountdown = (seconds) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCountdown(seconds);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      const message = err.message || 'Login failed';
      const match = message.match(/wait (\d+) seconds/);
      if (match) {
        const seconds = parseInt(match[1], 10);
        setError(`Too many attempts. Please wait ${seconds} seconds before trying again.`);
        startCountdown(seconds);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src={dhLogo} alt="DH Engineering" className="login-logo" />
        </div>

        <hr className="login-divider" />

        <form onSubmit={handleSubmit}>
          <h1 className="login-form-title">Job Card System</h1>
          {error && (
            <div className="login-error">
              {countdown > 0
                ? `Too many attempts. Please wait ${countdown} second${countdown === 1 ? '' : 's'} before trying again.`
                : error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <User size={16} />
              </span>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <Lock size={16} />
              </span>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading || countdown > 0}>
            {loading ? 'Signing in...' : countdown > 0 ? `Wait ${countdown}s` : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}
