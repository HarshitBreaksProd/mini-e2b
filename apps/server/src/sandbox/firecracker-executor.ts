import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import { EventEmitter } from "events";
import crypto from "crypto";
import { emit, exitCode, stderr } from "process";
import { cleanTerminalOutput } from "./docker-executor";

const execAsync = promisify(exec);

const replSessions = new Map<
  string,
  {
    vmName: string;
    process: any;
    emitter: EventEmitter;
  }
>();

export const createContainer = async () => {
  console.log("Creating container on firecracker");
  const vmName = `vm-${crypto.randomUUID().substring(0, 8)}`;

  const command = `ignite run weaveworks/ignite-ubuntu:latest --name ${vmName} --cpus 1 --memory 512MB --size 5GB --ssh`;

  try {
    await execAsync(command);

    console.log(`[FIRECRACKER] VM ${vmName} created successfully`);

    return vmName;
  } catch (err) {
    console.log("error creating vm");
    throw err;
  }
};

export const deleteContainer = async (vmName: string) => {
  console.log("Deleting container on firecracker");
  try {
    await execAsync(`ignite stop ${vmName}`);

    await execAsync(`ignite rm -f ${vmName}`);

    console.log(`[FIRECRACKER] VM ${vmName} deleted successfully`);
  } catch (err) {
    console.log("Failed to delete vm");
    throw err;
  }
};

export const executeCommand = async (vmName: string, command: string) => {
  console.log("Executing command on firecracker");
  try {
    const escapedCommand = command.replace(/"/g, '\\"');

    const fullCommand = `ignite exec ${vmName} -- /bin/sh -c "${escapedCommand}"`;

    const { stdout, stderr } = await execAsync(fullCommand);

    console.log(
      `[FIRECRACKER] Command ${command} executed successfully on VM ${vmName}`
    );

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (err: any) {
    console.log("error executing command");
    console.log(err);
    return {
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || "",
      exitCode: exitCode || 1,
    };
  }
};

export const startRepl = async (vmName: string) => {
  console.log("Starting repl on firecracker");
  const sessionId = crypto.randomUUID().substring(0, 8);
  const emitter = new EventEmitter();

  const replProcess = spawn("ignite", ["exec", vmName, "--", "/bin/bash"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  replProcess.stdout.on("data", (chunk: Buffer) => {
    const data = chunk.toString();
    const cleaned = cleanTerminalOutput(data);
    if (cleaned) {
      emitter.emit("output", cleaned);
    }
  });

  replProcess.stderr.on("data", (chunk: Buffer) => {
    const data = chunk.toString();
    console.log(
      `[FIRECRACKER] Process stderr for sessionId ${sessionId}:`,
      data
    );
    emitter.emit("output", data);
  });

  replProcess.on("close", (code) => {
    console.log(
      `[FIRECRACKER] Process closed with code: ${code} for sessionId: ${sessionId}`
    );
    emitter.emit("end");
    replSessions.delete(sessionId);
  });

  replSessions.set(sessionId, {
    vmName,
    process: replProcess,
    emitter,
  });

  console.log(`[FIRECRACKER] Stored sessionId: ${sessionId} for VM: ${vmName}`);
  console.log(`[FIRECRACKER] replSessions after storing:`, replSessions);
  console.log(
    `[FIRECRACKER] Available sessionIds after storing:`,
    Array.from(replSessions.keys())
  );

  return { sessionId, emitter };
};

export const writeToRepl = (sessionId: string, input: string) => {
  console.log("Writing to repl on firecracker");
  const session = replSessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }
  session.process.stdin.write(input + "\n");
};

export const stopRepl = (sessionId: string) => {
  console.log("Stopping repl on firecracker");
  const session = replSessions.get(sessionId);
  if (!session) {
    return;
  }
  session.process.kill();
  replSessions.delete(sessionId);
};

export const getReplEmitter = (sessionId: string) => {
  console.log("Getting repl emitter on firecracker");
  console.log(`[FIRECRACKER] Looking for sessionId: ${sessionId}`);
  console.log(`[FIRECRACKER] Current replSessions map:`, replSessions);
  console.log(
    `[FIRECRACKER] Available sessionIds:`,
    Array.from(replSessions.keys())
  );

  const session = replSessions.get(sessionId);
  if (!session) {
    console.log(`[FIRECRACKER] Session ${sessionId} not found`);
    return;
  }
  return session.emitter;
};
