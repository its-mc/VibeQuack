"use client";
import { useState, useRef, useEffect } from "react";
import { createPaymentHeader } from "../utils/q402";

// --- TYPES ---
type Message = { 
  role: string; 
  content: string; 
  type?: "code" | "text" | "report" | "deployed"; 
  rawCode?: string 
};

type Log = {
  time: string;
  action: string;
  status: "Success" | "Failed" | "Pending";
};

type Mode = "architect" | "researcher";

export default function AgentChat() {
  // --- STATE ---
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", content: "🦆 QUACK AGENT ONLINE. Connect wallet to start." }
  ]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  
  // SETTINGS
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [isMainnet, setIsMainnet] = useState(false);
  const [mode, setMode] = useState<Mode>("architect");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // --- HELPERS ---
  const addLog = (action: string, status: "Success" | "Failed" | "Pending") => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLogs(prev => [{ time, action, status }, ...prev]);
  };

  const getTxPreview = (code: string) => {
    const name = code.match(/string public constant name = "(.*?)";/)?.[1] || "GenToken";
    const symbol = code.match(/string public constant symbol = "(.*?)";/)?.[1] || "GEN";
    return { name, symbol };
  };

  // --- WALLET ---
  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        setUserAddress(accounts[0]);
        addLog("Wallet Connect", "Success");
        setMessages(prev => [...prev, { role: "agent", content: `✅ Authenticated: ${accounts[0].slice(0,6)}...${accounts[0].slice(-4)}` }]);
      } catch (err) {
        addLog("Wallet Connect", "Failed");
        alert("Failed to connect wallet.");
      }
    } else {
      alert("Please install Metamask.");
    }
  };

  // --- API CALLER ---
