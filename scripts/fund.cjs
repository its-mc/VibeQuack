
const hre = require("hardhat");
async function main() {
  const [signer] = await hre.ethers.getSigners();
  const tx = await signer.sendTransaction({
    to: "0x3Afad2ACCbB4825a428C84F27A64D061660c0104",
    value: hre.ethers.parseEther("0.001")
  });
  await tx.wait();
  console.log("TxHash:", tx.hash);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
