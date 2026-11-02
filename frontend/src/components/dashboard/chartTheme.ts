import { useTheme } from '../../context/ThemeContext';

// Recharts writes colors as SVG attributes, so they're resolved to hex per
// theme rather than CSS variables. The four series colors are a CVD-checked
// categorical set — always assign them in this fixed order.
const LIGHT = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  grid: '#e5e7eb',
  axis: '#8b9096',
  surface: '#ffffff',
  muted: '#d3d6dc',
};
const DARK: typeof LIGHT = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500'],
  grid: '#26272b',
  axis: '#71747c',
  surface: '#141416',
  muted: '#35363b',
};

export type ChartTheme = typeof LIGHT;

export function useChartTheme(): ChartTheme {
  return useTheme().theme === 'dark' ? DARK : LIGHT;
}
