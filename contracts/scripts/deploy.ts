import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * torx402 Deployment Script
 * Deploys Privacy Pool contracts to specified network
 */

// Configuration
const DENOMINATION = process.env.POOL_DENOMINATION || "1000000000000000"; // 0.001 ETH
const MERKLE_TREE_HEIGHT = process.env.MERKLE_TREE_HEIGHT || 32;

// Deployment addresses will be saved here
const DEPLOYMENTS_DIR = path.join(__dirname, "../deployments");
const DEPLOYMENT_FILE = path.join(
  DEPLOYMENTS_DIR,
  `${process.env.HARDHAT_NETWORK || "localhost"}.json`
);

interface DeploymentAddresses {
  network: string;
  chainId: number;
  timestamp: number;
  hasher: string;
  verifier: string;
  privacyPool: string;
  denomination: string;
  merkleTreeHeight: number;
  deployer: string;
}

async function main() {
  console.log("========================================");
  console.log("torx402 - Privacy Pool Deployment");
  console.log("========================================");
  console.log("");

  // Get network info
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  if (balance === 0n) {
    console.error("❌ Error: Deployer has no balance!");
    console.error("Please fund the deployer address with testnet ETH");
    console.error("");
    console.error("For Base Sepolia, get testnet ETH from:");
    console.error("  1. Sepolia ETH: https://sepoliafaucet.com");
    console.error("  2. Bridge to Base Sepolia: https://bridge.base.org");
    process.exit(1);
  }

  console.log("Configuration:");
  console.log("  Denomination:", ethers.formatEther(DENOMINATION), "ETH");
  console.log("  Merkle Tree Height:", MERKLE_TREE_HEIGHT);
  console.log("  Max Deposits:", Math.pow(2, Number(MERKLE_TREE_HEIGHT)));
  console.log("");

  const deploymentAddresses: DeploymentAddresses = {
    network: network.name,
    chainId: Number(network.chainId),
    timestamp: Date.now(),
    hasher: "",
    verifier: "",
    privacyPool: "",
    denomination: DENOMINATION,
    merkleTreeHeight: Number(MERKLE_TREE_HEIGHT),
    deployer: deployer.address,
  };

  try {
    // Step 1: Deploy MiMC Hasher
    console.log("Step 1/3: Deploying MiMC Hasher...");
    const HasherFactory = await ethers.getContractFactory("MiMCMock");
    const hasher = await HasherFactory.deploy();
    await hasher.waitForDeployment();
    const hasherAddress = await hasher.getAddress();
    deploymentAddresses.hasher = hasherAddress;
    console.log("✓ MiMC Hasher deployed:", hasherAddress);
    console.log("");

    // Step 2: Deploy Verifier
    console.log("Step 2/3: Deploying Groth16 Verifier...");
    console.log(
      "NOTE: Make sure you've run 'npm run setup:circuits' first!"
    );

    const VerifierFactory = await ethers.getContractFactory("Verifier");
    const verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    deploymentAddresses.verifier = verifierAddress;
    console.log("✓ Verifier deployed:", verifierAddress);
    console.log("");

    // Step 3: Deploy Privacy Pool
    console.log("Step 3/3: Deploying Privacy Pool...");
    const PrivacyPoolFactory = await ethers.getContractFactory("PrivacyPool");
    const privacyPool = await PrivacyPoolFactory.deploy(
      verifierAddress,
      hasherAddress,
      DENOMINATION,
      MERKLE_TREE_HEIGHT
    );
    await privacyPool.waitForDeployment();
    const privacyPoolAddress = await privacyPool.getAddress();
    deploymentAddresses.privacyPool = privacyPoolAddress;
    console.log("✓ Privacy Pool deployed:", privacyPoolAddress);
    console.log("");

    // Verify deployment
    console.log("Verifying deployment...");
    const poolInfo = await privacyPool.getPoolInfo();
    console.log("  Pool Denomination:", ethers.formatEther(poolInfo[0]), "ETH");
    console.log("  Tree Height:", poolInfo[1]);
    console.log("  Next Leaf Index:", poolInfo[2]);
    console.log("  Current Root:", poolInfo[3]);
    console.log("  Pool Balance:", ethers.formatEther(poolInfo[4]), "ETH");
    console.log("");

    // Save deployment addresses
    console.log("Saving deployment addresses...");
    if (!fs.existsSync(DEPLOYMENTS_DIR)) {
      fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
    }
    fs.writeFileSync(
      DEPLOYMENT_FILE,
      JSON.stringify(deploymentAddresses, null, 2)
    );
    console.log("✓ Saved to:", DEPLOYMENT_FILE);
    console.log("");

    // Summary
    console.log("========================================");
    console.log("✓ Deployment Complete!");
    console.log("========================================");
    console.log("");
    console.log("Deployed Contracts:");
    console.log("  MiMC Hasher:  ", hasherAddress);
    console.log("  Verifier:     ", verifierAddress);
    console.log("  Privacy Pool: ", privacyPoolAddress);
    console.log("");
    console.log("Pool Configuration:");
    console.log("  Denomination: ", ethers.formatEther(DENOMINATION), "ETH");
    console.log("  Tree Height:  ", MERKLE_TREE_HEIGHT);
    console.log("  Network:      ", network.name);
    console.log("");

    // Contract verification instructions
    if (
      network.name === "baseSepolia" ||
      network.name === "arbitrumSepolia" ||
      network.name === "sepolia"
    ) {
      console.log("Next Steps:");
      console.log("1. Verify contracts on block explorer:");
      console.log("");
      console.log("   npx hardhat verify --network", network.name, hasherAddress);
      console.log("   npx hardhat verify --network", network.name, verifierAddress);
      console.log(
        "   npx hardhat verify --network",
        network.name,
        privacyPoolAddress,
        verifierAddress,
        hasherAddress,
        DENOMINATION,
        MERKLE_TREE_HEIGHT
      );
      console.log("");
      console.log("2. Test a deposit:");
      console.log("   cd ../client && npm run deposit");
      console.log("");
      console.log("3. Start facilitator server:");
      console.log("   cd ../server && npm run dev");
      console.log("");
    }

    // Add to .gitignore reminder
    console.log("⚠️  SECURITY REMINDER:");
    console.log("   Add deployments/*.json to .gitignore if it contains sensitive data");
    console.log("   Never commit private keys or secrets!");
    console.log("");

  } catch (error: any) {
    console.error("");
    console.error("========================================");
    console.error("❌ Deployment Failed!");
    console.error("========================================");
    console.error("");
    console.error("Error:", error.message);
    console.error("");

    if (error.message.includes("Verifier")) {
      console.error("Make sure you've generated the Verifier contract:");
      console.error("  cd ../circuits");
      console.error("  npm run setup");
      console.error("");
    }

    if (error.message.includes("insufficient funds")) {
      console.error("Insufficient funds for deployment!");
      console.error("Fund your deployer address:", deployer.address);
      console.error("");
    }

    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
