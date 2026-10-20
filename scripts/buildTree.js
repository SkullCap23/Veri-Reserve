const fs = require("fs");
const path = require("path");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

function generateTreeForCustomers(customerList, epochLabel = 1) {
  const values = customerList.map((c) => [BigInt(c.userId), BigInt(c.balance)]);
  const tree = StandardMerkleTree.of(values, ["uint256", "uint256"]);

  const root = tree.root;
  const totalLiabilities = customerList.reduce(
    (acc, c) => acc + BigInt(c.balance),
    0n
  );

  const enrichedCustomers = customerList.map((c, index) => {
    const proof = tree.getProof(index);
    const leaf = tree.leafHash([BigInt(c.userId), BigInt(c.balance)]);
    return {
      userId: c.userId,
      name: c.name,
      balance: c.balance,
      leaf: leaf,
      proof: proof,
      isDemoUser: c.userId === 1042,
    };
  });

  const demoCustomer = enrichedCustomers.find((c) => c.userId === 1042);

  const treeData = {
    epoch: epochLabel,
    root: root,
    totalLiabilities: totalLiabilities.toString(),
    customerCount: customerList.length,
    generatedAt: new Date().toISOString(),
    demoUser: demoCustomer,
    customers: enrichedCustomers,
    treeDump: tree.dump(),
  };

  return { treeData, root, totalLiabilities, demoCustomer };
}

function buildTree() {
  const customersPath = path.join(__dirname, "../data/customers.json");
  const customers = JSON.parse(fs.readFileSync(customersPath, "utf-8"));

  // --- 1. Build Baseline Epoch 1 Tree ---
  const { treeData: epoch1Data, root: root1, totalLiabilities: total1, demoCustomer: demo1 } =
    generateTreeForCustomers(customers, 1);

  const jsonString1 = JSON.stringify(
    epoch1Data,
    (key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );

  fs.writeFileSync(path.join(__dirname, "../data/tree.json"), jsonString1);
  const frontendDataDir = path.join(__dirname, "../frontend/data");
  if (!fs.existsSync(frontendDataDir)) {
    fs.mkdirSync(frontendDataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(frontendDataDir, "tree.json"), jsonString1);

  // --- 2. Build Epoch 2 Tree (Alice deposits +50,000, balance = 300,000) ---
  const epoch2Customers = customers.map((c) =>
    c.userId === 1042 ? { ...c, balance: c.balance + 50000 } : c
  );
  const { treeData: epoch2Data, root: root2, totalLiabilities: total2, demoCustomer: demo2 } =
    generateTreeForCustomers(epoch2Customers, 2);

  const jsonString2 = JSON.stringify(
    epoch2Data,
    (key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );

  fs.writeFileSync(path.join(__dirname, "../data/tree-epoch2.json"), jsonString2);
  fs.writeFileSync(path.join(frontendDataDir, "tree-epoch2.json"), jsonString2);

  console.log("==========================================");
  console.log(" Merkle Trees Generated (Epoch 1 & Epoch 2)");
  console.log("==========================================");
  console.log(`Epoch 1 Root:        ${root1}`);
  console.log(`Epoch 1 Liabilities: ${total1.toString()} units`);
  console.log(`Alice (Epoch 1):     ID ${demo1.userId}, Balance ${demo1.balance}, Proof: ${demo1.proof.length} hashes`);
  console.log(`------------------------------------------`);
  console.log(`Epoch 2 Root:        ${root2}`);
  console.log(`Epoch 2 Liabilities: ${total2.toString()} units (+50,000)`);
  console.log(`Alice (Epoch 2):     ID ${demo2.userId}, Balance ${demo2.balance}, Proof: ${demo2.proof.length} hashes`);
  console.log(`Outputs saved to:   data/ & frontend/data/`);
  console.log("==========================================");

  return epoch1Data;
}

if (require.main === module) {
  buildTree();
}

module.exports = { buildTree };
