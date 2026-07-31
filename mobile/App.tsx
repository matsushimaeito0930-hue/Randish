import AppRoot from './src/AppRoot';
import { AppErrorBoundary } from './src/AppErrorBoundary';

export default function App() {
  return (
    <AppErrorBoundary>
      <AppRoot />
    </AppErrorBoundary>
  );
}
