/**
 * Veri-Reserve | Cryptographic Proof-of-Reserves Audit Suite
 * Consensus-Anchored Cryptographic Inclusion & Solvency Protocol
 */

let treeData = null;
let deploymentInfo = null;
let contractABI = null;
let rpcProvider = null;
let contractInstance = null;
let isNodeConnected = false;

let currentStep = 5;
let currentProof = [];
let currentLeaf = "";
let baseBalance = 250000;
let isTampered = false;

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await loadDataFiles();
  await setupBlockchainConnection();
  loadDemoUser();
  updateSolvencyDisplay();
});

// Configure event listeners
function setupEventListeners() {
  document.getElementById("load-demo-user-btn").addEventListener("click", loadDemoUser);
  document.getElementById("get-proof-btn").addEventListener("click", handleGetProof);
  document.getElementById("verify-btn").addEventListener("click", handleVerifyOnChain);
  document.getElementById("tamper-toggle").addEventListener("change", handleTamperToggle);
  document.getElementById("customer-select").addEventListener("change", handleCustomerSelect);
  document.getElementById("publish-epoch2-btn").addEventListener("click", handlePublishEpoch2);
  document.getElementById("reserves-slider").addEventListener("input", handleReservesSlider);
  document.getElementById("speaker-guide-btn").addEventListener("click", () => toggleModal(true));
  document.getElementById("close-modal-btn").addEventListener("click", () => toggleModal(false));
  document.getElementById("speaker-modal").addEventListener("click", (e) => {
    if (e.target.id === "speaker-modal") toggleModal(false);
  });
  document.getElementById("copy-root-btn").addEventListener("click", copyRootHash);
}

// Load JSON cryptographic artifacts
async function loadDataFiles() {
  try {
    const treeRes = await fetch("data/tree.json");
    treeData = await treeRes.json();

    const deployRes = await fetch("data/deployment.json");
    deploymentInfo = await deployRes.json();

    try {
      const abiRes = await fetch("data/ProofOfReservesABI.json");
      contractABI = await abiRes.json();
    } catch (e) {
      console.warn("Contract ABI not found in frontend/data, using minimal interface");
    }

    populateUIWithInitialData();
  } catch (error) {
    console.error("Failed to load cryptographic artifacts:", error);
  }
}

// Populate UI components with ledger state
function populateUIWithInitialData() {
  if (!treeData) return;

  // On-Chain State Record
  document.getElementById("onchain-root").textContent = treeData.root;
  document.getElementById("epoch-num").textContent = deploymentInfo?.epoch || "1";
  document.getElementById("onchain-total").textContent = Number(treeData.totalLiabilities).toLocaleString() + " USDC";
  document.getElementById("solvency-liabilities").textContent = Number(treeData.totalLiabilities).toLocaleString();
  
  if (deploymentInfo?.timestamp) {
    const date = new Date(deploymentInfo.timestamp * 1000);
    document.getElementById("onchain-timestamp").textContent = `${date.toLocaleTimeString()} (${date.toISOString().split("T")[0]})`;
  } else {
    document.getElementById("onchain-timestamp").textContent = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  }

  if (deploymentInfo?.contractAddress) {
    document.getElementById("contract-address").textContent = deploymentInfo.contractAddress;
  }

  // Populate Customer Account Selector
  const select = document.getElementById("customer-select");
  select.innerHTML = "";
  treeData.customers.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.userId;
    const isAlice = c.userId === 1042;
    opt.textContent = `#${c.userId} · ${c.name} — ${Number(c.balance).toLocaleString()} USDC${isAlice ? " [Benchmark Record]" : ""}`;
    if (isAlice) opt.selected = true;
    select.appendChild(opt);
  });

  document.getElementById("customer-count-badge").textContent = `${treeData.customers.length} Snapshot Records`;
}

