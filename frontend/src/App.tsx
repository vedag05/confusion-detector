import { useSignals } from "./hooks/useSignals";

function App() {
  useSignals();                       // start streaming test packets
  return <h1>Confusion detector test running…</h1>;
}

export default App;

