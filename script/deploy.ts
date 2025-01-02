import { ethers, upgrades } from "hardhat";
import { IBot, IBot__factory, IFactory, IFactory__factory } from "../typechain-types";

async function main() {
    try {
        const iBot = await ethers.getContractFactory("iBot");
        const iFactory = await ethers.getContractFactory("iFactory");

        console.log("Deploying iBot implementation...");
        const iBotImpl = await iBot.deploy();
        await iBotImpl.waitForDeployment();
        const iBotAddress = await iBotImpl.getAddress();
        console.log("iBot implementation deployed to:", iBotAddress);

        console.log("Deploying iFactory...");
        const botCreationFee = ethers.parseEther("0.01");
        const initPrice = ethers.parseEther("0.0003");

        const iFactoryProxy = await upgrades.deployProxy(
            iFactory,
            [iBotAddress, botCreationFee, initPrice],
            {
                kind: "uups",
                initializer: "initialize",
            }
        );
        await iFactoryProxy.waitForDeployment();
        const iFactoryAddress = await iFactoryProxy.getAddress();
        console.log("iFactory proxy deployed to:", iFactoryAddress);
    } catch (error) {
        console.error("Error during deployment:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
