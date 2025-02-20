// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "./RewardDistributor.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract RewardDistributorFactory is Ownable {
    using Clones for address;

    address public imp;

    event Created(address instance);

    constructor(address _owner, address _imp) Ownable(_owner) {
        imp = _imp;
    }

    function create(
        address _safe,
        uint256 _posterFee,
        address _rewardToken,
        bytes32 salt
    )
    external
    onlyOwner
    {
        address instance = imp.cloneDeterministic(salt);
        IRewardDistributor(instance).setup(_safe, _posterFee, _rewardToken);

        console.logAddress(instance);
        emit Created(instance);
    }

    function predicateAddr(bytes32 salt)
    public
    view
    returns (address predicted)
    {
        return imp.predictDeterministicAddress(salt);
    }
}