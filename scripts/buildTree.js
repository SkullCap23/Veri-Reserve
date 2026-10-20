const fs = require("fs");
const path = require("path");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { ethers } = require("ethers");

function buildTree() {
  const customersPath = path.join(__dirname, "../data/customers.json");
  const customers = JSON.parse(fs.readFileSync(customersPath, "utf-8"));

  // OpenZeppelin StandardMerkleTree expects: values array of tuples matching types
  const values = customers.map((c) => [BigInt(c.userId), BigInt(c.balance)]);
  const tree = StandardMerkleTree.of(values, ["uint256", "uint256"]);

  const root = tree.root;
  const totalLiabilities = customers.reduce(
    (acc, c) => acc + BigInt(c.balance),
    0n
  );

  // Compute leaf and proof for each customer
  const enrichedCustomers = customers.map((c, index) => {
    const proof = tree.getProof(index);
    // leaf format in OZ standard merkle tree
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
    root: root,
    totalLiabilities: totalLiabilities.toString(),
    customerCount: customers.length,
    generatedAt: new Date().toISOString(),
    demoUser: demoCustomer,
    customers: enrichedCustomers,
    // Tree dump contains values and tree node array for visualization
    treeDump: tree.dump(),
  };

  const jsonString = JSON.stringify(
    treeData,
    (key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );

  const outputPath = path.join(__dirname, "../data/tree.json");
  fs.writeFileSync(outputPath, jsonString);

  // Also write a copy directly to frontend directory for easy static loading
  const frontendDataDir = path.join(__dirname, "../frontend/data");
  if (!fs.existsSync(frontendDataDir)) {
    fs.mkdirSync(frontendDataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(frontendDataDir, "tree.json"), jsonString);

  console.log("==========================================");
  console.log(" Merkle Tree Generated Successfully");
  console.log("==========================================");
  console.log(`Root:              ${root}`);
  console.log(`Total Liabilities: ${totalLiabilities.toString()} units`);
  console.log(`Customer Count:    ${customers.length}`);
  console.log(
    `Demo User (Alice): ID ${demoCustomer.userId}, Balance ${demoCustomer.balance}`
  );
  console.log(`Demo User Proof:   ${demoCustomer.proof.length} sibling hashes`);
  console.log(`Output saved to:   data/tree.json & frontend/data/tree.json`);
  console.log("==========================================");

  return treeData;
}

if (require.main === module) {
  buildTree();
}

module.exports = { buildTree };
