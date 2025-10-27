import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import { EventEmitter } from "events";
import crypto from "crypto";
import { exitCode, stderr } from "process";

const execAsync = promisify(exec);

const replSessions = new Map<
  string,
  {
    vmName: string;
    process: any;
    emitter: EventEmitter;
  }
>();

const waitForVMReady = async (
  vmName: string,
  maxAttempts = 100,
  delayMs = 500
) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(
        `ignite ps --filter "{{.Name}}==${vmName}" --template "{{.Status}}"`
      );
      const status = stdout.trim();

      if (status === "running" || status === "Running") {
        console.log(`[FIRECRACKER] VM ${vmName} is ready!`);
        return;
      }
    } catch (error) {
      console.log(error);
      console.log("Error in vm ready status polling");
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `VM ${vmName} did not become ready within ${maxAttempts} attempts`
  );
};

export const createContainer = async () => {
  const vmName = `vm-${crypto.randomUUID().substring(0, 8)}`;

  const command = `ignite run weaveworks/ignite-ubuntu:latest --name ${vmName} --cpus 1 --memory 512MB --size 5GB --ssh`;

  try {
    await execAsync(command);

    await waitForVMReady(vmName);

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
