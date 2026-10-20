const { expect } = require("chai");
const { ethers } = require("hardhat");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const fs = require("fs");
const path = require("path");

describe("ProofOfReserves Verification and Attestation Test Suite", function () {
  let proofOfReserves;
  let owner;
  let nonOwner;
  let customers;
  let tree;
  let root;
  let totalLiabilities;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

    // Load customer mock data
    const customersPath = path.join(__dirname, "../data/customers.json");
    customers = JSON.parse(fs.readFileSync(customersPath, "utf-8"));

    // Build OpenZeppelin standard Merkle Tree
    const values = customers.map((c) => [BigInt(c.userId), BigInt(c.balance)]);
    tree = StandardMerkleTree.of(values, ["uint256", "uint256"]);
    root = tree.root;
    totalLiabilities = customers.reduce(
      (acc, c) => acc + BigInt(c.balance),
      0n
    );

    // Deploy contract
    const ProofOfReserves = await ethers.getContractFactory("ProofOfReserves");
    proofOfReserves = await ProofOfReserves.deploy();
    await proofOfReserves.waitForDeployment();

    // Publish initial root for Epoch 1
    await proofOfReserves.publishRoot(root, totalLiabilities);
  });

  it("1. JS leaf for a known pair equals the Solidity leaf (Hash equivalence check)", async function () {
    const testUserId = 1042n;
    const testBalance = 250000n;

    // JavaScript OpenZeppelin Standard leaf hash
    const jsLeaf = tree.leafHash([testUserId, testBalance]);

    // Solidity equivalent computed directly in JS via double-keccak of abi.encode:
    // bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(userId, balance))));
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(["uint256", "uint256"], [testUserId, testBalance]);
    const firstHash = ethers.keccak256(encoded);
    const expectedSolidityLeaf = ethers.keccak256(firstHash);

    expect(jsLeaf).to.equal(expectedSolidityLeaf);
  });

  it("2. Valid user, correct balance and proof: verify returns true", async function () {
    const demoIndex = customers.findIndex((c) => c.userId === 1042);
    expect(demoIndex).to.be.greaterThanOrEqual(0);

    const demoUser = customers[demoIndex];
    const proof = tree.getProof(demoIndex);

    const isValid = await proofOfReserves.verify(
      proof,
      demoUser.userId,
      demoUser.balance
    );
    expect(isValid).to.equal(true);
  });

  it("3. Same user, balance plus 1 unit (tampered): verify returns false (Avalanche effect)", async function () {
    const demoIndex = customers.findIndex((c) => c.userId === 1042);
    const demoUser = customers[demoIndex];
    const proof = tree.getProof(demoIndex);

    const tamperedBalance = BigInt(demoUser.balance) + 1n;

    const isValid = await proofOfReserves.verify(
      proof,
      demoUser.userId,
      tamperedBalance
    );
    expect(isValid).to.equal(false);
  });

  it("4. Valid balance, different user ID (impersonation): verify returns false", async function () {
    const demoIndex = customers.findIndex((c) => c.userId === 1042);
    const demoUser = customers[demoIndex];
    const proof = tree.getProof(demoIndex);

    const impostorUserId = 9999n;

    const isValid = await proofOfReserves.verify(
      proof,
      impostorUserId,
      demoUser.balance
    );
    expect(isValid).to.equal(false);
  });

  it("5. Non-owner calls publishRoot: reverts with NotOwner", async function () {
    const fakeRoot = ethers.hexlify(ethers.randomBytes(32));
    const fakeLiabilities = 1000000n;

    await expect(
      proofOfReserves.connect(nonOwner).publishRoot(fakeRoot, fakeLiabilities)
    ).to.be.revertedWithCustomError(proofOfReserves, "NotOwner");
  });

  it("6. Owner publishes a second root: epoch becomes 2 and old attestation is still stored", async function () {
    const initialEpoch = await proofOfReserves.epoch();
    expect(initialEpoch).to.equal(1n);

    const oldAttestation = await proofOfReserves.attestations(1);
    expect(oldAttestation.root).to.equal(root);

    // Create a modified dataset for epoch 2 (Alice deposits 50,000 more)
    const modifiedCustomers = customers.map((c) =>
      c.userId === 1042 ? { ...c, balance: c.balance + 50000 } : c
    );
    const newValues = modifiedCustomers.map((c) => [
      BigInt(c.userId),
      BigInt(c.balance),
    ]);
    const newTree = StandardMerkleTree.of(newValues, ["uint256", "uint256"]);
    const newTotal = modifiedCustomers.reduce(
      (acc, c) => acc + BigInt(c.balance),
      0n
    );

    // Publish Epoch 2
    await expect(proofOfReserves.publishRoot(newTree.root, newTotal))
      .to.emit(proofOfReserves, "RootPublished")
      .withArgs(2n, newTree.root, newTotal, (ts) => ts > 0);

    const currentEpoch = await proofOfReserves.epoch();
    expect(currentEpoch).to.equal(2n);

    // Verify historical integrity: Epoch 1 attestation is preserved intact
    const historicalAttestation = await proofOfReserves.attestations(1);
    expect(historicalAttestation.root).to.equal(root);
    expect(historicalAttestation.totalLiabilities).to.equal(totalLiabilities);

    // Latest attestation matches epoch 2
    const latestAttestation = await proofOfReserves.attestations(2);
    expect(latestAttestation.root).to.equal(newTree.root);
    expect(latestAttestation.totalLiabilities).to.equal(newTotal);

    // Alice's new balance verifies under Epoch 2
    const newAliceIndex = modifiedCustomers.findIndex((c) => c.userId === 1042);
    const newProof = newTree.getProof(newAliceIndex);
    const isNewValid = await proofOfReserves.verify(
      newProof,
      1042n,
      300000n // 250000 + 50000
    );
    expect(isNewValid).to.equal(true);

    // Old balance (250000) now fails against current epoch 2
    const isOldValid = await proofOfReserves.verify(
      newProof,
      1042n,
      250000n
    );
    expect(isOldValid).to.equal(false);
  });

  it("7. Historical query: verifyForEpoch preserves Epoch 1 verification even after Epoch 2 is active", async function () {
    const demoIndex = customers.findIndex((c) => c.userId === 1042);
    const demoUser = customers[demoIndex];
    const epoch1Proof = tree.getProof(demoIndex);

    // Advance to Epoch 2 with different root
    const dummyRoot = ethers.hexlify(ethers.randomBytes(32));
    await proofOfReserves.publishRoot(dummyRoot, 9999999n);

    // verify() against current epoch (Epoch 2) fails
    const isValidCurrent = await proofOfReserves.verify(epoch1Proof, demoUser.userId, demoUser.balance);
    expect(isValidCurrent).to.equal(false);

    // verifyForEpoch(1) targets the immutable historical epoch and succeeds
    const isValidHistorical = await proofOfReserves.verifyForEpoch(1n, epoch1Proof, demoUser.userId, demoUser.balance);
    expect(isValidHistorical).to.equal(true);
  });

  it("8. getLatestAttestation returns correct tuple matching contract state", async function () {
    const [attRoot, attLiabilities, attTimestamp, currentEpoch] =
      await proofOfReserves.getLatestAttestation();

    expect(attRoot).to.equal(root);
    expect(attLiabilities).to.equal(totalLiabilities);
    expect(attTimestamp).to.be.greaterThan(0n);
    expect(currentEpoch).to.equal(1n);
  });

  it("9. R5 Gap Analysis: publishRoot accepts unconstrained totalLiabilities (documents plain Merkle limitation)", async function () {
    // A plain Merkle tree binds inclusion, but not the sum total.
    // An exchange could declare 1 unit even though customer leaves sum to millions:
    const fakeLiabilities = 1n;
    const testRoot = ethers.hexlify(ethers.randomBytes(32));

    await expect(proofOfReserves.publishRoot(testRoot, fakeLiabilities))
      .to.emit(proofOfReserves, "RootPublished");

    const [, recordedLiabilities] = await proofOfReserves.getLatestAttestation();
    expect(recordedLiabilities).to.equal(1n);
    // This test proves that plain Merkle trees require Merkle Sum Trees or audits to constrain liabilities!
  });

  it("10. Corrupted proof element rejection: any altered hash in sibling path is rejected", async function () {
    const demoIndex = customers.findIndex((c) => c.userId === 1042);
    const demoUser = customers[demoIndex];
    const proof = [...tree.getProof(demoIndex)];

    // Corrupt the first sibling hash
    proof[0] = ethers.hexlify(ethers.randomBytes(32));

    const isValid = await proofOfReserves.verify(proof, demoUser.userId, demoUser.balance);
    expect(isValid).to.equal(false);
  });

  it("11. Direct on-chain leaf check: publishing a single leaf directly verifies with empty proof []", async function () {
    const userId = 8888n;
    const balance = 123456n;

    // Compute expected leaf in JS
    const leaf = tree.leafHash([userId, balance]);

    // Publish this leaf directly as the root
    await proofOfReserves.publishRoot(leaf, balance);

    // Verify on-chain with empty proof [] -> confirms contract computes identical leaf
    const isValid = await proofOfReserves.verify([], userId, balance);
    expect(isValid).to.equal(true);
  });
});
