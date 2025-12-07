// utils/q402.ts

export async function createPaymentHeader(signerAddress: string, paymentDetails: any) {
  const witness = paymentDetails.witness;
  const targetChainIdHex = "0x" + witness.domain.chainId.toString(16); // e.g., '0x61' for 97

  try {
    // 1. FORCE NETWORK SWITCH (The Fix)
    // We check if the user is on the right chain. If not, we move them.
    const currentChainId = await (window as any).ethereum.request({ method: 'eth_chainId' });
    
    if (currentChainId !== targetChainIdHex) {
        console.log(`⚠️ Wrong Chain (${currentChainId}). Switching to ${targetChainIdHex}...`);
        try {
            await (window as any).ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: targetChainIdHex }],
            });
        } catch (switchError: any) {
            // This error code means the chain has not been added to Metamask.
            if (switchError.code === 4902) {
                alert("Please add BNB Testnet to your Metamask!");
                throw new Error("Network not found");
            }
            throw switchError;
        }
    }

    // 2. Sign the EIP-712 Witness
    const signature = await (window as any).ethereum.request({
        method: "eth_signTypedData_v4",
        params: [signerAddress, JSON.stringify({
            domain: witness.domain,
            types: {
                EIP712Domain: [
                    { name: "name", type: "string" },
                    { name: "version", type: "string" },
                    { name: "chainId", type: "uint256" },
                    { name: "verifyingContract", type: "address" }
                ],
                ...witness.types
            },
            primaryType: witness.primaryType,
            message: witness.message
        })]
    });

    // 3. Construct Payload
    const payload = {
        witnessSignature: signature,
        paymentDetails: paymentDetails 
    };

    return btoa(JSON.stringify(payload));

  } catch (error) {
    console.error("Q402 Signing Failed:", error);
    throw error;
  }
}