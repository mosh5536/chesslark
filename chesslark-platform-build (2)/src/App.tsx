import { useState } from 'react';
import AnalysisPage from './pages/page';
import Home from './pages/Home';
import Openings from './pages/Openings';
import Learning from './pages/Learning';
import type { RouteKey } from './pages/routes';

export type ThemeMode = 'dark' | 'light';

export default function App() {
  const [route, setRoute] = useState<RouteKey>('home');
  const [theme, setTheme] = useState<ThemeMode>('dark');

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  if (route === 'analysis') {
    return (
      <div data-theme={theme}>
        <AnalysisPage onNavigate={setRoute} activeRoute={route} theme={theme} onToggleTheme={toggleTheme} />
      </div>
    );
  }

  if (route === 'openings') {
    return (
      <div data-theme={theme}>
        <Openings onNavigate={setRoute} theme={theme} onToggleTheme={toggleTheme} />
      </div>
    );
  }

  if (route === 'learning') {
    return (
      <div data-theme={theme}>
        <Learning onNavigate={setRoute} theme={theme} onToggleTheme={toggleTheme} />
      </div>
    );
  }

  return (
    <div data-theme={theme}>
      <Home onNavigate={setRoute} theme={theme} onToggleTheme={toggleTheme} />
    </div>
  );
}
