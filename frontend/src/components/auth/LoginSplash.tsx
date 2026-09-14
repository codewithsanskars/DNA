import { useEffect, useRef } from 'react';
import swfsLogo from '../../assets/SWFS-LOGO.png';

// Keep this in sync with the `logo-intro` animation duration in tailwind.config.js.
const ANIMATION_MS = 1800;

interface LoginSplashProps {
  /** Called once the animation finishes, to dismiss the overlay. */
  onDone: () => void;
}

/** Full-screen overlay shown briefly right after a fresh sign-in (not a resumed session). */
export default function LoginSplash({ onDone }: LoginSplashProps) {
  // A backgrounded tab (or a browser that just doesn't fire the event) can
  // mean `onAnimationEnd` never lands — this timer guarantees the splash
  // always gets dismissed even then, instead of staying stuck on screen.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), ANIMATION_MS + 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <img
        src={swfsLogo}
        alt="SWFS"
        className="h-24 w-auto sm:h-28 animate-logo-intro"
        onAnimationEnd={onDone}
      />
    </div>
  );
}
