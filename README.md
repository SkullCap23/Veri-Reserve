# 🛡️ Veri-Reserve | Cryptographic Proof-of-Reserves Audit Suite

> **Consensus-Anchored Cryptographic Inclusion & Solvency Attestation Protocol**  
> A full-stack blockchain case study implementation featuring smart contract commitments, double-hashed Merkle trees, on-chain verification, and interactive forensic tamper detection.

---

## 📌 Executive Summary

Centralized custodial exchanges track customer balances off-chain in private databases. Customers are forced to trust exchange-reported numbers blindly. When trust is misplaced (e.g., FTX, Mt. Gox), failures are sudden and catastrophic.

**Veri-Reserve** provides a mathematical solution:
1. The exchange commits to all customer balances with a single **32-byte Merkle root** and total liabilities stored immutably on a smart contract.
2. Any customer can independently verify their balance inclusion on-chain with a compact cryptographic proof ($\approx 6$ hashes for 50 users) at **0 gas overhead** (`view` call).
3. The cryptographic **Avalanche Effect** guarantees that altering a customer balance by even **1 single unit** completely scrambles the root and causes instant on-chain rejection.

---

## 🏗️ Architecture & 5-Step Protocol

```
+-----------------------------------------------------------------------------------+
| 01. SNAPSHOT         02. MERKLE BUILD        03. ON-CHAIN ANCHOR                  |
| 50 Customer Balances  -->  keccak256(keccak256) --> Smart Contract Stores Root     |
| (Exchange Database)        SortPairs: true          & Declared Liabilities        |
+-----------------------------------------------------------------------------------+
                                                          |
                                                          v
+-----------------------------------------------------------------------------------+
| 05. ON-CHAIN VERIFICATION             04. PROOF EXTRACTION                        |
| Contract evaluates verify()            <-- Exchange returns ~6 sibling hashes     |
| Returns TRUE (Match) or FALSE (Reject)      for customer path                     |
+-----------------------------------------------------------------------------------+
```

---

## 🔒 Cryptographic Design Details

* **Second-Preimage Attack Prevention:**  
  Leaves are double-hashed using:  
  `keccak256(bytes.concat(keccak256(abi.encode(userId, balance))))`  
  This ensures that 64-byte leaf data cannot be mistaken for an intermediate pair of 32-byte hashes.
* **Sorted Pairs (`sortPairs: true`):**  
  Compatible with OpenZeppelin's audited `MerkleProof.verifyCalldata`, eliminating the need for left/right flags.
* **Zero Customer Balance Leakage:**  
  A customer's proof contains only sibling node hashes, revealing zero balance information about other users.

---

## 📂 Project Structure

```
Veri-Reserve/
├── contracts/
│   └── ProofOfReserves.sol       # Core Solidity contract with OpenZeppelin MerkleProof
├── data/
│   ├── customers.json            # 50 mock customer balances (Alice demo user @ ID 1042)
│   ├── tree.json                 # Exported Merkle tree dump, proofs, and liabilities
│   └── deployment.json           # Canonical on-chain deployment records
├── frontend/
│   ├── index.html                # Institutional dark-theme audit interface
│   ├── style.css                 # Enterprise styling with SVG canvas and verdict banners
│   ├── app.js                    # Ethers.js integration, on-chain evaluation, SVG tree visualizer
│   └── libs/ethers.umd.min.js    # Self-contained offline Ethers v6 bundle
├── scripts/
│   ├── buildTree.js              # Merkle tree generator and proof exporter
│   ├── deploy.js                 # Smart contract deployment script (Epoch 1)
│   ├── serve.js                  # Lightweight web server with automatic port detection
│   └── run-demo.js               # Unified single-command launcher
├── test/
│   └── proofOfReserves.test.js   # 6 comprehensive automated Hardhat test suites
├── hardhat.config.js             # Hardhat network and compiler configuration
├── start-demo.bat                # 1-Click launcher batch file for Windows
└── package.json
```

---

## ⚡ Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Cryptographic Tests
```bash
npx hardhat test
```
**Test Coverage:**
- `√ 1. JS leaf for a known pair equals the Solidity leaf (Hash equivalence check)`
- `√ 2. Valid user, correct balance and proof: verify returns true`
- `√ 3. Same user, balance plus 1 unit (tampered): verify returns false (Avalanche effect)`
- `√ 4. Valid balance, different user ID (impersonation): verify returns false`
- `√ 5. Non-owner calls publishRoot: reverts with NotOwner`
- `√ 6. Owner publishes a second root: epoch becomes 2 and old attestation is still stored`

### 3. Launch Demo Interface
#### Option A: Windows 1-Click
Double click `start-demo.bat`.

#### Option B: Terminal
```bash
npm run demo
# or
node scripts/run-demo.js
```
The application will start at `http://localhost:8081` and automatically open in your default browser.

---

## ⚖️ Solvency Analysis: What This Proves vs. Does NOT Prove

| Question | Answered? | Mechanism / Justification |
| :--- | :---: | :--- |
| **Is my balance included in declared liabilities?** | **YES** | On-chain Merkle proof verified via smart contract view call |
| **Was my balance tampered with after publication?** | **YES** | Cryptographic Avalanche Effect; 1 unit change breaks the proof |
| **Can third parties see my private balance?** | **NO** | Proof contains only sibling hashes, no adjacent balances |
| **Does the exchange hold real assets to cover liabilities?** | **NO** | Plain inclusion proofs do not verify private key ownership |
| **Did the exchange omit silent users from the tree?** | **PARTIAL** | Only vigilant users who independently verify can catch omission |

*To achieve complete trustless solvency, systems must combine inclusion proofs with **proof of reserve wallet ownership** and **Merkle sum trees / Zero-Knowledge proofs (zk-SNARKs)**.*

---

## 📜 License
MIT License.
