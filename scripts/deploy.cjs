const hre = require("hardhat");

async function main() {
  console.log("👷 Hardhat: Deploying GenContract...");

  const contractName = "GenContract";
  const contract = await hre.ethers.deployContract(contractName);

  await contract.waitForDeployment();

  console.log(`SUCCESS! Contract deployed to: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});