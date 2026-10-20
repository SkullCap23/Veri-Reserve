// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title ProofOfReserves
 * @notice Stores exchange balance commitments (Merkle root + total liabilities)
 *         and enables trustless on-chain verification of individual account inclusion.
 */
contract ProofOfReserves {
    struct Attestation {
        bytes32 root;
        uint256 totalLiabilities;
        uint256 timestamp;
    }

    address public immutable owner;
    uint256 public epoch;
    mapping(uint256 => Attestation) public attestations;

    event RootPublished(
        uint256 indexed epoch,
        bytes32 root,
        uint256 totalLiabilities,
        uint256 timestamp
    );

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    function publishRoot(bytes32 root, uint256 totalLiabilities) external {
        if (msg.sender != owner) revert NotOwner();
        epoch += 1;
        attestations[epoch] = Attestation(root, totalLiabilities, block.timestamp);
        emit RootPublished(epoch, root, totalLiabilities, block.timestamp);
    }

    function verify(
        bytes32[] calldata proof,
        uint256 userId,
        uint256 balance
    ) external view returns (bool) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(userId, balance))));
        return MerkleProof.verifyCalldata(proof, attestations[epoch].root, leaf);
    }

    function verifyForEpoch(
        uint256 targetEpoch,
        bytes32[] calldata proof,
        uint256 userId,
        uint256 balance
    ) external view returns (bool) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(userId, balance))));
        return MerkleProof.verifyCalldata(proof, attestations[targetEpoch].root, leaf);
    }

    function getLatestAttestation()
        external
        view
        returns (
            bytes32 root,
            uint256 totalLiabilities,
            uint256 timestamp,
            uint256 currentEpoch
        )
    {
        Attestation memory att = attestations[epoch];
        return (att.root, att.totalLiabilities, att.timestamp, epoch);
    }
}
