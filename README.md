# 🛡️ Veri-Reserve | Cryptographic Proof-of-Reserves Audit Suite

> **Consensus-Anchored Cryptographic Inclusion & Solvency Attestation Protocol**  
> A full-stack blockchain case study implementation featuring smart contract commitments, double-hashed Merkle trees, on-chain verification, and interactive forensic tamper detection.

---

## 📌 Executive Summary

Centralized custodial exchanges track customer balances off-chain in private databases. Customers are forced to trust exchange-reported numbers blindly. When trust is misplaced (e.g., FTX, Mt. Gox), failures are sudden and catastrophic.

**Veri-Reserve** provides a mathematical solution:
1. The exchange commits to all customer balances with a single **32-byte Merkle root** and total declared liabilities stored immutably on a smart contract.
2. Any customer can independently verify their balance inclusion on-chain with a compact cryptographic proof (5 to 6 hashes for 50 users) at **0 gas overhead** (`view` call).
3. The **collision and second-preimage resistance of keccak-256** guarantees rejection if a customer balance is modified by even **1 single unit**; the observable symptom is the cryptographic **Avalanche Effect**.

---

## 🏗️ Architecture & 5-Step Protocol

```
+-----------------------------------------------------------------------------------+
| 01. SNAPSHOT         02. MERKLE BUILD        03. ON-CHAIN ANCHOR                  |
| 50 Customer Balances  -->  keccak256(keccak256) --> Smart Contract Stores Root     |
| (Exchange Database)        Sorted Pairs             & Declared Liabilities        |
+-----------------------------------------------------------------------------------+
                                                          |
                                                          v
+-----------------------------------------------------------------------------------+
| 05. ON-CHAIN VERIFICATION             04. PROOF EXTRACTION                        |
| Contract evaluates verify()            <-- Exchange returns ~5-6 sibling hashes   |
| Returns TRUE (Match) or FALSE (Reject)      for customer path                     |
+-----------------------------------------------------------------------------------+
```

---

## 🔒 Cryptographic Design Details

* **Second-Preimage Attack Prevention:**  
  Leaves are double-hashed using:  
  `keccak256(bytes.concat(keccak256(abi.encode(userId, balance))))`  
  This ensures that 64-byte leaf data cannot be mistaken for an intermediate pair of 32-byte hashes.
* **Sorted-Pair Hashing:**  
  Built into OpenZeppelin's `StandardMerkleTree` and matched by `MerkleProof.verifyCalldata`'s commutative hashing, eliminating the need for left/right positional flags.
* **Sibling Path Proofs & Privacy Boundary:**  
  A customer's proof contains only sibling node hashes, revealing no adjacent balances directly. However, because balances in this baseline demo are unsalted over low-entropy integer values, an adversary knowing a user ID could brute-force candidate balances against sibling hashes (recovered in ~1.3s empirically). Production implementations resolve this by appending a cryptographically random private salt (`nonce`) to each leaf pre-image.

---

## 📂 Project Structure

```
Veri-Reserve/
├── contracts/
│   └── ProofOfReserves.sol       # Core Solidity contract with OpenZeppelin MerkleProof
├── data/
│   ├── customers.json            # 50 mock customer balances (Alice demo user @ ID 1042)
│   ├── tree.json                 # Exported Merkle tree dump (Epoch 1)
│   ├── tree-epoch2.json          # Multi-epoch Merkle tree dump (Epoch 2, Alice +50,000)
│   └── deployment.json           # Canonical on-chain deployment records
├── frontend/
│   ├── index.html                # Institutional dark-theme audit interface
│   ├── style.css                 # Enterprise styling with SVG canvas and verdict banners
│   ├── app.js                    # Ethers.js integration, on-chain evaluation, SVG tree visualizer
│   ├── data/                     # Web-accessible mirrors of tree & ABI artifacts
│   └── libs/ethers.umd.min.js    # Self-contained offline Ethers v6 bundle
├── scripts/
│   ├── buildTree.js              # Standard Merkle tree generator (Epoch 1 & 2)
│   ├── deploy.js                 # Smart contract deployment script (Epoch 1 on-chain)
│   ├── serve.js                  # Lightweight web server with automatic port detection
│   └── run-demo.js               # Unified single-command launcher (spawns node, deploys & opens UI)
├── test/
│   └── proofOfReserves.test.js   # 11 comprehensive automated Hardhat tests
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
**Test Coverage (11 Passing Tests):**
- `√ 1. JS leaf for a known pair equals the Solidity leaf (Hash equivalence check)`
- `√ 2. Valid user, correct balance and proof: verify returns true`
- `√ 3. Same user, balance plus 1 unit (tampered): verify returns false (Avalanche effect)`
- `√ 4. Valid balance, different user ID (impersonation): verify returns false`
- `√ 5. Non-owner calls publishRoot: reverts with NotOwner`
- `√ 6. Owner publishes a second root: epoch becomes 2 and old attestation is still stored`
- `√ 7. Historical query: verifyForEpoch preserves Epoch 1 verification even after Epoch 2 is active`
- `√ 8. getLatestAttestation returns correct tuple matching contract state`
- `√ 9. R5 Gap Analysis: publishRoot accepts unconstrained totalLiabilities (documents plain Merkle limitation)`
- `√ 10. Corrupted proof element rejection: any altered hash in sibling path is rejected`
- `√ 11. Direct on-chain leaf check: publishing a single leaf directly verifies with empty proof []`

### 3. Launch Demo Interface
#### Option A: Windows 1-Click
Double click `start-demo.bat`.

#### Option B: Terminal (Starts Node, Deploys Contract & Opens Browser)
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
| **Was my balance tampered with after publication?** | **YES** | Keccak-256 collision resistance; 1-unit drift mutates root |
| **Is my balance protected from dictionary brute-force?** | **PARTIAL** | Proof contains only hashes; unsalted low-entropy balances require salts |
| **Is the declared total liabilities bound to the tree sum?** | **NO** | Plain Merkle trees bind leaf inclusion, not the sum (Owner-declared; solved by Merkle Sum Trees) |
| **Does the exchange hold real assets to cover liabilities?** | **NO** | Plain inclusion proofs do not verify private key ownership of reserves |
| **Did the exchange omit silent users from the tree?** | **PARTIAL** | Only vigilant users who independently verify can catch omission |

*To achieve complete trustless solvency, systems must combine inclusion proofs with **proof of reserve wallet ownership** and **Merkle sum trees / Zero-Knowledge proofs (zk-SNARKs)**.*

---

## 📜 License
MIT License.
