import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { CopilotAdapter } from "./CopilotAdapter";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    writes: string[];
    ended: boolean;
    write(chunk: string): void;
    end(): void;
  };
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    writes: [],
    ended: false,
    write(chunk: string): void {
      this.writes.push(chunk);
    },
    end(): void {
      this.ended = true;
    },
  };
  return child;
}

test("CopilotAdapter isAvailable returns true when standalone copilot is accessible", async () => {
  const adapter = new CopilotAdapter((command, args) => {
    assert.equal(command, "copilot");
    assert.deepEqual(args, ["--help"]);

    const child = createFakeChild();
    setImmediate(() => child.emit("close", 0));
    return child;
  });

  assert.equal(await adapter.isAvailable(), true);
});

test("CopilotAdapter isAvailable falls back to gh wrapper when standalone command is missing", async () => {
  let call = 0;
  const adapter = new CopilotAdapter((command, args) => {
    call += 1;
    const child = createFakeChild();

    if (call === 1) {
      assert.equal(command, "copilot");
      assert.deepEqual(args, ["--help"]);
      setImmediate(() => child.emit("error", new Error("missing copilot")));
      return child;
    }

    assert.equal(command, "gh");
    assert.deepEqual(args, ["copilot", "--", "--help"]);
    setImmediate(() => child.emit("close", 0));
    return child;
  });

  assert.equal(await adapter.isAvailable(), true);
});

test("CopilotAdapter isAvailable returns false when both standalone and gh wrapper are unavailable", async () => {
  let call = 0;
  const adapter = new CopilotAdapter(() => {
    call += 1;
    const child = createFakeChild();
    setImmediate(() => child.emit("error", new Error(call === 1 ? "missing copilot" : "missing gh")));
    return child;
  });

  assert.equal(await adapter.isAvailable(), false);
});

test("generate uses standalone copilot CLI with prompt flag and returns populated response on success", async () => {
  let receivedCommand = "";
  let receivedArgs: readonly string[] = [];
  let receivedCwd: string | undefined;

  const adapter = new CopilotAdapter((command, args, options) => {
    receivedCommand = command;
    receivedArgs = args;
    receivedCwd = options.cwd as string | undefined;

    const child = createFakeChild();
    setImmediate(() => {
      child.stdout.emit("data", "hello");
      child.stderr.emit("data", "warn");
      child.emit("close", 0);
    });
    return child;
  });

  const response = await adapter.generate({
    prompt: "Explain retries",
    workingDirectory: "C:/repo",
    timeoutMs: 120000,
  });

  assert.equal(receivedCommand, "copilot");
  assert.deepEqual(receivedArgs, ["--prompt", "Explain retries", "-s", "--no-ask-user"]);
  assert.equal(receivedCwd, "C:/repo");
  assert.equal(response.provider, "copilot");
  assert.equal(response.stdout, "hello");
  assert.equal(response.stderr, "warn");
  assert.equal(response.exitCode, 0);
  assert.equal(response.timedOut, false);
  assert.equal(typeof response.durationMs, "number");
});

test("generate returns failure response on process error", async () => {
  const adapter = new CopilotAdapter(() => {
    const child = createFakeChild();
    setImmediate(() => {
      child.stderr.emit("data", "spawn failed: ");
      child.emit("error", new Error("not found"));
    });
    return child;
  });

  const response = await adapter.generate({
    prompt: "test",
    timeoutMs: 120000,
  });

  assert.equal(response.exitCode, 1);
  assert.match(response.stderr, /spawn failed: not found/);
});

test("generate falls back to gh copilot wrapper when standalone command is missing", async () => {
  const calls: Array<{ command: string; args: readonly string[] }> = [];

  const adapter = new CopilotAdapter((command, args) => {
    calls.push({ command, args });
    const child = createFakeChild();

    if (command === "copilot") {
      setImmediate(() => {
        const error = Object.assign(new Error("not found"), { code: "ENOENT" });
        child.emit("error", error);
      });
      return child;
    }

    setImmediate(() => {
      child.stdout.emit("data", "ok from gh wrapper");
      child.emit("close", 0);
    });
    return child;
  });

  const response = await adapter.generate({
    prompt: "fallback test",
    timeoutMs: 120000,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, "copilot");
  assert.equal(calls[1].command, "gh");
  assert.deepEqual(calls[1].args, ["copilot", "--", "--prompt", "fallback test", "-s", "--no-ask-user"]);
  assert.equal(response.exitCode, 0);
  assert.equal(response.stdout, "ok from gh wrapper");
});
