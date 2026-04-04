import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { ClaudeAdapter } from "./ClaudeAdapter";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    writes: string[];
    write(chunk: string): void;
    end(): void;
    ended: boolean;
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

test("ClaudeAdapter isAvailable returns true when claude cli is accessible", async () => {
  const child = createFakeChild();
  const adapter = new ClaudeAdapter(() => child);

  const availablePromise = adapter.isAvailable();
  child.emit("close", 0);

  const isAvailable = await availablePromise;
  assert.equal(isAvailable, true);
});

test("ClaudeAdapter isAvailable returns false when spawn errors", async () => {
  const child = createFakeChild();
  const adapter = new ClaudeAdapter(() => child);

  const availablePromise = adapter.isAvailable();
  child.emit("error", new Error("missing cli"));

  const isAvailable = await availablePromise;
  assert.equal(isAvailable, false);
});

test("generate sends prompt via stdin and returns populated response on success", async () => {
  let receivedCwd: string | undefined;
  const child = createFakeChild();

  const adapter = new ClaudeAdapter((_, __, options) => {
    receivedCwd = options.cwd as string | undefined;
    return child;
  });

  const responsePromise = adapter.generate({
    prompt: "Explain retries",
    workingDirectory: "C:/repo",
    timeoutMs: 120000,
  });

  child.stdout.emit("data", "result");
  child.stderr.emit("data", "warn");
  child.emit("close", 0);

  const response = await responsePromise;

  assert.equal(receivedCwd, "C:/repo");
  assert.deepEqual(child.stdin.writes, ["Explain retries"]);
  assert.equal(child.stdin.ended, true);
  assert.equal(response.provider, "claude");
  assert.equal(response.stdout, "result");
  assert.equal(response.stderr, "warn");
  assert.equal(response.exitCode, 0);
  assert.equal(response.timedOut, false);
});

test("generate returns failure response on process error", async () => {
  const child = createFakeChild();
  const adapter = new ClaudeAdapter(() => child);

  const responsePromise = adapter.generate({
    prompt: "test",
    timeoutMs: 120000,
  });

  child.stderr.emit("data", "spawn failed: ");
  child.emit("error", new Error("not found"));

  const response = await responsePromise;
  assert.equal(response.exitCode, 1);
  assert.match(response.stderr, /spawn failed: not found/);
});
