import type {
  Sandbox,
  CreateSandboxResponse,
  SandboxesResponse,
  StartReplResponse,
  SendInputResponse,
} from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export type {
  Sandbox,
  CreateSandboxResponse,
  SandboxesResponse,
  StartReplResponse,
  SendInputResponse,
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`[API] Making request to: ${url}`, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
    });

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    console.log(`[API] Response received:`, {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] Request failed:`, {
        url,
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      });
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log(`[API] Response data:`, responseData);
    return responseData;
  }

  // Sandbox CRUD operations
  async getSandboxes(): Promise<SandboxesResponse> {
    return this.request<SandboxesResponse>("/sandbox");
  }

  async createSandbox(): Promise<CreateSandboxResponse> {
    return this.request<CreateSandboxResponse>("/sandbox", {
      method: "POST",
    });
  }

  async deleteSandbox(
    sandboxId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/sandbox?id=${sandboxId}`,
      {
        method: "DELETE",
      }
    );
  }

  // REPL operations
  async startRepl(sandboxId: string): Promise<StartReplResponse> {
    return this.request<StartReplResponse>(`/sandbox/${sandboxId}/repl/start`, {
      method: "POST",
    });
  }

  async sendInput(
    sessionId: string,
    input: string
  ): Promise<SendInputResponse> {
    return this.request<SendInputResponse>(`/sandbox/repl/${sessionId}/input`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });
  }

  async stopRepl(
    sessionId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/sandbox/repl/${sessionId}`,
      {
        method: "DELETE",
      }
    );
  }

  // SSE connection for REPL output
  createReplStream(sessionId: string): EventSource {
    const url = `${this.baseUrl}/sandbox/repl/${sessionId}/stream`;
    console.log(`[API] Creating EventSource for REPL stream: ${url}`);
    return new EventSource(url);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
