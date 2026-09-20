import { Loader2 } from 'lucide-react';
import './Spinner.css';

// One spinning icon for every "this is in progress" moment in the app, so every
// loading state rotates at the same speed instead of five separate CSS builds.
// Decorative — the button/label around it already says what's happening.
export default function Spinner({ size = 16, className = '' }) {
  return (
    <Loader2
      size={size}
      className={`spinner-icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    />
  );
}
