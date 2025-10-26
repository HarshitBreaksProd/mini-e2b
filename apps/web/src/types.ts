export type Sandbox = {
  id: string;
  status: string;
  containerId: string;
  createdAt: string;
};

export type CreateSandboxResponse = {
  message: string;
  success: boolean;
  sandboxId: string;
};

export type SandboxesResponse = {
  success: boolean;
  sandboxes: Sandbox[];
};

export type StartReplResponse = {
  success: boolean;
  sessionId: string;
};

export type SendInputResponse = {
  success: boolean;
  message: string;
};
