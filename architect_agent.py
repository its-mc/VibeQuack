import asyncio
import os
import re
import subprocess
from dotenv import load_dotenv
from chaingpt.client import ChainGPTClient
from chaingpt.models.smart_contract import SmartContractGeneratorRequestModel
from chaingpt.types import ChatHistoryMode

# --- CONFIG ---
load_dotenv()
# If .env fails, paste key here:
CHAINGPT_API_KEY = os.getenv("CHAINGPT_API_KEY") 

CONTRACTS_DIR = "./contracts"
CONTRACT_FILENAME = "GenContract.sol"

def clean_code_block(text):
    # Strips markdown code blocks
    pattern = r"```solidity(.*?)```"
    match = re.search(pattern, text, re.DOTALL)
    if match: return match.group(1).strip()
    return text.replace("```", "").strip()

async def main():
    if not CHAINGPT_API_KEY:
        print("❌ Error: Missing CHAINGPT_API_KEY in .env or script.")
        return

    client = ChainGPTClient(api_key=CHAINGPT_API_KEY)
    
    print("\n🏗️  WEB3 ARCHITECT AGENT (Next.js + Hardhat)")
    print("--------------------------------------------")
    prompt = input(">> What contract do you want? (e.g. 'A token named PizzaCoin'): ")
    
    # 1. GENERATE
    print("\n🧠 Generatiing Smart Contract code...")
    request = SmartContractGeneratorRequestModel(
        question=f"{prompt}. Name the contract 'GenContract'. Ensure Solidity ^0.8.20.",
        chatHistory=ChatHistoryMode.OFF
    )
    
    try:
        resp = await client.smart_contract.generate_contract(request)
    except Exception as e:
        print(f"❌ API Error: {e}")
        return

    if not resp.status:
        print(f"❌ ChainGPT Error: {resp.message}")
        return

    code = clean_code_block(resp.data.bot)
    
    # 2. SAVE TO FILE
    os.makedirs(CONTRACTS_DIR, exist_ok=True)
    file_path = os.path.join(CONTRACTS_DIR, CONTRACT_FILENAME)
    
    # Remove old file to be safe
    if os.path.exists(file_path):
        os.remove(file_path)
        
    with open(file_path, "w") as f:
        f.write(code)
    
    print(f"✅ Code saved to: {file_path}")
    print("\n--- PREVIEW ---")
    print(code[:200] + "...\n")

    # 3. DEPLOY
    confirm = input(">> Deploy to BNB Testnet now? (y/n): ")
    if confirm.lower() == 'y':
        print("\n🚀 Triggering Hardhat Deployment...")
        try:
            # We call 'npx hardhat run' from Python
            subprocess.run(
                ["npx", "hardhat", "run", "scripts/deploy.ts", "--network", "bscTestnet"], 
                check=True
            )
        except subprocess.CalledProcessError as e:
            print(f"❌ Deployment Failed: {e}")
    else:
        print("Creating contract only. Done.")

    await client.close()

if __name__ == "__main__":
    asyncio.run(main())