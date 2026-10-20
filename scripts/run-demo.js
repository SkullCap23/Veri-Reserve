const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { buildTree } = require("./buildTree");
const { main: deployContract } = require("./deploy");

async function startDemo() {
  console.log("**************************************************");
  console.log("   PROOF-OF-RESERVES VERIFIER: LIVE DEMO RUNNER   ");
  console.log("**************************************************\n");

  // Step 1 & 2: Snapshot & Build Merkle Tree
  console.log("[Step 1 & 2] Building Merkle Tree from customer snapshot...");
  buildTree();

  // Step 3: Deploy contract and publish root
  console.log("\n[Step 3] Deploying smart contract and publishing on-chain commitment...");
  try {
    await deployContract();
  } catch (err) {
    console.warn("Deploy script encountered an error (local node might not be running). Frontend will use local EVM cryptography fallback:", err.message);
  }

  // Start HTTP Server
  console.log("\n[Demo UI] Launching web server...");
  const { startServer } = require("./serve");
  startServer(8081);

  const url = "http://localhost:8081";
  console.log(`\nOpening demo interface at ${url}...`);

  // Open in browser on Windows
  const openCmd = process.platform === "win32" ? `start ${url}` : `open ${url}`;
  exec(openCmd, (err) => {
    if (err) console.log(`Note: You can open ${url} manually in your browser.`);
  });
}

startDemo();
