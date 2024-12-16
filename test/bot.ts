import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { IBot, IFactory } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("iFactory and iBot", function () {
    // Define interfaces for our fixture return type
    interface DeployFixture {
        iFactoryProxy: IFactory;
        iBotImpl: IBot;
        owner: SignerWithAddress;
        user1: SignerWithAddress;
        user2: SignerWithAddress;
        botCreationFee: bigint;
        initPrice: bigint;
    }

    async function deployFixture(): Promise<DeployFixture> {
        const [owner, user1, user2] = await ethers.getSigners();

        // Deploy iBot implementation
        const iBot = await ethers.getContractFactory("iBot");
        const iBotImpl = await iBot.deploy();

        // Deploy iFactory with UUPS proxy
        const iFactory = await ethers.getContractFactory("iFactory");

        const botCreationFee = ethers.parseEther("0.005");
        const initPrice = ethers.parseEther("0.0001");

        const iFactoryProxy = (await upgrades.deployProxy(
            iFactory,
            [await iBotImpl.getAddress(), botCreationFee, initPrice],
            { kind: "uups" }
        )) as unknown as IFactory;

        return {
            iFactoryProxy,
            iBotImpl: iBotImpl as IBot,
            owner,
            user1,
            user2,
            botCreationFee,
            initPrice,
        };
    }

    describe("Factory", function () {
        it("Should initialize with correct values", async function () {
            const { iFactoryProxy, iBotImpl, owner, botCreationFee } = await loadFixture(
                deployFixture
            );

            expect(await iFactoryProxy.implementation()).to.equal(await iBotImpl.getAddress());
            expect(await iFactoryProxy.botCreationFee()).to.equal(botCreationFee);
            expect(await iFactoryProxy.owner()).to.equal(await owner.getAddress());
        });

        it("Should create a new bot", async function () {
            const { iFactoryProxy, owner, user1, botCreationFee } = await loadFixture(
                deployFixture
            );
            const instructionLengthFee = ethers.parseEther("0.001");
            const totalFee = botCreationFee + instructionLengthFee;

            const tx = await iFactoryProxy
                .connect(owner)
                .createBot(await user1.getAddress(), instructionLengthFee, { value: totalFee });

            const receipt = await tx.wait();
            const event = receipt?.logs.find((log) => {
                const decoded = iFactoryProxy.interface.parseLog(log as any);
                return decoded?.name === "BotCreated";
            });

            expect(event).to.exist;
            const botAddress = (event as any)["args"][0];

            const botInfo = await iFactoryProxy.bots(botAddress);
            expect(botInfo.creator).to.equal(await user1.getAddress());
            expect(botInfo.isActive).to.be.true;

            expect(await iFactoryProxy.totalBots()).to.equal(1n);
        });

        it("Should fail to create bot with insufficient fee", async function () {
            const { iFactoryProxy, owner, user1, botCreationFee } = await loadFixture(
                deployFixture
            );
            const instructionLengthFee = ethers.parseEther("0.001");
            const insufficientFee = botCreationFee / 2n;

            await expect(
                iFactoryProxy
                    .connect(owner)
                    .createBot(await user1.getAddress(), instructionLengthFee, {
                        value: insufficientFee,
                    })
            ).to.be.revertedWithCustomError(iFactoryProxy, "InvalidFee");
        });

        it("Should update implementation", async function () {
            const { iFactoryProxy, owner } = await loadFixture(deployFixture);

            // Deploy new implementation
            const newiBotFactory = await ethers.getContractFactory("iBot");
            const newImplementation = await newiBotFactory.deploy();

            const oldImpl = await iFactoryProxy.implementation();

            await expect(
                iFactoryProxy
                    .connect(owner)
                    .updateImplementation(await newImplementation.getAddress())
            )
                .to.emit(iFactoryProxy, "ImplementationUpdated")
                .withArgs(oldImpl, await newImplementation.getAddress());

            expect(await iFactoryProxy.implementation()).to.equal(
                await newImplementation.getAddress()
            );
        });

        it("Should update bot creation fee", async function () {
            const { iFactoryProxy, owner } = await loadFixture(deployFixture);
            const newFee = ethers.parseEther("0.01");
            const oldFee = await iFactoryProxy.botCreationFee();

            await expect(iFactoryProxy.connect(owner).updateBotCreationFee(newFee))
                .to.emit(iFactoryProxy, "BotCreationFeeUpdated")
                .withArgs(oldFee, newFee);

            expect(await iFactoryProxy.botCreationFee()).to.equal(newFee);
        });

        it("Should update init price", async function () {
            const { iFactoryProxy, owner } = await loadFixture(deployFixture);
            const newPrice = ethers.parseEther("0.002");
            const oldPrice = await iFactoryProxy.initPrice();

            await expect(iFactoryProxy.connect(owner).updateInitPrice(newPrice))
                .to.emit(iFactoryProxy, "initPriceUpdated")
                .withArgs(oldPrice, newPrice);

            expect(await iFactoryProxy.initPrice()).to.equal(newPrice);
        });
    });

    describe("Bot", function () {
        async function deployBotFixture() {
            const base = await deployFixture();
            const { iFactoryProxy, owner, user1, botCreationFee } = base;

            const instructionLengthFee = ethers.parseEther("0.001");
            const totalFee = botCreationFee + instructionLengthFee;

            const tx = await iFactoryProxy
                .connect(owner)
                .createBot(await user1.getAddress(), instructionLengthFee, { value: totalFee });

            const receipt = await tx.wait();
            const event = receipt?.logs.find((log) => {
                const decoded = iFactoryProxy.interface.parseLog(log as any);
                return decoded?.name === "BotCreated";
            });

            const botAddress = (event as any)["args"][0];
            const bot = (await ethers.getContractAt("iBot", botAddress)) as unknown as IBot;

            return {
                ...base,
                bot,
                botAddress,
            };
        }

        it("Should initialize bot correctly", async function () {
            const { bot, iFactoryProxy, user1 } = await loadFixture(deployBotFixture);

            expect(await bot.iFactory()).to.equal(await iFactoryProxy.getAddress());
            expect(await bot.creator()).to.equal(await user1.getAddress());
            expect(await bot.order()).to.equal(0n);
        });

        it("Should calculate correct ticket price", async function () {
            const { bot, iFactoryProxy } = await loadFixture(deployBotFixture);
            const initPrice = await iFactoryProxy.initPrice();

            expect(await bot.getPrice()).to.equal(initPrice);

            // Buy a ticket
            await bot.buyTicket({ value: initPrice });
            expect(await bot.order()).to.equal(1n);

            // New price should be higher
            const newPrice = await bot.getPrice();
            expect(newPrice).to.be.eq((initPrice * 3n) / 2n);
        });

        it("Should buy ticket and distribute fees correctly", async function () {
            const { bot, iFactoryProxy, user1, user2 } = await loadFixture(deployBotFixture);
            const price = await bot.getPrice();

            const protocolFee = (price * 15n) / 100n;
            const creatorFee = (price * 15n) / 100n;
            const poolFee = price - protocolFee - creatorFee;

            const initialFactoryBalance = await ethers.provider.getBalance(
                await iFactoryProxy.getAddress()
            );
            const initialCreatorBalance = await ethers.provider.getBalance(
                await user1.getAddress()
            );
            const initialBotBalance = await ethers.provider.getBalance(await bot.getAddress());

            await bot.connect(user2).buyTicket({ value: price });

            expect(
                await ethers.provider.getBalance(await iFactoryProxy.getAddress())
            ).to.approximately(initialFactoryBalance + protocolFee, 10n);

            expect(await ethers.provider.getBalance(await user1.getAddress())).to.approximately(
                initialCreatorBalance + creatorFee,
                10n
            );

            expect(await ethers.provider.getBalance(await bot.getAddress())).to.approximately(
                initialBotBalance + poolFee,
                10n
            );
        });

        it("Should handle excess payment when buying ticket", async function () {
            const { bot, user2 } = await loadFixture(deployBotFixture);
            const price = await bot.getPrice();
            const excess = ethers.parseEther("1");
            const totalPayment = price + excess;

            const beforeBalance = await ethers.provider.getBalance(await user2.getAddress());

            const tx = await bot.connect(user2).buyTicket({ value: totalPayment });
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

            const afterBalance = await ethers.provider.getBalance(await user2.getAddress());
            const actualCost = beforeBalance - afterBalance;

            // Actual cost should be price + gas fees
            expect(actualCost).to.be.closeTo(price + gasUsed, ethers.parseEther("0.0001"));
        });

        it("Should allow factory to pause and unpause", async function () {
            const { bot, iFactoryProxy, botAddress, owner } = await loadFixture(deployBotFixture);

            await expect(iFactoryProxy.connect(owner).pauseBot(botAddress))
                .to.emit(iFactoryProxy, "BotPaused")
                .withArgs(botAddress);

            expect(await bot.paused()).to.be.true;

            await expect(iFactoryProxy.connect(owner).unpauseBot(botAddress))
                .to.emit(iFactoryProxy, "BotUnpaused")
                .withArgs(botAddress);

            expect(await bot.paused()).to.be.false;
        });

        it("Should fail when non-owner tries to pause", async function () {
            const { iFactoryProxy, botAddress, user2 } = await loadFixture(deployBotFixture);

            await expect(
                iFactoryProxy.connect(user2).pauseBot(botAddress)
            ).to.be.revertedWithCustomError(iFactoryProxy, "UnauthorizedAccess");
        });

        // Previous test case update
        it("Should fail to buy ticket when paused", async function () {
            const { bot, iFactoryProxy, botAddress, owner, user2 } = await loadFixture(
                deployBotFixture
            );

            await iFactoryProxy.connect(owner).pauseBot(botAddress);

            const price = await bot.getPrice();

            await expect(
                bot.connect(user2).buyTicket({ value: price })
            ).to.be.revertedWithCustomError(bot, "EnforcedPause");
        });
    });
});