// Initialize EVM RPC connection
async function setupBlockchainConnection() {
  const statusDot = document.getElementById("network-status-dot");
  const networkName = document.getElementById("network-name");

  try {
    if (typeof window.ethers !== "undefined") {
      rpcProvider = new window.ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const network = await rpcProvider.getNetwork();
      isNodeConnected = true;

      statusDot.classList.remove("simulated");
      statusDot.style.backgroundColor = "var(--status-success)";
      networkName.textContent = `Hardhat EVM (Chain ID: ${network.chainId})`;

      if (deploymentInfo?.contractAddress && contractABI) {
        contractInstance = new window.ethers.Contract(
          deploymentInfo.contractAddress,
          contractABI,
          rpcProvider
        );
      }
    }
  } catch (err) {
    isNodeConnected = false;
    statusDot.classList.add("simulated");
    networkName.textContent = "EVM Core Active (Autonomous In-Memory)";
  }
}

// Preset Benchmark User (Alice)
function loadDemoUser() {
  const demo = treeData?.customers.find((c) => c.userId === 1042) || {
    userId: 1042,
    name: "Alice_DemoUser",
    balance: 250000,
  };

  document.getElementById("customer-select").value = demo.userId;
  document.getElementById("user-id-input").value = demo.userId;
  document.getElementById("balance-input").value = demo.balance;
  baseBalance = Number(demo.balance);

  // Reset tamper switch
  const tamperCheckbox = document.getElementById("tamper-toggle");
  tamperCheckbox.checked = false;
  isTampered = false;
  updateTamperUI();

  hideResultBanners();
  handleGetProof();
}

// Account selection change
function handleCustomerSelect(e) {
  const selectedId = Number(e.target.value);
  const cust = treeData.customers.find((c) => c.userId === selectedId);
  if (!cust) return;

  document.getElementById("user-id-input").value = cust.userId;
  document.getElementById("balance-input").value = cust.balance;
  baseBalance = Number(cust.balance);

  document.getElementById("tamper-toggle").checked = false;
  isTampered = false;
  updateTamperUI();
  hideResultBanners();
  handleGetProof();
}

// Forensic Tamper Toggle
function handleTamperToggle(e) {
  isTampered = e.target.checked;
  const balanceInput = document.getElementById("balance-input");

  if (isTampered) {
    balanceInput.value = baseBalance + 1;
  } else {
    balanceInput.value = baseBalance;
  }

  updateTamperUI();
  hideResultBanners();
  handleVerifyOnChain();
}

function updateTamperUI() {
  const desc = document.getElementById("tamper-status-desc");
  const container = document.getElementById("tamper-container");

  if (isTampered) {
    desc.innerHTML = `<span style="color: var(--status-danger); font-weight: 700;">+1 UNIT DRIFT ACTIVE:</span> Balance mutated to evaluate cryptographic collision resistance.`;
    container.classList.add("active");
  } else {
    desc.textContent = "Forensic simulation: Demonstrates collision resistance & avalanche effect (Slide 6).";
    container.classList.remove("active");
  }
}

// Step 4: Extract Sibling Proof
function handleGetProof() {
  selectStep(4);
  const userId = Number(document.getElementById("user-id-input").value);
  const cust = treeData?.customers.find((c) => c.userId === userId);

  if (cust) {
    currentProof = cust.proof;
    currentLeaf = cust.leaf;
  } else {
    currentProof = treeData?.demoUser?.proof || [];
  }

  renderProofList(currentProof);
  renderTreeVisualization();
}

// Render sibling proof table
function renderProofList(proof) {
  const container = document.getElementById("proof-list");
  const countSpan = document.getElementById("proof-count");
  container.innerHTML = "";
  countSpan.textContent = proof.length;

  proof.forEach((hash, idx) => {
    const item = document.createElement("div");
    item.className = "proof-row-item";
    item.innerHTML = `
      <span style="color: #a78bfa; font-weight: 600;">L${idx} Sibling</span>
      <span style="color: var(--text-secondary); cursor: pointer;" title="${hash}">${hash.slice(0, 16)}...${hash.slice(-8)}</span>
    `;
    item.addEventListener("click", () => {
      navigator.clipboard.writeText(hash);
      item.style.backgroundColor = "rgba(56, 189, 248, 0.15)";
      setTimeout(() => (item.style.backgroundColor = "var(--bg-surface)"), 400);
    });
    container.appendChild(item);
  });
}

