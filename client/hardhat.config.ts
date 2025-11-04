import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment from contracts directory
dotenv.config({ path: path.join(__dirname, "../contracts/.env") });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      accounts: {
        count: 10,
        accountsBalance: "10000000000000000000000", // 10000 ETH
      },
      // Enable console.log in contracts
      loggingEnabled: false,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
  },
  paths: {
    // Point to contracts directory (parent directory)
    sources: "../contracts/contracts",
    tests: "./test/integration",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
  mocha: {
    timeout: 120000, // 2 minutes for zk-SNARK proof generation in integration tests
    bail: false,
    allowUncaught: false,
    require: ["ts-node/register"],
  },
};

export default config;
