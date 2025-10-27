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
  const sessionId = crypto.randomUUID().substring(0, 8);
  const emitter = new EventEmitter();

  const replProcess = spawn("ignite", ["attach", vmName], {
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
    emitter.emit("output", data);
  });

  replProcess.on("close", () => {
    emitter.emit("end");
    replSessions.delete(sessionId);
  });

  replSessions.set(sessionId, {
    vmName,
    process: replProcess,
    emitter,
  });

  return { sessionId, emitter };
};

export const writeToRepl = (sessionId:string, input: string) => {
  const session = replSessions.get(sessionId);
  if(!session){
    throw new Error(`Session ${sessionId} not found`);
  }
  session.process.stdin.write(input + "\n");
}


export const stopRepl = (sessionId: string) => {
  const session = replSessions.get(sessionId);
  if(!session){
    return;
  }
  session.process.kill();
  replSessions.delete(sessionId);
};

export const getReplEmitter = (sessionId: string) => {
  const session = replSessions.get(sessionId);
  if(!session){
    return;
  }
  return session.emitter;
};

