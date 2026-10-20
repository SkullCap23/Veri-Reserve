/**
 * Veri-Reserve | Cryptographic Proof-of-Reserves Audit Suite
 * Consensus-Anchored Cryptographic Inclusion & Solvency Protocol
 * Implements Refinements R1, R2, R3, R4, R5 (Option A), R6, and A3.
 */

let treeData = null;
let epoch2Data = null;
let deploymentInfo = null;
let contractABI = null;
let rpcProvider = null;
let contractInstance = null;
let isNodeConnected = false;

let currentStep = 5;
let currentProof = [];
let currentLeaf = "";
let baseBalance = 250000;
let baseUserId = 1042;
let isTampered = false;
let activeTamperMode = "drift"; // 'drift' | 'wrong-id' | 'corrupt-proof' | 'omitted-user'

// Initialize application on DOM load
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

  // A3: Tamper mode pill buttons
  document.querySelectorAll(".tamper-mode-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tamper-mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTamperMode = btn.getAttribute("data-mode");
      applyActiveTamperMode();
    });
  });
}

// Load JSON cryptographic artifacts
async function loadDataFiles() {
  try {
    const treeRes = await fetch("data/tree.json");
    treeData = await treeRes.json();

    try {
      const e2Res = await fetch("data/tree-epoch2.json");
      epoch2Data = await e2Res.json();
    } catch (e) {
      console.warn("Epoch 2 tree artifact not available yet");
    }

    const deployRes = await fetch("data/deployment.json");
    deploymentInfo = await deployRes.json();

    try {
      const abiRes = await fetch("data/ProofOfReservesABI.json");
      contractABI = await abiRes.json();
    } catch (e) {
      console.warn("Contract ABI not found in frontend/data");
    }

    populateStaticCustomerData();
  } catch (error) {
    console.error("Failed to load cryptographic artifacts:", error);
  }
}

// Populate customer selector & cross-check card
function populateStaticCustomerData() {
  if (!treeData) return;

  const select = document.getElementById("customer-select");
  select.innerHTML = "";
  treeData.customers.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.userId;
    const isAlice = c.userId === 1042;
    opt.textContent = `#${c.userId} · ${c.name} — ${Number(c.balance).toLocaleString()} mock USDC${isAlice ? " [Benchmark]" : ""}`;
    if (isAlice) opt.selected = true;
    select.appendChild(opt);
  });

  document.getElementById("customer-count-badge").textContent = `${treeData.customers.length} Snapshot Records`;

  // R5 Option A: Admin Cross-Check initial values
  const leafSum = treeData.customers.reduce((acc, c) => acc + BigInt(c.balance), 0n);
  document.getElementById("leaf-sum-val").textContent = Number(leafSum).toLocaleString() + " mock USDC";
}

// R1 & R6: Connect to Hardhat EVM Node with Bytecode Verification
async function setupBlockchainConnection() {
  const statusDot = document.getElementById("network-status-dot");
  const networkName = document.getElementById("network-name");

  try {
    if (typeof window.ethers !== "undefined") {
      rpcProvider = new window.ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const network = await rpcProvider.getNetwork();

      if (deploymentInfo?.contractAddress) {
        // R1: Verify contract code exists at deployment address
        const code = await rpcProvider.getCode(deploymentInfo.contractAddress);
        if (!code || code === "0x") {
          isNodeConnected = false;
          statusDot.className = "indicator-dot error";
          networkName.textContent = "Node Reachable, but Contract NOT Deployed";
          console.warn("Node answered, but no contract code found at", deploymentInfo.contractAddress);
          return;
        }

        // Contract is confirmed deployed!
        contractInstance = new window.ethers.Contract(
          deploymentInfo.contractAddress,
          contractABI || ["function verify(bytes32[],uint256,uint256) view returns (bool)", "function getLatestAttestation() view returns (bytes32,uint256,uint256,uint256)", "function publishRoot(bytes32,uint256)", "function verifyForEpoch(uint256,bytes32[],uint256,uint256) view returns (bool)"],
          rpcProvider
        );

        isNodeConnected = true;
        statusDot.className = "indicator-dot";
        networkName.textContent = `Local Hardhat Dev Chain (Chain ID: ${network.chainId} · Simulated Consensus)`;
        document.getElementById("contract-address").textContent = deploymentInfo.contractAddress;

        // R2: Read commitment panel values directly from the contract!
        await syncOnChainState();
      }
    }
  } catch (err) {
    isNodeConnected = false;
    statusDot.className = "indicator-dot simulated";
    networkName.textContent = "Local Hardhat Node Offline (Simulated Fallback Active)";
    document.getElementById("onchain-root").textContent = treeData?.root || "Not connected";
    document.getElementById("onchain-total").textContent = treeData ? Number(treeData.totalLiabilities).toLocaleString() + " mock USDC" : "Not connected";
    document.getElementById("onchain-timestamp").textContent = "Offline (Local Fallback)";
  }
}

