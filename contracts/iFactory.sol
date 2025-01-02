// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./iBot.sol";

contract iFactory is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    address public implementation;
    uint256 public botCreationFee;
    uint256 public initPrice;
    uint256 public totalBots;

    struct BotInfo {
        address creator;
        uint256 createdAt;
        bool isActive;
    }

    mapping(address => BotInfo) public bots;

    event BotCreated(
        address indexed botAddress,
        address indexed creator,
        uint256 timestamp
    );
    event ImplementationUpdated(
        address indexed oldImpl,
        address indexed newImpl
    );
    event initPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BotCreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event BotPaused(address indexed botAddress);
    event BotUnpaused(address indexed botAddress);

    error InvalidImplementation();
    error InvalidFee();
    error BotNotFound();
    error UnauthorizedAccess();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _implementation,
        uint256 _botCreationFee,
        uint256 _initPrice
    ) public initializer {
        if (_implementation == address(0)) revert InvalidImplementation();

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        implementation = _implementation;
        botCreationFee = _botCreationFee;
        initPrice = _initPrice;
    }

    function createBot(
        address _creator,
        uint256 _instructionLengthFee
    ) external payable nonReentrant whenNotPaused returns (address) {
        uint256 totalFee = _instructionLengthFee + botCreationFee;
        if (msg.value < totalFee) revert InvalidFee();

        bytes memory initData = abi.encodeWithSelector(
            iBot.initialize.selector,
            address(this),
            _creator,
            initPrice
        );

        address botAddress = address(
            new ERC1967Proxy(implementation, initData)
        );

        BotInfo memory botInfo = BotInfo({
            creator: _creator,
            createdAt: block.timestamp,
            isActive: true
        });

        bots[botAddress] = botInfo;
        totalBots++;

        uint256 excess = msg.value - totalFee;
        if (excess > 0) {
            _safeTransfer(botAddress, excess);
        }

        emit BotCreated(botAddress, _creator, block.timestamp);

        return botAddress;
    }

    function withdraw() external onlyOwner returns (uint256) {
        uint256 balance = address(this).balance;
        _safeTransfer(msg.sender, balance);
        return balance;
    }

    function updateImplementation(
        address newImplementation
    ) external onlyOwner {
        if (newImplementation == address(0)) revert InvalidImplementation();

        address oldImplementation = implementation;
        implementation = newImplementation;

        emit ImplementationUpdated(oldImplementation, newImplementation);
    }

    function updateBotCreationFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = botCreationFee;
        botCreationFee = newFee;

        emit BotCreationFeeUpdated(oldFee, newFee);
    }

    function updateInitPrice(uint256 newPrice) external onlyOwner {
        uint256 oldPrice = initPrice;
        initPrice = newPrice;

        emit initPriceUpdated(oldPrice, newPrice);
    }

    function disburse(address botAddress, address to) external onlyOwner {
        iBot(payable(botAddress)).disburse(to);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function _safeTransfer(address to, uint256 amount) private {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