// Step 5: Execute On-Chain Verification
async function handleVerifyOnChain() {
  selectStep(5);
  const userId = BigInt(document.getElementById("user-id-input").value);
  const balance = BigInt(document.getElementById("balance-input").value);

  if (!currentProof || currentProof.length === 0) {
    handleGetProof();
  }

  let isValid = false;

  // On-chain smart contract call
  if (isNodeConnected && contractInstance) {
    try {
      isValid = await contractInstance.verify(currentProof, userId, balance);
    } catch (e) {
      isValid = verifyProofLocally(currentProof, userId, balance, treeData.root);
    }
  } else {
    isValid = verifyProofLocally(currentProof, userId, balance, treeData.root);
  }

  showVerificationResult(isValid, userId, balance);
  renderTreeVisualization(isValid);
}

// Local mathematical verification (OpenZeppelin standard)
function verifyProofLocally(proof, userId, balance, expectedRoot) {
  if (typeof window.ethers === "undefined") return false;

  try {
    const abiCoder = window.ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(["uint256", "uint256"], [userId, balance]);
    const firstHash = window.ethers.keccak256(encoded);
    let computedHash = window.ethers.keccak256(firstHash);

    for (let i = 0; i < proof.length; i++) {
      const proofElement = proof[i];
      if (computedHash.toLowerCase() <= proofElement.toLowerCase()) {
        computedHash = window.ethers.keccak256(
          window.ethers.concat([computedHash, proofElement])
        );
      } else {
        computedHash = window.ethers.keccak256(
          window.ethers.concat([proofElement, computedHash])
        );
      }
    }

    return computedHash.toLowerCase() === expectedRoot.toLowerCase();
  } catch (err) {
    return false;
  }
}

// Show verdict banners
function showVerificationResult(isValid, userId, balance) {
  const successBanner = document.getElementById("result-success");
  const failureBanner = document.getElementById("result-failure");

  if (isValid) {
    successBanner.style.display = "block";
    failureBanner.style.display = "none";
    document.getElementById("verified-leaf-code").textContent = `keccak256(keccak256(abi.encode(${userId}, ${balance})))`;
  } else {
    successBanner.style.display = "none";
    failureBanner.style.display = "block";
  }
}

function hideResultBanners() {
  document.getElementById("result-success").style.display = "none";
  document.getElementById("result-failure").style.display = "none";
}

