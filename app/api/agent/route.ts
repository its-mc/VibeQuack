import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";

// Promisify exec to use await
const execAsync = util.promisify(exec);

// --- CONFIGURATION ---
const API_KEY = process.env.CHAINGPT_API_KEY;
const API_URL = "https://api.chaingpt.org/chat/stream";
const RPC_TESTNET = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const RPC_MAINNET = "https://bsc-dataseed.binance.org/";

export async function POST(req: Request) {
  try {
    const { action, prompt, code, userAddress, network } = await req.json();

    // 1. API KEY CHECK
    if (!API_KEY) {
      return NextResponse.json({ error: "Server Error: Missing ChainGPT API Key." }, { status: 500 });
    }

    // =========================================================
    // 🦆 QUACK POLICY ENGINE (Simulated for Hackathon)
    // =========================================================
    
    // Policy 1: Authentication Required
    if (!userAddress) {
       return NextResponse.json({ error: "Policy Violation: No authenticated wallet found." }, { status: 403 });
    }

    // Policy 2: Deny List (Case Insensitive)
    const incomingUser = userAddress.toLowerCase();
    const DENY_LIST = [
        //"0x9df95d6b0fa0f09c6a90b60d1b7f79167195edb1", // Example blocked user
        "0xdead00000000000000000000000000000000beef"
    ]; 

    if (DENY_LIST.includes(incomingUser)) {
        console.log(`🛑 BLOCKED: User ${incomingUser} is on the Deny List.`);
        return NextResponse.json({ error: "❌ Policy Violation: Wallet Address is Denylisted." }, { status: 403 });
    }

    // =========================================================
    // ACTION 1: GENERATE (ChainGPT Generator)
    // =========================================================
    if (action === "generate") {
      console.log(`🧠 Generating code for: ${prompt}`);
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "smart_contract_generator",
          // PROMPT ENGINEERING: Force pure code output
          question: `RESPOND ONLY WITH PURE SOLIDITY CODE. NO MARKDOWN. NO EXPLANATION. 
Create a contract named 'GenContract'. 
IMPORTANT: Hardcode all values (name, symbol, supply) directly in the code or constructor. 
DO NOT require constructor arguments. 
Ensure Solidity ^0.8.20. 
User Prompt: ${prompt}`,
          chatHistory: "off"
        })
      });

      if (!response.ok) throw new Error("ChainGPT API Failed");

      const raw = await response.text();
      let generatedCode = "";
      
      // Attempt to parse JSON response, fallback to raw text
      try {
        generatedCode = JSON.parse(raw).data?.bot || raw;
      } catch { generatedCode = raw; }
      
      // Clean up markdown artifacts
      generatedCode = generatedCode.replace(/```solidity/g, "").replace(/```/g, "").trim();

      return NextResponse.json({ success: true, code: generatedCode });
    }

    // =========================================================
    // ACTION 2: AUDIT (ChainGPT Auditor)
    // =========================================================
    if (action === "audit") {
      console.log(`🛡️ Auditing code...`);
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "smart_contract_auditor",
          question: `Audit this Solidity code for security flaws and vulnerabilities:\n\n${code}`,
          chatHistory: "off"
        })
      });

      const raw = await response.text();
      let report = "";
      try {
        report = JSON.parse(raw).data?.bot || raw;
      } catch { report = raw; }

      return NextResponse.json({ success: true, report });
    }

    // =========================================================
    // ACTION 3: DEPLOY (Hardhat + Spend Cap Policy)
    // =========================================================
    if (action === "deploy") {
      const isMainnet = network === "mainnet";
      const networkFlag = isMainnet ? "bscMainnet" : "bscTestnet";
      const targetRpc = isMainnet ? RPC_MAINNET : RPC_TESTNET;

      console.log(`🚀 Preparing Deployment to ${networkFlag.toUpperCase()}...`);

      // --- POLICY 3: SPEND CAP CHECK ---
      // We check the gas price on-chain before even trying to compile
      const SPEND_CAP_BNB = 0.05; 
      
      const gasPriceRes = await fetch(targetRpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc:"2.0", method:"eth_gasPrice", params:[], id:1 })
      });
      const gasJson = await gasPriceRes.json();
      const gasPriceWei = parseInt(gasJson.result, 16);
      
      // Conservative estimation for deployment (3 Million Gas)
      const estimatedGasLimit = 3000000; 
      const estimatedCostWei = gasPriceWei * estimatedGasLimit;
      const estimatedCostBNB = estimatedCostWei / 10**18;

      console.log(`💰 Estimated Cost: ${estimatedCostBNB.toFixed(5)} BNB (Cap: ${SPEND_CAP_BNB})`);

      if (estimatedCostBNB > SPEND_CAP_BNB) {
          return NextResponse.json({ 
              error: `❌ Policy Violation: Spend Cap Exceeded. Cost: ${estimatedCostBNB.toFixed(4)} BNB.` 
          }, { status: 403 });
      }

      // --- EXECUTION ---
      // 1. Write the file
      const contractsDir = path.join(process.cwd(), "contracts");
      if (!fs.existsSync(contractsDir)) fs.mkdirSync(contractsDir);
      fs.writeFileSync(path.join(contractsDir, "GenContract.sol"), code);

      // 2. Run Hardhat (pointing to the .cjs script)
      // Note: We use the local 'npx' to ensure we use project dependencies
      const { stdout } = await execAsync(`npx hardhat run scripts/deploy.cjs --network ${networkFlag}`);
      
      console.log("Hardhat Output:", stdout);

      // 3. Extract Address from logs
      const match = stdout.match(/deployed to: (0x[a-fA-F0-9]{40})/);
      const address = match ? match[1] : "Error: Address not found in logs";

      return NextResponse.json({ success: true, address, logs: stdout });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown Server Error" }, { status: 500 });
  }
}