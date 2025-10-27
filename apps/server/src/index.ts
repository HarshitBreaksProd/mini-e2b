import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as dockerExecutor from "./sandbox/docker-executor";
import * as firecrackerExecutor from "./sandbox/firecracker-executor";
import dbClient from "./db/index";

// Load environment variables
dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Basic CORS for regular API calls (not SSE)
app.use(
  cors({
    origin: "*", // Allow all origins for proof of concept
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

//get all sandboxes
app.get("/sandbox", async (req, res) => {
  try {
    const sandboxes = await dbClient.sandbox.findMany({
      where: {
        status: "active",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      sandboxes,
    });
  } catch (err) {
    console.error("[SERVER GET] ERROR:", err);
    res.status(400).json({
      err,
      success: false,
      message: "Failed to fetch sandboxes",
    });
  }
});

//create sandbox
app.post("/sandbox", async (req, res) => {
  try {
    let containerId: string;
    if (nodeEnv === "development") {
      containerId = await dockerExecutor.createContainer();
    } else {
      // set firecracker here
      containerId = await firecrackerExecutor.createContainer();
    }
    const sandbox = await dbClient.sandbox.create({
      data: { containerId, status: "active" },
    });
    console.log(sandbox);
    res.json({
      message: "Created new container",
      success: true,
      sandboxId: sandbox.id,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      err,
      success: false,
      message: "Faced error in server",
    });
  }
});

//delete sandbox
app.delete("/sandbox", async (req, res) => {
  const sandboxId = req.query.id?.toString();

  try {
    if (!sandboxId) {
      res.status(401).json({ message: "no sandbox id shared", success: false });
      return;
    }

    const sandbox = await dbClient.sandbox.findFirst({
      where: {
        id: sandboxId,
        status: "active",
      },
    });

    if (!sandbox) {
      res
        .status(401)
        .json({ message: "invalid sandbox id shared", success: false });
      return;
    }

    if (nodeEnv === "development") {
      await dockerExecutor.deleteContainer(sandbox?.containerId);
    } else {
      await firecrackerExecutor.deleteContainer(sandbox?.containerId);
    }

    await dbClient.sandbox.update({
      where: {
        id: sandboxId,
      },
      data: {
        status: "deleted",
      },
    });

    res.json({
      message: "Deleted the sandbox successfully",
      success: true,
    });
  } catch (err) {
    console.error("[SERVER DELETE] ERROR:", err);
    res.status(400).json({
      err,
      success: false,
      message: "Faced error in server",
    });
  }
});

//interact sandbox
app.post("/sandbox/:id/exec", async (req, res) => {
  const sandboxId = req.params.id;
  const { command } = req.body;

  try {
    if (!command) {
      res.status(401).json({
        message: "command is required",
        success: false,
      });
    }

    const sandbox = await dbClient.sandbox.findFirst({
      where: {
        id: sandboxId,
        status: "active",
      },
    });

    if (!sandbox) {
      res.status(401).json({
        message: "Sandbox does not exist or is not active",
        success: false,
      });
      return;
    }

    let result;
    if (nodeEnv === "development") {
      result = await dockerExecutor.executeCommand(sandbox.containerId, command);
    } else {
      result = await firecrackerExecutor.executeCommand(sandbox.containerId, command);
    }

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      err,
      success: false,
      message: "Faced error in server",
    });
  }
});

// live interation with sandbox with sse
app.post("/sandbox/:id/repl/start", async (req, res) => {
  const sandboxId = req.params.id;

  try {
    if (nodeEnv === "development") {
      const sandbox = await dbClient.sandbox.findFirst({
        where: {
          id: sandboxId,
          status: "active",
        },
      });

      console.log(
        `[REPL START] Sandbox lookup result:`,
        sandbox
          ? {
              id: sandbox.id,
              containerId: sandbox.containerId,
              status: sandbox.status,
              createdAt: sandbox.createdAt,
            }
          : "null"
      );

      if (!sandbox) {
        console.log(`[REPL START] ERROR: Sandbox not found or not active`);
        res.status(401).json({
          message: "Sandbox does not exist or is not active",
          success: false,
        });
        return;
      }

      console.log(
        `[REPL START] Starting REPL for container: ${sandbox.containerId}`
      );
      const { sessionId } = await dockerExecutor.startRepl(sandbox.containerId);
      console.log(
        `[REPL START] REPL started successfully with sessionId: ${sessionId}`
      );

      res.json({
        success: true,
        sessionId,
      });
    } else {
      // start repl on firecracker here
    }
  } catch (err) {
    console.error(`[REPL START] ERROR:`, err);
    res.status(400).json({
      err: err instanceof Error ? err.message : err,
      success: false,
      message: "Failed to start REPL",
    });
  }
});

// Handle OPTIONS preflight for SSE endpoint
app.options("/sandbox/repl/:sessionId/stream", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(200).end();
});

app.get("/sandbox/repl/:sessionId/stream", async (req, res) => {
  if (nodeEnv === "development") {
    const sessionId = req.params.sessionId;
    console.log(
      `[REPL STREAM] Received SSE request for sessionId: ${sessionId}`
    );

    const emitter = dockerExecutor.getReplEmitter(sessionId);
    console.log(
      `[REPL STREAM] Emitter lookup result:`,
      emitter ? "found" : "not found"
    );

    if (!emitter) {
      console.log(
        `[REPL STREAM] ERROR: Session not found for sessionId: ${sessionId}`
      );
      res.status(401).json({
        message: "Session not found",
        success: false,
      });
      return;
    }

    console.log(
      `[REPL STREAM] Setting up SSE headers and connection for sessionId: ${sessionId}`
    );

    // Set basic CORS headers for SSE
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    res.write('data: {"type": "connected"}\n\n');
    console.log(
      `[REPL STREAM] Sent initial connection message for sessionId: ${sessionId}`
    );

    const outputHandler = (data: string) => {
      console.log(
        `[REPL STREAM] Output received for sessionId ${sessionId}:`,
        data
      );
      res.write(`data: ${JSON.stringify({ type: "output", data })}\n\n`);
    };

    const endHandler = () => {
      console.log(
        `[REPL STREAM] End event received for sessionId: ${sessionId}`
      );
      res.write('data: {"type": "end"}\n\n');
      res.end();
    };

    emitter.on("output", outputHandler);
    emitter.on("end", endHandler);
    console.log(
      `[REPL STREAM] Event listeners attached for sessionId: ${sessionId}`
    );

    res.on("close", () => {
      console.log(
        `[REPL STREAM] Connection closed for sessionId: ${sessionId}`
      );
      emitter.off("output", outputHandler);
      emitter.off("end", endHandler);
    });

    res.on("error", (error) => {
      console.error(
        `[REPL STREAM] Connection error for sessionId ${sessionId}:`,
        error
      );
      emitter.off("output", outputHandler);
      emitter.off("end", endHandler);
    });

    // Handle client disconnect
    req.on("close", () => {
      console.log(
        `[REPL STREAM] Client disconnected for sessionId: ${sessionId}`
      );
      emitter.off("output", outputHandler);
      emitter.off("end", endHandler);
    });
  } else {
    // stream repl on firecracker here
  }
});

app.post("/sandbox/repl/:sessionId/input", async (req, res) => {
  if (nodeEnv === "development") {
    const sessionId = req.params.sessionId;
    const { input } = req.body;
    console.log(
      `[REPL INPUT] Received input for sessionId: ${sessionId}, input: "${input}"`
    );

    try {
      if (!input) {
        console.log(
          `[REPL INPUT] ERROR: No input provided for sessionId: ${sessionId}`
        );
        res.status(400).json({
          message: "Input is required",
          success: false,
        });
        return;
      }

      console.log(
        `[REPL INPUT] Writing input to REPL for sessionId: ${sessionId}`
      );
      dockerExecutor.writeToRepl(sessionId, input);
      console.log(
        `[REPL INPUT] Input written successfully for sessionId: ${sessionId}`
      );

      res.json({
        success: true,
        message: "Input sent successfully",
      });
    } catch (err) {
      console.error(`[REPL INPUT] ERROR for sessionId ${sessionId}:`, err);
      res.status(400).json({
        err: err instanceof Error ? err.message : err,
        success: false,
        message: "Failed to send input",
      });
    }
  } else {
    // send input to firecracker here
  }
});

app.delete("/sandbox/repl/:sessionId", async (req, res) => {
  if (nodeEnv === "development") {
    const sessionId = req.params.sessionId;

    try {
      dockerExecutor.stopRepl(sessionId);
      res.json({
        success: true,
        message: "REPL stopped successfully",
      });
    } catch (err) {
      console.log(err);
      res.status(400).json({
        err,
        success: false,
        message: "Failed to stop REPL",
      });
    }
  } else {
    // stop repl on firecracker here
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
