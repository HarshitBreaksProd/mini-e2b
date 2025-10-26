import Docker from "dockerode";
import { EventEmitter } from "events";
import crypto from "crypto";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const replSessions = new Map<
  string,
  {
    stream: NodeJS.ReadWriteStream;
    emitter: EventEmitter;
  }
>();

// Function to clean terminal output data
const cleanTerminalOutput = (data: string): string => {
  return data
    .replace(/\u0001/g, "") // Remove SOH (Start of Heading)
    .replace(/\u0000/g, "") // Remove NULL characters
    .replace(/\u0008/g, "") // Remove backspace
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "") // Remove ANSI escape sequences
    .replace(/\u001b\[6n/g, "") // Remove specific cursor position query
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\r/g, "\n") // Convert remaining \r to \n
    .trim(); // Remove leading/trailing whitespace
};

export const createContainer = async () => {
  const images = await docker.listImages();
  const imageExists = images.some(
    (img) => img.RepoTags && img.RepoTags.includes("ubuntu:latest")
  );

  if (!imageExists) {
    console.log("Pulling ubuntu:latest image...");
    await docker.pull("ubuntu:latest");
    console.log("Image pulled successfully");
  } else {
    console.log("Using existing ubuntu:latest image");
  }

  const container = await docker.createContainer({
    Image: "ubuntu:latest",
    Cmd: ["/bin/sh"],
    OpenStdin: true,
    Tty: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
  });

  console.log(container.id);
  await container.start();
  console.log(
    (
      await container.logs({
        stderr: true,
        stdout: true,
      })
    ).toString()
  );
  return container.id;
};

export const deleteContainer = async (id: string) => {
  const container = docker.getContainer(id);

  await container.stop();
  await container.remove();

  console.log(await docker.listContainers());

  return;
};

// DO NOT NEED AS SSE HANDLES BOTH CASES
export const executeCommand = async (id: string, command: string) => {
  const container = docker.getContainer(id);

  const exec = await container.exec({
    Cmd: ["/bin/sh", "-c", command],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ Detach: false });

  let stdout = "";
  let stderr = "";

  return new Promise((resolve, reject) => {
    container.modem.demuxStream(
      stream,
      {
        write: (chunk: Buffer) => {
          stdout += chunk.toString();
        },
      },
      {
        write: (chunk: Buffer) => {
          stderr += chunk.toString();
        },
      }
    );

    stream.on("end", async () => {
      const inspect = await exec.inspect();
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitcode: inspect.ExitCode || 0,
      });
    });

    stream.on("error", reject);
  });
};

export const startRepl = async (id: string) => {
  const container = docker.getContainer(id);

  const exec = await container.exec({
    Cmd: ["/bin/sh"],
    AttachStderr: true,
    AttachStdin: true,
    AttachStdout: true,
    Tty: true,
  });

  const stream = await exec.start({
    hijack: true,
    stdin: true,
  });

  const emitter = new EventEmitter();

  stream.on("data", (chunk: Buffer) => {
    const rawData = chunk.toString();
    const cleanData = cleanTerminalOutput(rawData);

    // Only emit if there's actual content after cleaning
    if (cleanData) {
      emitter.emit("output", cleanData);
    }
  });

  stream.on("end", () => {
    emitter.emit("end");
  });

  const sessionId = crypto.randomUUID();

  replSessions.set(sessionId, { stream, emitter });

  return { sessionId, emitter };
};

export const writeToRepl = (sessionId: string, input: string) => {
  const session = replSessions.get(sessionId);

  if (!session) {
    throw new Error("REPL session not found");
  }

  session.stream.write(input + "\n");
};

export const stopRepl = (sessionId: string) => {
  const session = replSessions.get(sessionId);

  if (!session) {
    return;
  }

  session.stream.end();
  replSessions.delete(sessionId);
};

export const getReplEmitter = (sessionId: string): EventEmitter | undefined => {
  return replSessions.get(sessionId)?.emitter;
};
