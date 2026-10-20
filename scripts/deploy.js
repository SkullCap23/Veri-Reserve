const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildTree } = require("./buildTree");

async function main() {
  console.log("==========================================");
  console.log(" Deploying ProofOfReserves Smart Contract");
  console.log("==========================================");

  // 1. Ensure Merkle tree is generated
  let treeData;
  const treePath = path.join(__dirname, "../data/tree.json");
  if (!fs.existsSync(treePath)) {
    console.log("Tree not found. Generating Merkle tree first...");
    treeData = buildTree();
  } else {
    treeData = JSON.parse(fs.readFileSync(treePath, "utf-8"));
  }

  // 2. Deploy Contract
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account (Exchange Owner): ${deployer.address}`);

  const ProofOfReserves = await hre.ethers.getContractFactory("ProofOfReserves");
  const contract = await ProofOfReserves.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`ProofOfReserves deployed to: ${contractAddress}`);

  // 3. Publish initial root (Epoch 1)
  console.log(`Publishing Epoch 1 root: ${treeData.root}...`);
  const tx = await contract.publishRoot(treeData.root, treeData.totalLiabilities);
  await tx.wait();

  const currentEpoch = await contract.epoch();
  const attestation = await contract.attestations(currentEpoch);

  console.log(`Epoch ${currentEpoch} published successfully!`);
  console.log(`Root: ${attestation.root}`);
  console.log(`Total Liabilities: ${attestation.totalLiabilities.toString()}`);
  console.log(`Timestamp: ${new Date(Number(attestation.timestamp) * 1000).toISOString()}`);

  // 4. Save deployment info for frontend and tests
  const deploymentInfo = {
    contractAddress: contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    owner: deployer.address,
    epoch: Number(currentEpoch),
    root: attestation.root,
    totalLiabilities: attestation.totalLiabilities.toString(),
    timestamp: Number(attestation.timestamp),
    deployedAt: new Date().toISOString(),
  };

  const deployPath = path.join(__dirname, "../data/deployment.json");
  fs.writeFileSync(deployPath, JSON.stringify(deploymentInfo, null, 2));

  // Also save in frontend directory
  const frontendDataDir = path.join(__dirname, "../frontend/data");
  if (!fs.existsSync(frontendDataDir)) {
    fs.mkdirSync(frontendDataDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(frontendDataDir, "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  // Also export contract ABI
  const contractArtifact = await hre.artifacts.readArtifact("ProofOfReserves");
  fs.writeFileSync(
    path.join(frontendDataDir, "ProofOfReservesABI.json"),
    JSON.stringify(contractArtifact.abi, null, 2)
  );

  console.log("Deployment info and ABI saved to frontend/data/");
  console.log("==========================================");

  return { contract, deploymentInfo };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