// R2: Read On-Chain Commitment Record Directly from ProofOfReserves.sol
async function syncOnChainState() {
  if (!isNodeConnected || !contractInstance) return;

  try {
    const [onRoot, onTotal, onTimestamp, onEpoch] = await contractInstance.getLatestAttestation();

    // Populate on-chain commitment panel
    document.getElementById("onchain-root").textContent = onRoot;
    document.getElementById("epoch-num").textContent = onEpoch.toString();
    document.getElementById("onchain-total").textContent = Number(onTotal).toLocaleString() + " mock USDC";
    
    const date = new Date(Number(onTimestamp) * 1000);
    document.getElementById("onchain-timestamp").textContent = `${date.toLocaleTimeString()} (${date.toISOString().split("T")[0]})`;

    // R2: Root match indicator
    const matchBadge = document.getElementById("root-match-badge");
    if (onRoot.toLowerCase() === treeData.root.toLowerCase()) {
      matchBadge.textContent = "Matches tree.json: ✅";
      matchBadge.style.color = "#34d399";
    } else {
      matchBadge.textContent = "Epoch 2 Active (New Root): ℹ️";
      matchBadge.style.color = "#38bdf8";
    }

    // R5 Option A: Cross-check declared vs sum
    document.getElementById("declared-sum-val").textContent = Number(onTotal).toLocaleString() + " mock USDC";
    const crossBadge = document.getElementById("crosscheck-badge");
    const leafSum = treeData.customers.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    if (BigInt(onTotal) === leafSum) {
      crossBadge.textContent = "Sum matches declared total: ✅";
      crossBadge.style.color = "#34d399";
    } else {
      crossBadge.textContent = "Declared total differs from baseline: ℹ️";
      crossBadge.style.color = "#fbbf24";
    }

    // Solvency panel uses on-chain total
    document.getElementById("solvency-liabilities").textContent = Number(onTotal).toLocaleString();
    updateSolvencyDisplay();
  } catch (err) {
    console.error("Failed to query getLatestAttestation() from contract:", err);
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
  baseUserId = Number(demo.userId);

  // Reset tamper toggle
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
  baseUserId = Number(cust.userId);

  document.getElementById("tamper-toggle").checked = false;
  isTampered = false;
  updateTamperUI();
  hideResultBanners();
  handleGetProof();
}

// A3: Multi-Mode Tamper Toggle & Application
function handleTamperToggle(e) {
  isTampered = e.target.checked;
  applyActiveTamperMode();
}

function applyActiveTamperMode() {
  const balanceInput = document.getElementById("balance-input");
  const userInput = document.getElementById("user-id-input");
  const titleText = document.getElementById("tamper-title-text");
  const desc = document.getElementById("tamper-status-desc");

  if (!isTampered) {
    balanceInput.value = baseBalance;
    userInput.value = baseUserId;
    handleGetProof();
    updateTamperUI();
    hideResultBanners();
    return;
  }

  // Handle active tamper mode
  if (activeTamperMode === "drift") {
    titleText.textContent = "INJECT BALANCE DRIFT (+1 UNIT)";
    balanceInput.value = baseBalance + 1;
    userInput.value = baseUserId;
    desc.innerHTML = `<span style="color: var(--status-danger); font-weight: 700;">+1 UNIT DRIFT ACTIVE:</span> Balance mutated from ${baseBalance.toLocaleString()} to ${(baseBalance + 1).toLocaleString()} mock USDC.`;
  } else if (activeTamperMode === "wrong-id") {
    titleText.textContent = "IMPERSONATE USER (WRONG USER ID)";
    balanceInput.value = baseBalance;
    userInput.value = 9999;
    desc.innerHTML = `<span style="color: var(--status-danger); font-weight: 700;">WRONG USER ID ACTIVE:</span> Impostor ID 9999 claiming Alice's balance & proof.`;
  } else if (activeTamperMode === "corrupt-proof") {
    titleText.textContent = "CORRUPT SIBLING HASH ELEMENT";
    balanceInput.value = baseBalance;
    userInput.value = baseUserId;
    if (currentProof.length > 0) {
      currentProof[0] = "0x" + "f".repeat(64);
    }
    desc.innerHTML = `<span style="color: var(--status-danger); font-weight: 700;">CORRUPTED PROOF ELEMENT:</span> First sibling hash replaced with invalid 0xffff...`;
  } else if (activeTamperMode === "omitted-user") {
    titleText.textContent = "OMITTED USER (NOT IN TREE)";
    balanceInput.value = 50000;
    userInput.value = 7777;
    desc.innerHTML = `<span style="color: var(--status-danger); font-weight: 700;">OMITTED USER ACTIVE:</span> Account #7777 never included in exchange snapshot.`;
  }

  updateTamperUI();
  hideResultBanners();
  handleVerifyOnChain();
}

function updateTamperUI() {
  const container = document.getElementById("tamper-container");
  if (isTampered) {
    container.classList.add("active");
  } else {
    container.classList.remove("active");
    document.getElementById("tamper-status-desc").textContent =
      "Forensic evaluation: Demonstrates collision resistance & avalanche effect (Slide 6).";
  }
}

// Step 4: Extract Sibling Proof
function handleGetProof() {
  selectStep(4);
  const userId = Number(document.getElementById("user-id-input").value);
  const cust = treeData?.customers.find((c) => c.userId === userId);

  if (cust) {
    currentProof = [...cust.proof];
    currentLeaf = cust.leaf;
  } else {
    currentProof = treeData?.demoUser?.proof ? [...treeData.demoUser.proof] : [];
  }

  renderProofList(currentProof);
  renderTreeVisualization();
}

// R4: Render Dynamic Proof Length
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

// R1: Execute Verification with Explicit Path Attribution (Contract vs Local Fallback)
async function handleVerifyOnChain() {
  selectStep(5);
  const userId = BigInt(document.getElementById("user-id-input").value);
  const balance = BigInt(document.getElementById("balance-input").value);

  if (!currentProof || currentProof.length === 0) {
    handleGetProof();
  }

  let isValid = false;
  let executionPath = "local"; // 'contract' | 'local'
  let contractErrorMsg = null;

  // 1. Try real on-chain call via Hardhat RPC if contract instance is active
  if (isNodeConnected && contractInstance) {
    try {
      isValid = await contractInstance.verify(currentProof, userId, balance);
      executionPath = "contract";
    } catch (e) {
      console.error("On-chain verify() call encountered an error:", e);
      contractErrorMsg = e.message;
      // Do NOT silently recompute as on-chain! Fallback is explicitly marked as local:
      isValid = verifyProofLocally(currentProof, userId, balance, treeData.root);
      executionPath = "local-error";
    }
  } else {
    // 2. Local fallback
    isValid = verifyProofLocally(currentProof, userId, balance, treeData.root);
    executionPath = "local";
  }

  showVerificationResult(isValid, userId, balance, executionPath, contractErrorMsg);
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

// R1 & R4: Show Result Banners with Explicit Path Pill
function showVerificationResult(isValid, userId, balance, via, errorMsg) {
  const successBanner = document.getElementById("result-success");
  const failureBanner = document.getElementById("result-failure");
  const pathPill = document.getElementById("verdict-path");
  const rejectPathPill = document.getElementById("verdict-reject-path");
  const proofLenSpan = document.getElementById("verdict-proof-len");

  if (proofLenSpan) proofLenSpan.textContent = currentProof.length;

  let pathText = "";
  let pillClass = "verdict-pill ";

  if (via === "contract") {
    pathText = `Verified by ProofOfReserves.verify() via eth_call @ ${deploymentInfo?.contractAddress?.slice(0, 8)}... (0 Gas view call)`;
    pillClass += "onchain-call";
  } else if (via === "local") {
    pathText = "Local JS Recomputation (EVM Node Offline - NOT on-chain)";
    pillClass += "local-call";
  } else {
    pathText = `Contract Call Error: ${errorMsg?.slice(0, 35)}... (Local JS Evaluated)`;
    pillClass += "local-call";
  }

  if (isValid) {
    successBanner.style.display = "block";
    failureBanner.style.display = "none";
    document.getElementById("verified-leaf-code").textContent = `keccak256(keccak256(abi.encode(${userId}, ${balance})))`;
    pathPill.textContent = pathText;
    pathPill.className = pillClass;
  } else {
    successBanner.style.display = "none";
    failureBanner.style.display = "block";
    
    // Dynamic failure explanation based on tamper mode
    const failExp = document.getElementById("failure-explanation");
    if (activeTamperMode === "wrong-id") {
      failExp.innerHTML = `<strong>Impersonation Detected:</strong> User ID ${userId} does not match the leaf pre-image bound to this Merkle proof. Recomputed root diverges.`;
    } else if (activeTamperMode === "corrupt-proof") {
      failExp.innerHTML = `<strong>Proof Tampering Detected:</strong> Altered sibling hash 0xffff... failed to reconstruct the on-chain root. Path invalid.`;
    } else if (activeTamperMode === "omitted-user") {
      failExp.innerHTML = `<strong>Omitted User Detected:</strong> Account #${userId} was never included in the snapshot. No valid proof exists for this leaf.`;
    } else {
      failExp.innerHTML = `<strong>Avalanche Effect Triggered:</strong> A 1-unit modification completely mutated the leaf hash. Reconstructed root diverges from canonical on-chain commitment.`;
    }

    rejectPathPill.textContent = via === "contract"
      ? `Evaluated by ProofOfReserves.verify() via eth_call (Returned false)`
      : `Evaluated by Local JS Fallback (Returned false)`;
  }
}

function hideResultBanners() {
  document.getElementById("result-success").style.display = "none";
  document.getElementById("result-failure").style.display = "none";
}

// Render SVG Tree Path
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

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
    </pattern>
  `;
  svg.appendChild(defs);

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
    subtitle: `${Number(document.getElementById("balance-input").value).toLocaleString()} mock USDC`,
    color: isFail ? "var(--status-danger)" : "var(--brand-cyan-light)",
  });

  // Intermediate levels (1 to levels-1)
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

  // Root Node
  const onRoot = document.getElementById("onchain-root").textContent;
  const rootNode = {
    level: levels,
    x: width / 2,
    y: endY,
    type: "root",
    title: "CANONICAL MERKLE ROOT",
    subtitle: (onRoot && onRoot.startsWith("0x")) ? onRoot.slice(0, 16) + "..." : treeData.root.slice(0, 16) + "...",
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
  document.getElementById("reserves-slider-val").textContent = reserves.toLocaleString() + " mock USDC";
  updateSolvencyDisplay(reserves);
}

function updateSolvencyDisplay(customReserves = null) {
  const onTotalElem = document.getElementById("solvency-liabilities");
  const liabilities = onTotalElem ? Number(onTotalElem.textContent.replace(/,/g, "")) || 5651450 : 5651450;
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
    if (i === stepNum) item.classList.add("active");
    else item.classList.remove("active");
  }
}

// R3: Real On-Chain Epoch 2 Publication & Live Verification Triad
async function handlePublishEpoch2() {
  const btn = document.getElementById("publish-epoch2-btn");
  const metaBox = document.getElementById("epoch2-tx-meta");

  if (!isNodeConnected || !contractInstance) {
    alert("Hardhat local node is offline. Start the node via 'npm run demo' to execute live transactions.");
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "Broadcasting publishRoot() Transaction...";

    // Load epoch 2 tree data
    if (!epoch2Data) {
      const e2Res = await fetch("data/tree-epoch2.json");
      epoch2Data = await e2Res.json();
    }

    // Hardhat Account #0 is the contract deployer/owner
    const signer = await rpcProvider.getSigner(0);
    const tx = await contractInstance.connect(signer).publishRoot(
      epoch2Data.root,
      BigInt(epoch2Data.totalLiabilities)
    );
    
    metaBox.style.display = "block";
    metaBox.innerHTML = `Transaction Sent: <span style="color: var(--brand-cyan-light);">${tx.hash.slice(0, 20)}...</span> (Waiting for block confirmation...)`;

    const receipt = await tx.wait();

    // Query on-chain state directly
    await syncOnChainState();

    // R3: Run the 3 live verifications for Alice to demonstrate history preservation!
    const aliceId = 1042n;
    const epoch1Proof = treeData.demoUser.proof;
    const epoch2Proof = epoch2Data.demoUser.proof;

    // 1. Historical Epoch 1 proof via verifyForEpoch(1, ...)
    const isE1Preserved = await contractInstance.verifyForEpoch(1n, epoch1Proof, aliceId, 250000n);
    // 2. Stale Epoch 1 proof against latest epoch (Epoch 2)
    const isE1StaleRejected = await contractInstance.verify(epoch1Proof, aliceId, 250000n);
    // 3. New Epoch 2 proof via verify(...)
    const isE2Valid = await contractInstance.verify(epoch2Proof, aliceId, 300000n);

    metaBox.innerHTML = `
      <div style="color: #34d399; font-weight: 700; margin-bottom: 4px;">✓ Epoch 2 Confirmed in Block #${receipt.blockNumber} (Tx: ${tx.hash.slice(0, 18)}...)</div>
      <div><strong>Alice Historical Attestation Proofs:</strong></div>
      <div>• verifyForEpoch(1, 250k): ${isE1Preserved ? "✅ VALID (Historical Epoch 1 Intact)" : "❌ FAILED"}</div>
      <div>• verify(latest, 250k): ${!isE1StaleRejected ? "✅ REJECTED (Stale proof against Epoch 2)" : "❌ ERROR"}</div>
      <div>• verify(latest, 300k): ${isE2Valid ? "✅ VALID (Alice +50k Verified under Epoch 2)" : "❌ FAILED"}</div>
    `;

    btn.textContent = "✓ Epoch 2 Active (History Preserved On-Chain)";
    btn.style.color = "var(--status-success)";
    btn.style.borderColor = "var(--status-success)";
    selectStep(3);
  } catch (err) {
    console.error("Epoch 2 publication failed:", err);
    btn.disabled = false;
    btn.textContent = "Publish Epoch 2 Attestation (Retry)";
    metaBox.style.display = "block";
    metaBox.innerHTML = `<span style="color: var(--status-danger);">Transaction Failed: ${err.message}</span>`;
  }
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