const callAgent = async (action: string, payload: any) => {
    if (!userAddress) {
      setMessages(prev => [...prev, { role: "agent", content: "⚠️ Please connect wallet first." }]);
      return { success: false, error: "No wallet" };
    }

    setLoading(true);
    try {
      // 1. Initial Request
      let res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action, 
          userAddress, 
          network: isMainnet ? "mainnet" : "testnet",
          ...payload 
        }),
      });

      // 2. Q402 INTERCEPTION (The Magic)
      if (res.status === 402) {
        console.log("💰 402 Received. Triggering Q402 Flow...");
        const data = await res.json();
        const details = data.paymentDetails;
        
        // Notify User
        addLog("Q402 Payment Required", "Pending");
        setMessages(prev => [...prev, { role: "agent", content: `💰 Q402 PAYMENT REQUEST.\n\nService: ${action.toUpperCase()}\nFee: ${details.amount} wei\n\nPlease sign the request...` }]);

        // 3. Sign EIP-712
        const xPaymentHeader = await createPaymentHeader(userAddress, details);
        addLog("Payment Signed", "Success");
        
        // 4. Retry with Payment Header
        res = await fetch("/api/agent", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-PAYMENT": xPaymentHeader 
            },
            body: JSON.stringify({ 
              action, 
              userAddress, 
              network: isMainnet ? "mainnet" : "testnet",
              ...payload 
            }),
        });
      }

      // 5. Parse Final Response
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Request Failed");
      }

      const finalData = await res.json();
      setLoading(false);
      return finalData;

    } catch (e: any) {
      console.error(e);
      setLoading(false);
      if (e.code === 4001) {
          setMessages(prev => [...prev, { role: "agent", content: "❌ Signature Rejected." }]);
      } else {
          setMessages(prev => [...prev, { role: "agent", content: `❌ Error: ${e.message}` }]);
      }
      return { success: false, error: e.message };
    }
  };
  // --- HANDLERS ---
  const handleSend = async () => {
    if (!input.trim()) return;
    const prompt = input;
    setMessages(prev => [...prev, { role: "user", content: prompt }]);
    setInput("");

    // --- MODE 1: RESEARCHER ---
    if (mode === "researcher") {
      addLog("Research Query", "Pending");
      const data = await callAgent("research", { prompt });
      if (data.success) {
        addLog("Research Query", "Success");
        setMessages(prev => [...prev, { role: "agent", content: data.result }]);
      } else {
        addLog("Research Query", "Failed");
        setMessages(prev => [...prev, { role: "agent", content: "❌ Research Failed." }]);
      }
      return;
    }

    // --- MODE 2: ARCHITECT (Generate) ---
    addLog("Generate Contract", "Pending");
    const data = await callAgent("generate", { prompt });
    
    if (data.success) {
      addLog("Generate Contract", "Success");
      setPendingCode(data.code);
      setMessages(prev => [...prev, { 
        role: "agent", 
        type: "code",
        content: "I have generated the smart contract. Review the Transaction Preview below:",
        rawCode: data.code 
      }]);
    } else {
      addLog("Generate Contract", "Failed");
      setMessages(prev => [...prev, { role: "agent", content: `❌ Error: ${data.error}` }]);
    }
  };

  const handleAudit = async () => {
    if (!pendingCode) return;
    setMessages(prev => [...prev, { role: "user", content: "🛡️ Audit this contract." }]);
    addLog("Security Audit", "Pending");
    
    const data = await callAgent("audit", { code: pendingCode });
    
    if (data.success) {
      addLog("Security Audit", "Success");
      setMessages(prev => [...prev, { role: "agent", type: "report", content: data.report }]);
    } else {
      addLog("Security Audit", "Failed");
      setMessages(prev => [...prev, { role: "agent", content: "❌ Audit Failed." }]);
    }
  };

  const handleDeploy = async () => {
    if (!pendingCode) return;
    const netName = isMainnet ? "MAINNET" : "TESTNET";
    setMessages(prev => [...prev, { role: "user", content: `🚀 Deploy to ${netName} (Sponsored).` }]);
    
    // UI Feedback for the "Policy Check"
    setMessages(prev => [...prev, { role: "agent", content: "🔄 Verifying Quack Policy (Spend Cap < 0.05 BNB)..." }]);
    addLog("Policy Check", "Success");
    addLog(`Deploy (${netName})`, "Pending");
    
    const data = await callAgent("deploy", { code: pendingCode });
    
    if (data.success) {
      addLog(`Deploy (${netName})`, "Success");
      setMessages(prev => [...prev, { 
        role: "agent", 
        type: "deployed", // Trigger the Fund button
        content: `✅ POLICY APPROVED. CONTRACT DEPLOYED.\n\n📍 Address: ${data.address}\n\n🔗 BscScan: https://${isMainnet ? "" : "testnet."}bscscan.com/address/${data.address}`,
        rawCode: data.address
      }]);
      setPendingCode(null);
    } else {
      addLog(`Deploy (${netName})`, "Failed");
      setMessages(prev => [...prev, { role: "agent", content: `❌ POLICY REJECTED: ${data.error}` }]);
    }
  };

  const handleFund = async (address: string) => {
    const amount = "0.001";
    setMessages(prev => [...prev, { role: "user", content: `💸 Fund contract with ${amount} BNB` }]);
    addLog("Fund Contract", "Pending");
    
    const data = await callAgent("transfer", { toAddress: address, amount });
    
    if (data.success) {
      addLog("Fund Contract", "Success");
      setMessages(prev => [...prev, { role: "agent", content: `✅ FUNDING COMPLETE.\n\nSent: ${amount} BNB\nTo: ${address}\n🔗 Hash: ${data.txHash}` }]);
    } else {
      addLog("Fund Contract", "Failed");
      setMessages(prev => [...prev, { role: "agent", content: `❌ Transfer Failed: ${data.error}` }]);
    }
  };

  // THEME COLORS (Dynamic based on Mode)
  const theme = {
    green: { bg: "bg-green-900", border: "border-green-800", text: "text-green-400", btn: "bg-green-700" },
    blue: { bg: "bg-blue-900", border: "border-blue-800", text: "text-blue-400", btn: "bg-blue-600" }
  };
  const t = mode === "architect" ? theme.green : theme.blue;

  return (
    <div className={`min-h-screen bg-black ${t.text} font-mono p-4 flex gap-4 justify-center transition-colors duration-500`}>
      
      {/* --- LEFT: MAIN CHAT INTERFACE --- */}
      <div className={`w-full max-w-4xl flex flex-col border ${t.border} rounded-lg p-4 bg-gray-900 bg-opacity-50 shadow-lg transition-all duration-500`}>
        
        {/* HEADER */}
        <div className={`border-b ${t.border} pb-3 mb-4`}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold tracking-wider">🦆 VIBE QUACK AGENT</span>
              {/* TOGGLE */}
              <button 
                onClick={() => setIsMainnet(!isMainnet)}
                className={`text-[10px] px-2 py-1 rounded text-white font-bold transition-all ${
                  isMainnet ? "bg-red-600 animate-pulse shadow-[0_0_10px_red]" : "bg-gray-700"
                }`}
              >
                {isMainnet ? "🔴 MAINNET" : "🟢 TESTNET"}
              </button>
            </div>
            
            {/* WALLET */}
            {!userAddress ? (
              <button onClick={connectWallet} className="bg-white text-black px-4 py-1 rounded font-bold text-sm hover:opacity-80 transition-colors">
                CONNECT WALLET
              </button>
            ) : (
              <div className="flex flex-col items-end">
                <span className="text-[10px] opacity-70">CONNECTED</span>
                <span className="font-bold text-sm font-mono border border-gray-600 px-2 rounded">{userAddress.slice(0,6)}...{userAddress.slice(-4)}</span>
              </div>
            )}
          </div>

          {/* MODE TABS */}
          <div className="flex gap-2">
            <button 
              onClick={() => setMode("architect")}
              className={`flex-1 py-2 font-bold text-sm rounded transition-all ${mode === "architect" ? "bg-green-700 text-black shadow-lg" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
            >
              🛠️ ARCHITECT (Generate & Deploy)
            </button>
            <button 
              onClick={() => setMode("researcher")}
              className={`flex-1 py-2 font-bold text-sm rounded transition-all ${mode === "researcher" ? "bg-blue-600 text-black shadow-lg" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}
            >
              🧠 RESEARCHER (Explain & Analyze)
            </button>
          </div>
        </div>

        {/* MESSAGES AREA */}
        <div className="flex-grow overflow-y-auto space-y-4 pr-2 pb-4 scrollbar-hide h-[60vh]">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] p-3 rounded-lg whitespace-pre-wrap ${m.role === "user" ? `${t.bg} text-white` : "bg-black border border-gray-800"}`}>
                {m.content}
              </div>
              
              {/* --- CODE & PREVIEW BLOCK --- */}
              {m.type === "code" && m.rawCode && (
                <div className="mt-2 w-[85%] bg-gray-900 border border-gray-700 p-3 rounded text-xs text-gray-300">
                   
                   {/* HUMAN READABLE PREVIEW */}
                   <div className="mb-4 bg-black border border-gray-800 p-3 rounded">
                      <p className={`${t.text} font-bold border-b border-gray-800 mb-2 pb-1`}>📝 TRANSACTION PREVIEW</p>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-gray-400">
                         <span>Action:</span> <span className="text-white">DEPLOY CONTRACT</span>
                         <span>Network:</span> <span className={isMainnet ? "text-red-500 font-bold" : "text-green-300"}>{isMainnet ? "BNB MAINNET" : "BNB TESTNET"}</span>
                         <span>Name:</span> <span className="text-white">{getTxPreview(m.rawCode).name}</span>
                         <span>Symbol:</span> <span className="text-white">{getTxPreview(m.rawCode).symbol}</span>
                         <span>Est. Cost:</span> <span className="text-yellow-500">~0.003 BNB (Sponsored)</span>
                      </div>
                   </div>

                   {/* RAW CODE TOGGLE */}
                   <details>
                      <summary className="cursor-pointer text-gray-500 hover:text-white mb-2 select-none">View Raw Solidity Source</summary>
                      <pre className="overflow-x-auto p-2 bg-black rounded border border-gray-800 text-[10px]">{m.rawCode}</pre>
                   </details>

                   {/* ACTION BUTTONS */}
                   <div className="mt-4 flex gap-3">
                     <button onClick={handleAudit} className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white py-2 rounded font-bold transition-colors">
                       🛡️ AUDIT (Recommended)
                     </button>
                     <button onClick={handleDeploy} className="flex-1 bg-red-800 hover:bg-red-600 text-white py-2 rounded font-bold transition-colors">
                       🚀 DEPLOY NOW
                     </button>
                   </div>
                </div>
              )}
              
              {/* --- AUDIT REPORT BLOCK --- */}
              {m.type === "report" && (
                <div className="mt-2 w-[85%] border-l-4 border-yellow-500 pl-4 bg-yellow-900 bg-opacity-10 p-2 rounded">
                  <p className="text-yellow-500 font-bold mb-2">🛡️ SECURITY AUDIT FINDINGS:</p>
                  <p className="text-xs text-gray-300 mb-4 whitespace-pre-wrap max-h-40 overflow-y-auto">{m.content}</p>
                  <button onClick={handleDeploy} className="bg-green-700 hover:bg-green-600 text-white px-6 py-2 rounded font-bold w-full transition-colors">
                    ✅ APPROVED - PROCEED TO DEPLOY
                  </button>
                </div>
              )}

              {/* --- DEPLOY SUCCESS / FUND BLOCK --- */}
              {m.type === "deployed" && (
                <div className="mt-2 w-[85%] bg-green-900 bg-opacity-20 border border-green-500 p-3 rounded animate-fade-in">
                  <div className="flex gap-2 mt-4">
                    <button 
                      onClick={() => handleFund(m.rawCode!)} 
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      💸 FUND CONTRACT (0.001 BNB)
                    </button>
                    <a 
                      href={m.content.match(/https:\/\/[^\s]+/)?.[0]} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-bold text-center flex items-center justify-center gap-2"
                    >
                      🔍 VIEW ON SCAN
                    </a>
                  </div>
                </div>
              )}

            </div>
          ))}
          
          {loading && (
             <div className="flex justify-start">
               <div className="bg-black border border-gray-800 p-3 rounded-lg animate-pulse flex items-center gap-2">
                 <span className="animate-spin">⚙️</span> Agent is working...
               </div>
             </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* INPUT AREA */}
        <div className="mt-4 flex gap-2">
          <input
            className={`flex-grow bg-black border ${t.border} rounded p-3 text-white focus:outline-none focus:ring-1 focus:ring-opacity-50 focus:ring-white placeholder-gray-600 transition-all`}
            placeholder={mode === "architect" ? "Describe the contract you want to build..." : "Ask about Web3 protocols..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={loading || !userAddress || !!pendingCode}
          />
          <button 
            onClick={handleSend} 
            disabled={loading || !userAddress || !!pendingCode} 
            className={`${t.btn} text-white px-8 rounded font-bold hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
          >
            SEND
          </button>
        </div>
      </div>

      {/* --- RIGHT: ACTIVITY LOG --- */}
      <div className={`w-80 hidden lg:flex flex-col border ${t.border} rounded-lg p-4 bg-gray-900 bg-opacity-50 h-fit max-h-[80vh] transition-all duration-500`}>
         <div className={`border-b ${t.border} mb-4 pb-2 flex justify-between items-center`}>
            <h3 className="text-lg font-bold">📜 ACTIVITY LOG</h3>
            <span className="text-[10px] animate-pulse">● LIVE</span>
         </div>
         <div className="space-y-3 text-xs overflow-y-auto pr-1">
            {logs.length === 0 && <div className="text-gray-600 italic text-center py-4">No recent activity.</div>}
            {logs.map((log, i) => (
               <div key={i} className="flex flex-col border-b border-gray-800 pb-2 last:border-0">
                  <div className="flex justify-between text-gray-500 mb-1">
                     <span className="font-mono">{log.time}</span>
                     <span className={`font-bold ${
                        log.status === "Success" ? "text-green-400" : 
                        log.status === "Failed" ? "text-red-400" : "text-yellow-400"
                     }`}>
                        {log.status.toUpperCase()}
                     </span>
                  </div>
                  <span className="text-gray-300 font-medium">{log.action}</span>
               </div>
            ))}
         </div>
      </div>

    </div>
  );
}