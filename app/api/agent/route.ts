import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { verifyPayment, settlePayment } from "../../../lib/q402";

const execAsync = util.promisify(exec);

// --- CONFIG ---
const API_KEY = process.env.CHAINGPT_API_KEY;
const API_URL = "https://api.chaingpt.org/chat/stream";
const RPC_TESTNET = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const RPC_MAINNET = "https://bsc-dataseed.binance.org/";

function addressToUUID(address: string) {
  const clean = address.replace("0x", "").toLowerCase().padEnd(32, "0");
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

export async function POST(req: Request) {
  try {
    // 1. READ BODY ONCE (Fixes "Body already read" error)
    const body = await req.json();
    const { action, prompt, code, userAddress, network, toAddress, amount } = body;

    console.log(`🔹 API Request Action: [${action}] from [${userAddress}]`);

    // 2. BASIC CHECKS
    if (!API_KEY) return NextResponse.json({ error: "Server Error: Missing ChainGPT API Key." }, { status: 500 });
    if (!userAddress) return NextResponse.json({ error: "Policy Violation: No authenticated wallet." }, { status: 403 });

    // 3. 🛡️ POLICY CHECK: DENY LIST
    const incomingUser = userAddress.toLowerCase();
    const DENY_LIST = [
        "0xdead00000000000000000000000000000000beef",
        //"0x9dF95D6b0Fa0F09C6a90B60D1B7F79167195EDB1".toLowerCase()
    ]; 
    
    if (DENY_LIST.includes(incomingUser)) {
        console.log(`🛑 BLOCKED: User ${incomingUser} is on the Deny List.`);
        return NextResponse.json({ error: "❌ Policy Violation: Wallet Address is Denylisted." }, { status: 403 });
    }

    // =========================================================
    // 💰 Q402 PAYMENT GATE (The Cherry on Top)
    // =========================================================
    // We charge for 'audit' and 'deploy' actions
    const PAID_ACTIONS = ["audit", "deploy"];

    if (PAID_ACTIONS.includes(action)) {
        const paymentHeader = req.headers.get("x-payment");

        if (!paymentHeader) {
            console.log(`💰 Q402: Demand Payment for ${action}`);
            
            const witnessData = {
                domain: {
                    name: "q402",
                    version: "1",
                    chainId: network === "mainnet" ? 56 : 97,
                    verifyingContract: "0x0000000000000000000000000000000000000000"
                },
                types: {
                    Witness: [
                        { name: "owner", type: "address" },
                        { name: "token", type: "address" },
                        { name: "amount", type: "uint256" },
                        { name: "to", type: "address" },
                        { name: "deadline", type: "uint256" },
                        { name: "paymentId", type: "bytes32" },
                        { name: "nonce", type: "uint256" }
                    ]
                },
                primaryType: "Witness",
                message: {
                    owner: userAddress,
                    token: "0x0000000000000000000000000000000000000000", // Native Token
                    amount: "100000000000000", // 0.0001 BNB Cost (String required for BigInt)
                    to: "0x9dF95D6b0Fa0F09C6a90B60D1B7F79167195EDB1", // Agent Treasury
                    deadline: Math.floor(Date.now() / 1000) + 3600,
                    paymentId: "0x" + Math.random().toString(16).slice(2).padEnd(64, '0'),
                    nonce: Date.now().toString() // String required
                }
            };

            return NextResponse.json({
                error: "Payment Required",
                paymentDetails: {
                    scheme: "evm/eip7702-delegated-payment",
                    networkId: network === "mainnet" ? "bsc-mainnet" : "bsc-testnet",
                    amount: witnessData.message.amount,
                    witness: witnessData
                }
            }, { status: 402 });
        }

        // VERIFY HEADER IF PRESENT
        try {
            const buffer = Buffer.from(paymentHeader, 'base64');
            const payload = JSON.parse(buffer.toString('utf-8'));
            
            const isValid = await verifyPayment(payload);
            if (!isValid) throw new Error("Invalid Signature");
            
            await settlePayment(payload);
            console.log("✅ Q402: Payment Verified & Settled.");
        } catch (e) {
            console.error("❌ Payment Verification Failed:", e);
            return NextResponse.json({ error: "Invalid Payment Signature" }, { status: 403 });
        }
    }

    // =========================================================
    // EXECUTION LOGIC
    // =========================================================

    if (action === "research") {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "general_assistant",
                question: prompt,
                chatHistory: "on",
                sdkUniqueId: addressToUUID(userAddress)
            })
        });
        const raw = await response.text();
        let result = "";
        try { result = JSON.parse(raw).data?.bot || raw; } catch { result = raw; }
        return NextResponse.json({ success: true, result });
    }

    if (action === "generate") {
        console.log(`🧠 Generating code for: ${prompt}`);
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "smart_contract_generator",
                question: `RESPOND ONLY WITH PURE SOLIDITY CODE. NO MARKDOWN. 
                Create a contract named 'GenContract'. 
                IMPORTANT: Hardcode all values (name, symbol, supply) directly in the code. 
                DO NOT require constructor arguments. 
                REQUIRED: Include 'receive() external payable {}' function.
                Ensure Solidity ^0.8.20. 
                User Prompt: ${prompt}`,
                chatHistory: "on",
                sdkUniqueId: addressToUUID(userAddress)
            })
        });
        const raw = await response.text();
        let generatedCode = "";
        try { generatedCode = JSON.parse(raw).data?.bot || raw; } catch { generatedCode = raw; }
        generatedCode = generatedCode.replace(/```solidity/g, "").replace(/```/g, "").trim();
        return NextResponse.json({ success: true, code: generatedCode });
    }

    if (action === "audit") {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "smart_contract_auditor",
                question: `Audit this Solidity code for security flaws:\n\n${code}`,
                chatHistory: "off"
            })
        });
        const raw = await response.text();
        let report = "";
        try { report = JSON.parse(raw).data?.bot || raw; } catch { report = raw; }
        return NextResponse.json({ success: true, report });
    }

    if (action === "deploy") {
        const isMainnet = network === "mainnet";
        const networkFlag = isMainnet ? "bscMainnet" : "bscTestnet";
        const targetRpc = isMainnet ? RPC_MAINNET : RPC_TESTNET;

        console.log(`🚀 Preparing Deployment to ${networkFlag}...`);

        // 🛡️ POLICY CHECK: SPEND CAP
        const SPEND_CAP_BNB = 0.05; 
        
        try {
            const gasPriceRes = await fetch(targetRpc, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc:"2.0", method:"eth_gasPrice", params:[], id:1 })
            });
            const gasJson = await gasPriceRes.json();
            const gasPriceWei = parseInt(gasJson.result, 16);
            
            // Conservative estimation (3M Gas)
            const estimatedCostBNB = (gasPriceWei * 3000000) / 10**18;

            console.log(`💰 Estimated Gas Cost: ${estimatedCostBNB.toFixed(5)} BNB`);

            if (estimatedCostBNB > SPEND_CAP_BNB) {
                return NextResponse.json({ 
                    error: `❌ Policy Violation: Spend Cap Exceeded. Cost: ${estimatedCostBNB.toFixed(4)} BNB.` 
                }, { status: 403 });
            }
        } catch (e) {
            console.error("Gas estimation failed, proceeding with caution.");
        }

        // EXECUTE DEPLOY
        const contractsDir = path.join(process.cwd(), "contracts");
        if (!fs.existsSync(contractsDir)) fs.mkdirSync(contractsDir);
        fs.writeFileSync(path.join(contractsDir, "GenContract.sol"), code);

        const { stdout } = await execAsync(`npx hardhat run scripts/deploy.cjs --network ${networkFlag}`);
        const match = stdout.match(/deployed to: (0x[a-fA-F0-9]{40})/);
        const address = match ? match[1] : "Error: Address not found";

        return NextResponse.json({ success: true, address, logs: stdout });
    }

    if (action === "transfer") {
        console.log(`💸 Funding Contract: ${toAddress} with ${amount} BNB`);
        const networkFlag = network === "mainnet" ? "bscMainnet" : "bscTestnet";

        const scriptContent = `
const hre = require("hardhat");
async function main() {
  const [signer] = await hre.ethers.getSigners();
  const tx = await signer.sendTransaction({
    to: "${toAddress}",
    value: hre.ethers.parseEther("${amount}")
  });
  await tx.wait();
  console.log("TxHash:", tx.hash);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
        const scriptPath = path.join(process.cwd(), "scripts", "fund.cjs");
        fs.writeFileSync(scriptPath, scriptContent);

        try {
            const { stdout } = await execAsync(`npx hardhat run scripts/fund.cjs --network ${networkFlag}`);
            const match = stdout.match(/TxHash: (0x[a-fA-F0-9]{64})/);
            const txHash = match ? match[1] : "hash-not-found";
            return NextResponse.json({ success: true, txHash });
        } catch (error: any) {
            return NextResponse.json({ error: error.message || "Transfer Failed" }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}