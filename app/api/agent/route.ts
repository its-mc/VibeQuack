import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

// --- CONFIG ---
const API_KEY = process.env.CHAINGPT_API_KEY;
const API_URL = "https://api.chaingpt.org/chat/stream";
const RPC_TESTNET = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const RPC_MAINNET = "https://bsc-dataseed.binance.org/";

export async function POST(req: Request) {
  try {
    const { action, prompt, code, userAddress, network } = await req.json();

    if (!API_KEY) return NextResponse.json({ error: "Server Error: Missing ChainGPT API Key." }, { status: 500 });

    // 🦆 QUACK POLICY CHECK (Global)
    if (!userAddress) {
       return NextResponse.json({ error: "Policy Violation: No authenticated wallet." }, { status: 403 });
    }
    const incomingUser = userAddress.toLowerCase();
    const DENY_LIST = ["0xdead00000000000000000000000000000000beef"]; 
    if (DENY_LIST.includes(incomingUser)) {
        return NextResponse.json({ error: "❌ Policy Violation: Address Denylisted." }, { status: 403 });
    }

    // =========================================================
    // ACTION: RESEARCH (Web3 General Chat)
    // =========================================================
    if (action === "research") {
      console.log(`🔎 Researching: ${prompt}`);
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "general_assistant", // <--- THE RESEARCH MODEL
          question: prompt,
          chatHistory: "on",
          sdkUniqueId: userAddress
        })
      });

      if (!response.ok) throw new Error("ChainGPT Research API Failed");

      const raw = await response.text();
      let result = "";
      try {
        result = JSON.parse(raw).data?.bot || raw;
      } catch { result = raw; }

      return NextResponse.json({ success: true, result });
    }

    // =========================================================
    // ACTION: GENERATE (Smart Contract Generator)
    // =========================================================
    if (action === "generate") {
      console.log(`🧠 Generating code for: ${prompt}`);
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "smart_contract_generator", // <--- THE CODING MODEL
          question: `RESPOND ONLY WITH PURE SOLIDITY CODE. NO MARKDOWN. NO EXPLANATION. 
          Create a contract named 'GenContract'. 
          IMPORTANT: Hardcode all values (name, symbol, supply) directly in the code. 
          DO NOT require constructor arguments. 
          Ensure Solidity ^0.8.20. 
          User Prompt: ${prompt}`,
          chatHistory: "on",
          sdkUniqueId: userAddress
        })
      });

      const raw = await response.text();
      let generatedCode = "";
      try { generatedCode = JSON.parse(raw).data?.bot || raw; } catch { generatedCode = raw; }
      generatedCode = generatedCode.replace(/```solidity/g, "").replace(/```/g, "").trim();

      return NextResponse.json({ success: true, code: generatedCode });
    }

    // =========================================================
    // ACTION: AUDIT
    // =========================================================
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

    // =========================================================
    // ACTION: DEPLOY (Hardhat + Spend Cap)
    // =========================================================
    if (action === "deploy") {
      const isMainnet = network === "mainnet";
      const networkFlag = isMainnet ? "bscMainnet" : "bscTestnet";
      const targetRpc = isMainnet ? RPC_MAINNET : RPC_TESTNET;

      // SPEND CAP CHECK
      const SPEND_CAP_BNB = 0.05; 
      const gasPriceRes = await fetch(targetRpc, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc:"2.0", method:"eth_gasPrice", params:[], id:1 })
      });
      const gasJson = await gasPriceRes.json();
      const gasPriceWei = parseInt(gasJson.result, 16);
      const estimatedCostBNB = (gasPriceWei * 3000000) / 10**18;

      if (estimatedCostBNB > SPEND_CAP_BNB) {
          return NextResponse.json({ error: `❌ Spend Cap Exceeded. Cost: ${estimatedCostBNB.toFixed(4)} BNB.` }, { status: 403 });
      }

      // EXECUTE
      const contractsDir = path.join(process.cwd(), "contracts");
      if (!fs.existsSync(contractsDir)) fs.mkdirSync(contractsDir);
      fs.writeFileSync(path.join(contractsDir, "GenContract.sol"), code);

      const { stdout } = await execAsync(`npx hardhat run scripts/deploy.cjs --network ${networkFlag}`);
      const match = stdout.match(/deployed to: (0x[a-fA-F0-9]{40})/);
      const address = match ? match[1] : "Error: Address not found";

      return NextResponse.json({ success: true, address, logs: stdout });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}