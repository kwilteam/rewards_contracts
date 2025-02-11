// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";

import "./ISafeProxyFactory.sol";
import "./RewardDistributor.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 @notice Factory for create GnosisSafe wallet(proxy contract) and RewardDistributor contract(clone).
 */
contract SafeRewardFactory is Ownable {
    using Clones for address;
    address public rewardImp;

    /// @notice The GnosisSafe singleton contract address.
    address public safeSingleton;

    /// @notice IGnosisProxyFactory interface.
    address public safeProxyFactory;

    /// @notice Emitted when Gnosis Safe is created.
    event SafeCreated(address indexed user, address indexed proxy, address safeGnosis, address proxyFactory);

    /// @notice Emitted when Gnosis Safe is updated.
    event SafeSingletonUpdated(address indexed sender, address oldSafeGnosis, address newSafeGnosis);

    /// @notice Emitted when Proxy Factory is updated.
    event SafeProxyFactoryUpdated(address indexed sender, address oldProxyFactory, address newProxyFactory);

    event RewardCreated(address indexed sender, address instance);

    event RewardImpUpdated(address indexed sender, address oldImp, address newImp);

    /// @notice Mapping from reward to deployer address.
    mapping(address => address) public rewardDeployer;

    /// @notice Mapping from the saltNonce to correspond reward address.
    mapping(uint256 => address) public rewardBySalt;

    constructor(address _owner, address _rewardImp, address _safeSingleton, address _safeProxyFactory) Ownable(_owner) {
        require(_owner != address(0), "Zero address");
        require(_rewardImp != address(0), "Zero address");
        require(_safeSingleton != address(0), "Zero address");
        require(_safeProxyFactory != address(0), "Zero address");

        rewardImp = _rewardImp;
        safeSingleton = _safeSingleton;
        safeProxyFactory = _safeProxyFactory;
    }

    /**
     * @notice Function that can change Gnosis Safe contract address.
     * @param _singleton SafeGnosis contract address.
     */
    function updateSingleton(address _singleton) external onlyOwner {
        address oldSafeGnosis = safeSingleton;
        safeSingleton = _singleton;
        emit SafeSingletonUpdated(msg.sender, oldSafeGnosis, safeSingleton);
    }

    /**
     * @notice Function that can change Proxy Factory contract address.
     * @param _proxyFactory ProxyFactory contract address.
     */
    function updateProxyFactory(address _proxyFactory) external onlyOwner {
        address oldProxyFactory = safeProxyFactory;
        safeProxyFactory = _proxyFactory;
        emit SafeProxyFactoryUpdated(msg.sender, oldProxyFactory, safeProxyFactory);
    }

    /**
     * @notice Function for creating a new safe.
     * @param _owners List of Safe owners.
     * @param _threshold Number of required confirmations for a Safe transaction.
     * @param to Contract address for optional delegate call.
     * @param data Data payload for optional delegate call.
     * @param fallbackHandler Handler for fallback calls to this contract.
     * @param paymentToken Token that should be used for the payment (0 is ETH).
     * @param payment Value that should be paid.
     * @param paymentReceiver Address that should receive the payment (or 0 if tx.origin).
     * @param saltNonce is the salt for create deterministic safe proxy.
     */
    function createNSetupSafe(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver,
        uint256 saltNonce // should be derived from `salt + chainID`, so it's chain specific
    )
    public returns (ISafe proxy)
    {
        bytes memory safeGnosisData = abi.encode("setup(address[],uint256,address,bytes,address,address,uint256,address)",
            _owners,_threshold,to,data,fallbackHandler,paymentToken,payment,paymentReceiver);
        proxy = ISafeProxyFactory(safeProxyFactory).createProxyWithNonce(
            safeSingleton,
            safeGnosisData,
            saltNonce
        );
        emit SafeCreated(msg.sender, address(proxy), safeSingleton, safeProxyFactory);
        return proxy;
    }

    /**
     * @notice Function for creating a new safe.
     * @param _owners List of Safe owners.
     * @param _threshold Number of required confirmations for a Safe transaction.
     * @param saltNonce is the salt for create deterministic safe proxy.
     */
    function _createNSetupSafeMinimal(
        address[] calldata _owners,
        uint256 _threshold,
        uint256 saltNonce // should be derived from `salt + chainID`, so it's chain specific
    )
    public returns (ISafe proxy)
    {
        address emptyAddr = address(0);
        bytes memory safeSetupData = abi.encode("setup(address[],uint256,address,bytes,address,address,uint256,address)",
            _owners,_threshold, emptyAddr, bytes(""), emptyAddr, emptyAddr, 0, emptyAddr);
        proxy = ISafeProxyFactory(safeProxyFactory).createProxyWithNonce(
            safeSingleton,
            safeSetupData,
            saltNonce
        );

        console.logAddress(address(proxy));
        emit SafeCreated(msg.sender, address(proxy), safeSingleton, safeProxyFactory);
        return proxy;
    }

    function configRewardImp(address imp) external onlyOwner {
        address oldImp = address(rewardImp);
        rewardImp = imp;
        emit RewardImpUpdated(msg.sender, oldImp, rewardImp);
    }

    function createNSetupReward(
        address _safe,
        uint256 _posterFee,
        address _rewardToken,
        bytes32 saltNonce // should be derived from `salt + chainID`, so it's chain specific
    )
    public returns (IRewardDistributor)
    {
        bytes32 salt = calculateRewardCloneSalt(_safe, _posterFee, _rewardToken, saltNonce);
        address instance = rewardImp.cloneDeterministic(salt);
        IRewardDistributor(instance).setup(_safe, _posterFee, _rewardToken);

        console.logAddress(instance);
        emit RewardCreated(msg.sender,instance);

        return IRewardDistributor(instance);
    }

    /**
     * @notice Function to calculate the cloned reward contract address.
     * @param salt the salt for clone a new reward contract. It's the keccak256(safeAddr,saltForSafe).
    */
    function predicateRewardAddr(bytes32 salt)
    public
    view
    returns (address)
    {
        return rewardImp.predictDeterministicAddress(salt);
    }

    function calculateRewardCloneSalt(
        address _safe,
        uint256 _posterFee,
        address _rewardToken,
        bytes32 saltNonce // should be derived from `salt + chainID`, so it's chain specific
    ) public pure returns (uint256) {
        // Hmm, GnosisSafe use uint256 nonce, so here I try to convert bytes32 to uint256, is it safe?
        // safe to use encodePacked on address/bytes32/uint256
        return uint256(keccak256(abi.encodePacked(_safe, _posterFee, _rewardToken, saltNonce)));
    }

    /**
     * @notice Function to create both GnosisSafe proxy contract as well as RewardDistributor clone contract.
     * @param _owners Owners for the new Safe proxy contract
     * @param _threshold Threshold for the new Safe proxy contract.
     * @param _rewardToken Token address that is used by the new RewardDistributor contract.
     * @param saltNonce Nonce that will be used to generate the salt to calculate
              the address of the new Safe proxy contract and new RewardDistributor clone contract.
    */
    function createSafeNReward(
        address[] calldata _owners,
        uint256 _threshold,
        uint256 _posterFee,
        address _rewardToken,
        uint256 saltNonce // should be derived from `salt + chainID`, so it's chain specific
    ) external {
        require(rewardBySalt[saltNonce] == address(0), "SaltNonce has been used");

        address safe = _createNSetupSafeMinimal(_owners, _threshold, saltNonce);
        address reward = createNSetupReward(safe, _posterFee, _rewardToken, saltNonce);

        // kind awkward, calculateRewardCloneSalt is called twice
        bytes32 salt = calculateRewardCloneSalt(safe, _posterFee, _rewardToken, saltNonce);
        rewardBySalt[salt] = address(reward);

        rewardDeployer[reward] = msg.sender;
    }
}