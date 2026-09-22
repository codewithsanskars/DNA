import { useTheme } from '../context/ThemeContext';
import  darkLogo  from '../assets/SWFS-LOGO White Theme.png';
import lightLogo from '../assets/SWFS-LOGO White Theme.png';

/** SWFS wordmark that matches the current theme — white-on-transparent for dark mode, the regular mark otherwise. */
export function useThemedLogo(): string {
  const { theme } = useTheme();
  return theme === 'dark' ? lightLogo : darkLogo;
}
