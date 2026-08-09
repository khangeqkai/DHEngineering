import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { User, Lock } from 'lucide-react';
import dhLogo from '../assets/dh-logo.png';
import Waves from './common/Waves';
import GradientText from './common/GradientText';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  // null = not asked yet (offer the form as normal), false = the server isn't
  // answering, true = it is. Only false holds the form back.
  const [serverReady, setServerReady] = useState(null);
  const [readyCheckKey, setReadyCheckKey] = useState(0);
  const intervalRef = useRef(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // In development the window opens as soon as the page builder is ready, while
  // the server is still starting (and it restarts on every saved file), so the
  // sign-in form can be on screen with nothing behind it. Ask first, and keep
  // asking until it answers, so a sign-in never fails for that reason alone.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const check = async () => {
      const ready = await api.isServerReady();
      if (cancelled) return;
      setServerReady(ready);
      if (!ready) timer = setTimeout(check, 2000);
    };
    check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [readyCheckKey]);

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
      if (err.code === 'SERVER_UNREACHABLE') {
        // Say it in the waiting notice, not as a sign-in error — nothing the
        // person typed was wrong. Start watching for the server again.
        setServerReady(false);
        setReadyCheckKey((k) => k + 1);
        return;
      }
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
      <div className="login-bg" style={{ pointerEvents: 'auto' }}>
        <Waves
          lineColor="rgba(37, 99, 235, 0.35)"
          backgroundColor="#060e1c"
          waveSpeedX={0.015}
          waveSpeedY={0.005}
          waveAmpX={40}
          waveAmpY={20}
          xGap={12}
          yGap={36}
          friction={0.925}
          tension={0.005}
          maxCursorMove={120}
        />
      </div>
      <div className="login-card">
        <div className="login-header">
          <img src={dhLogo} alt="DH Engineering" className="login-logo" />
        </div>

        <hr className="login-divider" />

        <form onSubmit={handleSubmit}>
          <h1 className="login-form-title">
            <GradientText colors={['#0b2d52', '#2563eb', '#60a5fa', '#2563eb', '#0b2d52']} animationSpeed={8}>
              Job Card System
            </GradientText>
          </h1>
          {serverReady === false && (
            <div className="login-notice">
              Starting up — the server isn't ready yet.
            </div>
          )}
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
            <label htmlFor="password">PIN</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">
                <Lock size={16} />
              </span>
              <input
                type="password"
                id="password"
                inputMode="numeric"
                maxLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter 4-digit PIN"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || countdown > 0 || serverReady === false}
          >
            {loading
              ? 'Signing in...'
              : serverReady === false
                ? 'Waiting for the server...'
                : countdown > 0
                  ? `Wait ${countdown}s`
                  : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}
