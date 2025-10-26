import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  createContainer,
  deleteContainer,
  executeCommand,
  getReplEmitter,
  startRepl,
  stopRepl,
  writeToRepl,
} from "./sandbox/docker-executor";
import dbClient from "./db/index";

// Load environment variables
dotenv.config();

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// CORS middleware to allow frontend connections
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
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
    console.log(err);
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
    const containerId = await createContainer();
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

  console.log("sandboxId:", sandboxId);

  try {
    if (!sandboxId) {
      res.status(404).json({ message: "no sandbox id shared", success: false });
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
        .status(404)
        .json({ message: "invalid sandbox id shared", success: false });
      return;
    }

    await deleteContainer(sandbox?.containerId);

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
    console.log(err);
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
      res.status(404).json({
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
      res.status(404).json({
        message: "Sandbox does not exist or is not active",
        success: false,
      });
      return;
    }

    const result = await executeCommand(sandbox.containerId, command);

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
    const sandbox = await dbClient.sandbox.findFirst({
      where: {
        id: sandboxId,
        status: "active",
      },
    });

    if (!sandbox) {
      res.status(404).json({
        message: "Sandbox does not exist or is not active",
        success: false,
      });
      return;
    }

    const { sessionId } = await startRepl(sandbox.containerId);

    res.json({
      success: true,
      sessionId,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      err,
      success: false,
      message: "Failed to start REPL",
    });
  }
});

app.get("/sandbox/repl/:sessionId/stream", async (req, res) => {
  const sessionId = req.params.sessionId;

  const emitter = getReplEmitter(sessionId);

  if (!emitter) {
    res.status(404).json({
      message: "Session not found",
      success: false,
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write('data: {"type": "connected"}\n\n');

  const outputHandler = (data: string) => {
    console.log(data);
    res.write(`data: ${JSON.stringify({ type: "output", data })}\n\n`);
  };

  const endHandler = () => {
    res.write('data: {"type": "end"}\n\n');
    res.end();
  };

  emitter.on("output", outputHandler);
  emitter.on("end", endHandler);

  res.on("close", () => {
    emitter.off("output", outputHandler);
    emitter.off("end", endHandler);
  });
});

app.post("/sandbox/repl/:sessionId/input", async (req, res) => {
  const sessionId = req.params.sessionId;
  const { input } = req.body;

  try {
    if (!input) {
      res.status(400).json({
        message: "Input is required",
        success: false,
      });
      return;
    }

    writeToRepl(sessionId, input);

    res.json({
      success: true,
      message: "Input sent successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      err,
      success: false,
      message: "Failed to send input",
    });
  }
});

app.delete("/sandbox/repl/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;

  try {
    stopRepl(sessionId);
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
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
