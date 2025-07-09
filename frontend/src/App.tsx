import { useSignals } from './hooks/useSignals';

function App() {
  useSignals();                      // start streaming to Flask
  return <h1>Confusion detector running…</h1>;
}

export default App;

