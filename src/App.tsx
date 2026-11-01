import { SessionProvider } from './sessionStore';
import { Dashboard } from './components/Dashboard';
import { DesktopBridge } from './desktop/DesktopBridge';

export default function App() {
  return (
    <SessionProvider>
      <DesktopBridge />
      <Dashboard />
    </SessionProvider>
  );
}
