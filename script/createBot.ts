import { ethers } from "hardhat";
import { IBot, IFactory } from "../typechain-types";
import { ContractTransactionReceipt, Log } from "ethers";

interface BotDetails {
    address: string;
    name: string;
    initialPrice: bigint;
}

async function main(): Promise<BotDetails> {
    const [deployer] = await ethers.getSigners();
    console.log("Creating bot with account:", deployer.address);

    // Get the factory contract
    const factoryAddress = "0xAfF516e7F40C5A15F999EcEEa29F4Ff6a8326E15";
    const iFactory = (await ethers.getContractAt(
        "iFactory",
        factoryAddress
    )) as unknown as IFactory;

    const botName = "Test Bot";
    const initialPrice = ethers.parseEther("0.0003");

    // Get the creation fee
    const creationFee = await iFactory.botCreationFee();
    console.log("Bot creation fee:", ethers.formatEther(creationFee), "ETH");

    // Create the bot
    console.log("Creating bot...");
    const tx = await iFactory.createBot(botName, initialPrice, {
        value: creationFee,
    });

    console.log("Waiting for transaction confirmation...");
    const receipt = (await tx.wait()) as ContractTransactionReceipt;

    // Find the BotCreated event
    const botCreatedEvent = receipt.logs.find((log: Log) => {
        try {
            const parsedLog = iFactory.interface.parseLog({
                topics: [...log.topics],
                data: log.data,
            });
            return parsedLog?.name === "BotCreated";
        } catch {
            return false;
        }
    });

    if (!botCreatedEvent) {
        throw new Error("BotCreated event not found in transaction logs");
    }

    const parsedEvent = iFactory.interface.parseLog({
        topics: [...botCreatedEvent.topics],
        data: botCreatedEvent.data,
    });

    const botAddress = parsedEvent?.args[0] as string;

    console.log("\nBot created successfully! 🎉");
    console.log("----------------------------------------");
    console.log("Bot address:", botAddress.toLowerCase());
    console.log("Bot name:", botName);
    console.log("Initial price:", ethers.formatEther(initialPrice), "ETH");

    console.log("----------------------------------------");

    // Get bot instance and print additional info
    const iBot = (await ethers.getContractAt("iBot", botAddress)) as unknown as IBot;

    return {
        address: botAddress,
        name: botName,
        initialPrice,
    };
}

// Execute bot creation
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export default main;