// Render Canonical Merkle Tree Path in SVG
function renderTreeVisualization(isValid = null) {
  const svg = document.getElementById("tree-svg");
  if (!svg || !treeData) return;

  const width = 880;
  const height = 480;
  svg.innerHTML = "";

  const levels = currentProof.length > 0 ? currentProof.length : 6;
  const isFail = isValid === false;
  const isPass = isValid === true;

  const pathColor = isFail
    ? "var(--status-danger)"
    : isPass
    ? "var(--status-success)"
    : "var(--brand-cyan-light)";

  // SVG Defs
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
    </pattern>
  `;
  svg.appendChild(defs);

  // Background grid
  const bgGrid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgGrid.setAttribute("width", width);
  bgGrid.setAttribute("height", height);
  bgGrid.setAttribute("fill", "url(#grid)");
  svg.appendChild(bgGrid);

  const nodes = [];
  const startY = height - 55;
  const endY = 65;
  const stepY = (startY - endY) / levels;

  // Level 0: User Leaf Node
  nodes.push({
    level: 0,
    x: 230,
    y: startY,
    type: "leaf",
    title: `LEAF #0: ACCOUNT ${document.getElementById("user-id-input").value}`,
    subtitle: `${Number(document.getElementById("balance-input").value).toLocaleString()} USDC`,
    color: isFail ? "var(--status-danger)" : "var(--brand-cyan-light)",
  });

  // Intermediate levels (1 to 5)
  for (let i = 1; i < levels; i++) {
    const y = startY - i * stepY;
    const x = 230 + i * 40;
    nodes.push({
      level: i,
      x: x,
      y: y,
      type: "internal",
      title: `LEVEL ${i} NODE`,
      subtitle: `keccak256(H_L, H_R)`,
      color: "#64748b",
    });

    // Sibling Node
    const sibHash = currentProof[i - 1] || "0x000...";
    nodes.push({
      level: i,
      x: x + 160,
      y: y + 20,
      type: "sibling",
      title: `L${i} SIBLING PROOF`,
      subtitle: sibHash.slice(0, 12) + "...",
      color: "#8b5cf6",
      isSibling: true,
    });
  }

  // Level 6: Root Node
  const rootNode = {
    level: levels,
    x: width / 2,
    y: endY,
    type: "root",
    title: "CANONICAL MERKLE ROOT",
    subtitle: treeData.root.slice(0, 16) + "...",
    color: "#f59e0b",
  };
  nodes.push(rootNode);

  // Connecting Bus Lines
  for (let i = 0; i < levels; i++) {
    const fromNode = nodes.find((n) => n.level === i && !n.isSibling);
    const toNode = nodes.find((n) => n.level === i + 1 && !n.isSibling) || rootNode;

    if (fromNode && toNode) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = `M ${fromNode.x} ${fromNode.y} C ${fromNode.x} ${(fromNode.y + toNode.y) / 2}, ${toNode.x} ${(fromNode.y + toNode.y) / 2}, ${toNode.x} ${toNode.y}`;
      line.setAttribute("d", d);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", pathColor);
      line.setAttribute("stroke-width", isFail ? "2" : "2.5");
      if (isFail) line.setAttribute("stroke-dasharray", "5,4");
      svg.appendChild(line);
    }

    const sibNode = nodes.find((n) => n.level === i + 1 && n.isSibling);
    if (sibNode && toNode) {
      const sibLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = `M ${sibNode.x} ${sibNode.y} C ${sibNode.x - 20} ${sibNode.y - 10}, ${toNode.x + 30} ${toNode.y + 15}, ${toNode.x} ${toNode.y}`;
      sibLine.setAttribute("d", d);
      sibLine.setAttribute("fill", "none");
      sibLine.setAttribute("stroke", "rgba(139, 92, 246, 0.45)");
      sibLine.setAttribute("stroke-width", "1.5");
      sibLine.setAttribute("stroke-dasharray", "4,3");
      svg.appendChild(sibLine);
    }
  }

  // Draw Structural Nodes
  nodes.forEach((n) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${n.x}, ${n.y})`);

    // Clean institutional rounded node badge
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const isRoot = n.type === "root";
    const boxW = isRoot ? 170 : 130;
    const boxH = isRoot ? 40 : 34;

    rect.setAttribute("x", -boxW / 2);
    rect.setAttribute("y", -boxH / 2);
    rect.setAttribute("width", boxW);
    rect.setAttribute("height", boxH);
    rect.setAttribute("rx", "4");
    rect.setAttribute("fill", "rgba(15, 23, 42, 0.95)");
    rect.setAttribute("stroke", n.color);
    rect.setAttribute("stroke-width", isRoot ? "2" : "1.25");
    g.appendChild(rect);

    // Node Title Text
    const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    titleText.setAttribute("x", "0");
    titleText.setAttribute("y", isRoot ? "-4" : "-3");
    titleText.setAttribute("text-anchor", "middle");
    titleText.setAttribute("fill", "#ffffff");
    titleText.setAttribute("font-size", isRoot ? "10.5px" : "9px");
    titleText.setAttribute("font-weight", "700");
    titleText.setAttribute("font-family", "var(--font-mono)");
    titleText.textContent = n.title;
    g.appendChild(titleText);

    // Node Subtitle Text
    const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    subText.setAttribute("x", "0");
    subText.setAttribute("y", isRoot ? "12" : "10");
    subText.setAttribute("text-anchor", "middle");
    subText.setAttribute("fill", "var(--text-tertiary)");
    subText.setAttribute("font-size", isRoot ? "9.5px" : "8px");
    subText.setAttribute("font-family", "var(--font-mono)");
    subText.textContent = n.subtitle;
    g.appendChild(subText);

    svg.appendChild(g);
  });
}

// Solvency Slider
function handleReservesSlider(e) {
  const reserves = Number(e.target.value);
  document.getElementById("reserves-slider-val").textContent = reserves.toLocaleString() + " USDC";
  updateSolvencyDisplay(reserves);
}

// Solvency balance calculation
function updateSolvencyDisplay(customReserves = null) {
  const liabilities = treeData ? Number(treeData.totalLiabilities) : 5651450;
  const reserves = customReserves !== null ? customReserves : 6200000;

  const reservesElem = document.getElementById("solvency-reserves");
  const reservesCard = document.getElementById("reserves-card");
  const badge = document.getElementById("solvency-badge");
  const badgeText = document.getElementById("solvency-text");

  reservesElem.textContent = reserves.toLocaleString();

  const diff = reserves - liabilities;
  const ratio = ((reserves / liabilities) * 100).toFixed(1);

  if (diff >= 0) {
    reservesCard.className = "balance-card solvent";
    reservesElem.style.color = "var(--status-success)";
    badge.className = "status-chip pass";
    badgeText.textContent = `SOLVENT (${ratio}%) · +${diff.toLocaleString()} SURPLUS`;
  } else {
    reservesCard.className = "balance-card insolvent";
    reservesElem.style.color = "var(--status-danger)";
    badge.className = "status-chip fail";
    badgeText.textContent = `INSOLVENT (${ratio}%) · ${diff.toLocaleString()} DEFICIT`;
  }
}

// Pipeline Step Selection
function selectStep(stepNum) {
  currentStep = stepNum;
  for (let i = 1; i <= 5; i++) {
    const item = document.getElementById(`pipeline-step-${i}`);
    if (i === stepNum) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  }
}

// Advance Epoch (Epoch 2 Simulation)
function handlePublishEpoch2() {
  const epochElem = document.getElementById("epoch-num");
  const currentEpoch = Number(epochElem.textContent);
  const nextEpoch = currentEpoch + 1;
  epochElem.textContent = nextEpoch;

  const newRoot = "0x8fa14b99823f009e4d1b7642ce93e620401824056209bca39841804f85e1c442";
  document.getElementById("onchain-root").textContent = newRoot;
  document.getElementById("onchain-timestamp").textContent = new Date().toISOString().replace("T", " ").slice(0, 19) + ` UTC (Epoch ${nextEpoch})`;

  const btn = document.getElementById("publish-epoch2-btn");
  btn.textContent = `Epoch ${nextEpoch} Root Attestation Committed On-Chain`;
  btn.style.borderColor = "var(--status-success)";
  btn.style.color = "var(--status-success)";

  if (treeData) treeData.root = newRoot;
  renderTreeVisualization();
  selectStep(3);
}

// Modal Toggle
function toggleModal(show) {
  const modal = document.getElementById("speaker-modal");
  if (show) modal.classList.add("open");
  else modal.classList.remove("open");
}

// Copy Root
function copyRootHash() {
  const root = document.getElementById("onchain-root").textContent;
  navigator.clipboard.writeText(root);
  const btn = document.getElementById("copy-root-btn");
  btn.textContent = "Copied";
  setTimeout(() => (btn.textContent = "Copy Hash"), 1200);
}
