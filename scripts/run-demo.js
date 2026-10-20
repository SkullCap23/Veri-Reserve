const { spawn, exec, execSync } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { buildTree } = require("./buildTree");
const { startServer } = require("./serve");

let hardhatNodeProcess = null;

function cleanup() {
  if (hardhatNodeProcess && hardhatNodeProcess.pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${hardhatNodeProcess.pid} /T /F`, { stdio: "ignore" });
      } else {
        hardhatNodeProcess.kill("SIGTERM");
      }
    } catch (e) {}
  }
}

process.on("SIGINT", () => {
  console.log("\nTerminating demo processes...");
  cleanup();
  process.exit(0);
});

process.on("exit", () => {
  cleanup();
});

// Poll eth_chainId on http://127.0.0.1:8545
function pollRpcNode(maxAttempts = 40, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.request(
        "http://127.0.0.1:8545",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeout: 1000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (data && data.result) {
                return resolve(data.result);
              }
            } catch (e) {}
            scheduleNext();
          });
        }
      );

      req.on("error", () => {
        scheduleNext();
      });

      req.on("timeout", () => {
        req.destroy();
        scheduleNext();
      });

      req.write(JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }));
      req.end();
    };

    const scheduleNext = () => {
      if (attempts >= maxAttempts) {
        return reject(
          new Error("Hardhat node failed to respond on http://127.0.0.1:8545 within 20s.")
        );
      }
      setTimeout(check, intervalMs);
    };

    check();
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true, stdio: "inherit", ...options });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${command} ${args.join(" ")}" exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function startDemo() {
  console.log("**************************************************");
  console.log("   VERI-RESERVE AUDIT SUITE: LIVE DEMO RUNNER     ");
  console.log("**************************************************\n");

  // Step 1 & 2: Build Merkle Trees
  console.log("[Step 1 & 2] Building Merkle Trees for Epoch 1 & Epoch 2...");
  buildTree();

  // Step 3: Check if Hardhat node is already running, or spawn it
  console.log("\n[Chain] Checking for active Hardhat node on http://127.0.0.1:8545...");
  let alreadyRunning = false;
  try {
    await pollRpcNode(3, 300);
    console.log("[Chain] Existing Hardhat node detected on 127.0.0.1:8545.");
    alreadyRunning = true;
  } catch (e) {
    console.log("[Chain] Starting local Hardhat EVM node (npx hardhat node)...");
    hardhatNodeProcess = spawn("npx", ["hardhat", "node"], {
      shell: true,
      stdio: "pipe",
    });

    hardhatNodeProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      if (!msg.includes("ExperimentalWarning")) {
        process.stderr.write(`[Hardhat Node] ${msg}`);
      }
    });

    console.log("[Chain] Waiting for JSON-RPC provider on 127.0.0.1:8545...");
    await pollRpcNode(40, 500);
    console.log("[Chain] Hardhat local node is ready!");
  }

  // Step 4: Deploy Contract to Localhost Network
  console.log("\n[Contract] Deploying ProofOfReserves.sol to localhost network...");
  await runCommand("npx", ["hardhat", "run", "scripts/deploy.js", "--network", "localhost"]);

  // Step 5: Start HTTP Server
  const PORT = 8081;
  console.log(`\n[UI] Launching web server at http://localhost:${PORT}...`);
  startServer(PORT);

  const url = `http://localhost:${PORT}`;
  console.log(`\n==================================================`);
  console.log(` Demo environment ready! Opening ${url}`);
  console.log(` Press Ctrl+C to terminate node and server`);
  console.log(`==================================================\n`);

  const openCmd = process.platform === "win32" ? `start ${url}` : `open ${url}`;
  exec(openCmd, (err) => {
    if (err) console.log(`Note: Open ${url} in your browser.`);
  });
}

if (require.main === module) {
  startDemo().catch((err) => {
    console.error("\n[FATAL ERROR Starting Demo]:", err.message);
    cleanup();
    process.exit(1);
  });
}

module.exports = { startDemo };
