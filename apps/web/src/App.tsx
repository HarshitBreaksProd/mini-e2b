import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SandboxList from "./pages/SandboxList";
import SandboxRepl from "./pages/SandboxRepl";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<SandboxList />} />
          <Route path="/sandbox/:id" element={<SandboxRepl />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
