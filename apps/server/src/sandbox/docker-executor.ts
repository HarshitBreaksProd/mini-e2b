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
  console.log(`[DOCKER REPL] Starting REPL for container: ${id}`);

  try {
    const container = docker.getContainer(id);
    console.log(`[DOCKER REPL] Got container reference for: ${id}`);

    console.log(`[DOCKER REPL] Creating exec instance for container: ${id}`);
    const exec = await container.exec({
      Cmd: ["/bin/sh"],
      AttachStderr: true,
      AttachStdin: true,
      AttachStdout: true,
      Tty: true,
    });
    console.log(`[DOCKER REPL] Exec instance created for container: ${id}`);

    console.log(`[DOCKER REPL] Starting exec stream for container: ${id}`);
    const stream = await exec.start({
      hijack: true,
      stdin: true,
    });
    console.log(`[DOCKER REPL] Exec stream started for container: ${id}`);

    const emitter = new EventEmitter();
    console.log(`[DOCKER REPL] EventEmitter created for container: ${id}`);

    stream.on("data", (chunk: Buffer) => {
      const rawData = chunk.toString();
      console.log(
        `[DOCKER REPL] Raw data received from container ${id}:`,
        rawData
      );
      const cleanData = cleanTerminalOutput(rawData);
      console.log(`[DOCKER REPL] Cleaned data for container ${id}:`, cleanData);

      // Only emit if there's actual content after cleaning
      if (cleanData) {
        console.log(
          `[DOCKER REPL] Emitting output for container ${id}:`,
          cleanData
        );
        emitter.emit("output", cleanData);
      }
    });

    stream.on("end", () => {
      console.log(`[DOCKER REPL] Stream ended for container: ${id}`);
      emitter.emit("end");
    });

    stream.on("error", (error) => {
      console.error(`[DOCKER REPL] Stream error for container ${id}:`, error);
      emitter.emit("error", error);
    });

    const sessionId = crypto.randomUUID();
    console.log(
      `[DOCKER REPL] Generated sessionId: ${sessionId} for container: ${id}`
    );

    replSessions.set(sessionId, { stream, emitter });
    console.log(
      `[DOCKER REPL] Session stored for sessionId: ${sessionId}, container: ${id}`
    );
    console.log(`[DOCKER REPL] Total active sessions: ${replSessions.size}`);

    return { sessionId, emitter };
  } catch (error) {
    console.error(
      `[DOCKER REPL] Error starting REPL for container ${id}:`,
      error
    );
    throw error;
  }
};

export const writeToRepl = (sessionId: string, input: string) => {
  console.log(
    `[DOCKER REPL] Writing input to sessionId: ${sessionId}, input: "${input}"`
  );

  const session = replSessions.get(sessionId);
  console.log(
    `[DOCKER REPL] Session lookup for sessionId ${sessionId}:`,
    session ? "found" : "not found"
  );

  if (!session) {
    console.error(
      `[DOCKER REPL] Session not found for sessionId: ${sessionId}`
    );
    throw new Error("REPL session not found");
  }

  console.log(`[DOCKER REPL] Writing to stream for sessionId: ${sessionId}`);
  session.stream.write(input + "\n");
  console.log(
    `[DOCKER REPL] Input written successfully for sessionId: ${sessionId}`
  );
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
  console.log(`[DOCKER REPL] Getting emitter for sessionId: ${sessionId}`);
  const session = replSessions.get(sessionId);
  console.log(
    `[DOCKER REPL] Session found for sessionId ${sessionId}:`,
    session ? "yes" : "no"
  );
  console.log(`[DOCKER REPL] Total active sessions: ${replSessions.size}`);
  console.log(
    `[DOCKER REPL] Active sessionIds:`,
    Array.from(replSessions.keys())
  );
  return session?.emitter;
};
