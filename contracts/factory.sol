// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ISafeProxyFactory.sol";
import "./RewardDistributor.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract GnosisSafeFactory is Ownable {
//    //
//    public address admin;

    /// @notice The GnosisSafe singleton contract address.
    ISafe public singleton;

    /// @notice IGnosisProxyFactory interface.
    ISafeProxyFactory public proxyFactory;

    /// @notice Whether initialized or not.
    bool private initialised;

    /// @notice Mapping from user address to Gnosis Safe interface.
    mapping(address => ISafe) userToProxy;

    /// @notice Emitted when Gnosis Safe is created.
    event GnosisSafeCreated(address indexed user, address indexed proxy, address safeGnosis, address proxyFactory);


    /// @notice Emitted when Gnosis Safe is updated.
    event SafeGnosisUpdated(address indexed sender, address oldSafeGnosis, address newSafeGnosis);

    /// @notice Emitted when Proxy Factory is updated.
    event ProxyFactoryUpdated(address indexed sender, address oldProxyFactory, address newProxyFactory);

    constructor(address _owner) Ownable(_owner) {}

    /**
     * @notice Config safe singleton, proxyFactory contracts.
     * @param _singleton SafeGnosis contract address.
     * @param _proxyFactory ProxyFactory contract address.
     */
    function configGnosis(address _singleton, address _proxyFactory) public {
        require(!initialised);
        singleton = ISafe(_singleton);
        proxyFactory = ISafeProxyFactory(_proxyFactory);
        initialised = true;
    }

    /**
     * @notice Function that can change Gnosis Safe contract address.
     * @param _singleton SafeGnosis contract address.
     */
    function updateSingleton(address _singleton) external {
        address oldSafeGnosis = address(singleton);
        singleton = ISafe(_singleton);
        emit SafeGnosisUpdated(msg.sender, oldSafeGnosis, address(singleton));
    }

    /**
     * @notice Function that can change Proxy Factory contract address.
     * @param _proxyFactory ProxyFactory contract address.
     */
    function updateProxyFactory(address _proxyFactory) external {
        address oldProxyFactory = address(proxyFactory);
        proxyFactory = ISafeProxyFactory(_proxyFactory);
        emit ProxyFactoryUpdated(msg.sender, oldProxyFactory, address(proxyFactory));
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
        uint256 saltNonce // should be derived from `salt + chainID`
    )
    public returns (ISafe proxy)
    {
        bytes memory safeGnosisData = abi.encode("setup(address[],uint256,address,bytes,address,address,uint256,address)",
            _owners,_threshold,to,data,fallbackHandler,paymentToken,payment,paymentReceiver);
        proxy = proxyFactory.createChainSpecificProxyWithNonce(
            address(singleton),
            safeGnosisData,
            saltNonce
        );
        userToProxy[msg.sender] = proxy;
        emit GnosisSafeCreated(msg.sender, address(proxy), address(singleton), address(proxyFactory));
        return proxy;
    }

    /**
 * @notice Function for creating a new safe.
     * @param _owners List of Safe owners.
     * @param _threshold Number of required confirmations for a Safe transaction.
     * @param saltNonce is the salt for create deterministic safe proxy.
     */
    function createNSetupSafeMinimal(
        address[] calldata _owners,
        uint256 _threshold,
        uint256 saltNonce // should be derived from `salt + chainID`
    )
    public onlyOwner returns (ISafe proxy)
    {
        address emptyAddr = address(0);
        bytes memory safeGnosisData = abi.encode("setup(address[],uint256,address,bytes,address,address,uint256,address)",
            _owners,_threshold, emptyAddr, bytes(""), emptyAddr, emptyAddr, 0, emptyAddr);
        proxy = proxyFactory.createChainSpecificProxyWithNonce(
            address(singleton),
            safeGnosisData,
            saltNonce
        );
        userToProxy[msg.sender] = proxy;
        emit GnosisSafeCreated(msg.sender, address(proxy), address(singleton), address(proxyFactory));
        return proxy;
    }

//    function createNSetupReward(
//        address _safe,
//        uint256 _posterFee,
//        address _rewardToken
//    ) public returns (address)
//    {
//        bytes memory rewardInitData = abi.encode("setup(address, uint256, address)",
//            _safe, _posterFee, _rewardToken);
//
//    }
}