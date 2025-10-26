import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { Button } from "../components/ui/button";
import { ArrowLeft, Send } from "lucide-react";

interface ReplOutput {
  type: "connected" | "output" | "end";
  data?: string;
}

export default function SandboxRepl() {
  const { id: sandboxId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReplActive, setIsReplActive] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start REPL mutation
  const startReplMutation = useMutation({
    mutationFn: () => apiClient.startRepl(sandboxId!),
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setIsReplActive(true);
    },
  });

  // Send input mutation
  const sendInputMutation = useMutation({
    mutationFn: (input: string) => apiClient.sendInput(sessionId!, input),
    onSuccess: () => {
      setInput("");
    },
  });

  // Stop REPL mutation
  const stopReplMutation = useMutation({
    mutationFn: () => apiClient.stopRepl(sessionId!),
    onSuccess: () => {
      setIsReplActive(false);
      setIsConnected(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    },
  });

  // Start REPL session on mount
  useEffect(() => {
    if (sandboxId && !isReplActive) {
      startReplMutation.mutate();
    }
  }, [sandboxId]);

  // Set up SSE connection when session is available
  useEffect(() => {
    if (sessionId && !eventSourceRef.current) {
      const eventSource = apiClient.createReplStream(sessionId);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setOutput((prev) => [...prev, "Connected to sandbox..."]);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: ReplOutput = JSON.parse(event.data);

          if (data.type === "connected") {
            setOutput((prev) => [...prev, "REPL session started"]);
          } else if (data.type === "output" && data.data) {
            setOutput((prev) => [...prev, data.data!]);
          } else if (data.type === "end") {
            setOutput((prev) => [...prev, "REPL session ended"]);
            setIsConnected(false);
          }
        } catch (error) {
          console.error("Error parsing SSE data:", error);
          // Try to handle as plain text if JSON parsing fails
          if (event.data) {
            setOutput((prev) => [...prev, event.data]);
          }
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE error:", error);
        setIsConnected(false);
        setOutput((prev) => [...prev, "Connection error occurred"]);
      };
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [sessionId]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Auto-focus input on every render
  useEffect(() => {
    if (inputRef.current && isConnected) {
      inputRef.current.focus();
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionId && isReplActive) {
        stopReplMutation.mutate();
      }
    };
  }, []);

  const handleSendCommand = () => {
    if (input.trim() && sessionId && isConnected) {
      setOutput((prev) => [...prev, `$ ${input}`]);
      sendInputMutation.mutate(input);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const handleBack = () => {
    if (sessionId && isReplActive) {
      stopReplMutation.mutate();
    }
    navigate("/");
  };

  if (!sandboxId) {
    return (
      <div className="min-h-screen w-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Invalid sandbox ID</p>
          <Button onClick={() => navigate("/")}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="text-white">
            <h1 className="text-lg font-semibold">
              Sandbox {sandboxId.slice(0, 8)}...
            </h1>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
              ></div>
              {isConnected ? "Connected" : "Disconnected"}
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 p-4 min-h-0">
        <div
          ref={outputRef}
          className="h-full bg-black rounded-lg p-4 overflow-y-auto font-mono text-sm text-green-400"
        >
          {startReplMutation.isPending && (
            <div className="text-yellow-400">Starting REPL session...</div>
          )}
          {startReplMutation.isError && (
            <div className="text-red-400">Failed to start REPL session</div>
          )}
          {output.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
          {isConnected && output.length === 0 && (
            <div className="text-gray-500">Ready for commands...</div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-gray-800 border-t border-gray-700 p-4 flex-shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isConnected ? "Enter command..." : "Connecting..."}
              disabled={!isConnected || sendInputMutation.isPending}
              className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <Button
            onClick={handleSendCommand}
            disabled={
              !isConnected || !input.trim() || sendInputMutation.isPending
            }
            className="px-6"
          >
            <Send className="h-4 w-4 mr-2" />
            {sendInputMutation.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
