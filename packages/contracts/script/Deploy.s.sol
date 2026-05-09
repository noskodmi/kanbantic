// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { Script, console2 } from "forge-std/Script.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { BountyBoard } from "../src/BountyBoard.sol";
import { ReputationAttestor } from "../src/ReputationAttestor.sol";
import { ArbiterCouncil } from "../src/ArbiterCouncil.sol";

/// @title Deploy
/// @notice Deploys all 5 Phase 1A contracts in topological order and writes
///         the resulting addresses to deployments/sepolia.json for downstream
///         consumption (indexer, web, MCP server). Designed to be invoked via:
///
///             forge script script/Deploy.s.sol:Deploy \
///                 --rpc-url $RPC --broadcast --slow -vvv
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("deployer:", deployer);

        vm.startBroadcast(pk);

        WorkspaceRegistry workspaces = new WorkspaceRegistry();
        console2.log("WorkspaceRegistry:", address(workspaces));

        // Deployer doubles as the orbitportOracle for v1; the real cTRNG
        // verifier lands in a follow-up phase.
        BountyBoard board = new BountyBoard(workspaces, deployer);
        console2.log("BountyBoard:", address(board));

        AgentRegistry agents = new AgentRegistry(workspaces);
        console2.log("AgentRegistry:", address(agents));

        ReputationAttestor reputation = new ReputationAttestor(board);
        console2.log("ReputationAttestor:", address(reputation));

        // 3-arbiter council with quorum 2 for the demo. Arbiter addresses
        // are deterministic placeholders derived from a domain-separated
        // string so anyone can reproduce them locally.
        address[] memory arbiters = new address[](3);
        arbiters[0] = address(uint160(uint256(keccak256("kanbantic.arbiter.0"))));
        arbiters[1] = address(uint160(uint256(keccak256("kanbantic.arbiter.1"))));
        arbiters[2] = address(uint160(uint256(keccak256("kanbantic.arbiter.2"))));
        ArbiterCouncil council = new ArbiterCouncil(arbiters, 2, board);
        console2.log("ArbiterCouncil:", address(council));
        console2.log("arbiter[0]:", arbiters[0]);
        console2.log("arbiter[1]:", arbiters[1]);
        console2.log("arbiter[2]:", arbiters[2]);

        vm.stopBroadcast();

        // Write canonical deployments record. Happens after vm.stopBroadcast
        // so it costs no gas and is purely a local-disk side effect.
        string memory json = "deployments";
        vm.serializeAddress(json, "WorkspaceRegistry", address(workspaces));
        vm.serializeAddress(json, "BountyBoard", address(board));
        vm.serializeAddress(json, "AgentRegistry", address(agents));
        vm.serializeAddress(json, "ReputationAttestor", address(reputation));
        string memory finalJson = vm.serializeAddress(json, "ArbiterCouncil", address(council));
        vm.writeJson(finalJson, "deployments/sepolia.json");
    }
}
