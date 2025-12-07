"use client";
import { useState, useRef, useEffect } from "react";

// --- TYPES ---
type Message = { 
  role: string; 
  content: string; 
  type?: "code" | "text" | "report"; 
  rawCode?: string 
};

type Log = {
  time: string;
  action: string;
  status: "Success" | "Failed" | "Pending";
};

export default function AgentChat() {
  // --- STATE ---
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", content: "🦆 QUACK AGENT ONLINE. Connect your wallet to authenticate." }
  ]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  
  // SETTINGS
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [isMainnet, setIsMainnet] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // --- HELPERS ---
  const addLog = (action: string, status: "Success" | "Failed" | "Pending") => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLogs(prev => [{ time, action, status }, ...prev]);
  };

  const getTxPreview = (code: string) => {
    // Regex to find Solidity variables
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
      setMessages(prev => [...prev, { role: "agent", content: "⚠️ ACCESS DENIED: Please connect your wallet first." }]);
      return { success: false, error: "No wallet" };
    }

    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action, 
          userAddress, 
          network: isMainnet ? "mainnet" : "testnet",
          ...payload 
        }),
      });
      const data = await res.json();
      setLoading(false);
      return data;
    } catch (e) {
      setLoading(false);
      return { success: false, error: "Connection Failed" };
    }
  };

  // --- HANDLERS ---
  const handleSend = async () => {
    if (!input.trim()) return;
    const userPrompt = input;
    setMessages(prev => [...prev, { role: "user", content: userPrompt }]);
    setInput("");

    addLog("Generate Contract", "Pending");
    const data = await callAgent("generate", { prompt: userPrompt });
    
    if (data.success) {
      addLog("Generate Contract", "Success");
      setPendingCode(data.code);
      setMessages(prev => [...prev, { 
        role: "agent", 
        type: "code",
        content: "I have generated the smart contract. Review the Transaction Preview below:",
        rawCode: data.code 
      }]);
    } else if (data.error) {
      addLog("Generate Contract", "Failed");
      setMessages(prev => [...prev, { role: "agent", content: `❌ Error: ${data.error}` }]);
    }
  };

  const handleAudit = async () => {
    if (!pendingCode) return;
    setMessages(prev => [...prev, { role: "user", content: "🛡️ Audit this contract." }]);
    addLog("AI Security Audit", "Pending");
    
    const data = await callAgent("audit", { code: pendingCode });
    
    if (data.success) {
      addLog("AI Security Audit", "Success");
      setMessages(prev => [...prev, { role: "agent", type: "report", content: data.report }]);
    } else {
      addLog("AI Security Audit", "Failed");
      setMessages(prev => [...prev, { role: "agent", content: "❌ Audit Failed." }]);
    }
  };

  const handleDeploy = async () => {
    if (!pendingCode) return;
    const netName = isMainnet ? "MAINNET" : "TESTNET";
    setMessages(prev => [...prev, { role: "user", content: `🚀 Deploy to ${netName} (Sponsored).` }]);
    
    // UI Feedback for the "Policy Check"
    setMessages(prev => [...prev, { role: "agent", content: "🔄 Verifying Spend Cap & Allowlist Policy..." }]);
    addLog("Policy Check", "Success");
    addLog(`Deploy (${netName})`, "Pending");
    
    const data = await callAgent("deploy", { code: pendingCode });
    
    if (data.success) {
      addLog(`Deploy (${netName})`, "Success");
      setMessages(prev => [...prev, { 
        role: "agent", 
        content: `✅ POLICY APPROVED. CONTRACT DEPLOYED.\n\n📍 Address: ${data.address}\n\n🔗 BscScan: https://${isMainnet ? "" : "testnet."}bscscan.com/address/${data.address}` 
      }]);
      setPendingCode(null);
    } else {
      addLog(`Deploy (${netName})`, "Failed");
      setMessages(prev => [...prev, { role: "agent", content: `❌ POLICY REJECTED: ${data.error}` }]);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex gap-4 justify-center">
      
      {/* --- LEFT: MAIN CHAT INTERFACE --- */}
      <div className="w-full max-w-4xl flex flex-col border border-green-800 rounded-lg p-4 bg-gray-900 bg-opacity-50 shadow-[0_0_30px_rgba(0,255,0,0.1)]">
        
        {/* HEADER */}
        <div className="border-b border-green-800 pb-3 mb-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-wider">🦆 VIBE QUACK AGENT</span>
            
            {/* TOGGLE */}
            <button 
              onClick={() => setIsMainnet(!isMainnet)}
              className={`text-[10px] px-2 py-1 rounded text-white font-bold transition-all ${
                isMainnet ? "bg-red-600 animate-pulse shadow-[0_0_10px_red]" : "bg-green-700 hover:bg-green-600"
              }`}
            >
              {isMainnet ? "🔴 MAINNET" : "🟢 TESTNET"}
            </button>
          </div>
          
          {/* WALLET */}
          {!userAddress ? (
            <button onClick={connectWallet} className="bg-green-600 hover:bg-green-500 text-black px-4 py-1 rounded font-bold text-sm transition-colors">
              CONNECT WALLET
            </button>
          ) : (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-green-300">CONNECTED</span>
              <span className="font-bold text-sm font-mono">{userAddress.slice(0,6)}...{userAddress.slice(-4)}</span>
            </div>
          )}
        </div>

        {/* MESSAGES AREA */}
        <div className="flex-grow overflow-y-auto space-y-4 pr-2 pb-4 scrollbar-hide h-[60vh]">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] p-3 rounded-lg whitespace-pre-wrap ${m.role === "user" ? "bg-green-900 text-white" : "bg-black border border-green-700"}`}>
                {m.content}
              </div>
              
              {/* --- CODE & PREVIEW BLOCK --- */}
              {m.type === "code" && m.rawCode && (
                <div className="mt-2 w-[85%] bg-gray-900 border border-gray-700 p-3 rounded text-xs text-gray-300">
                   
                   {/* HUMAN READABLE PREVIEW */}
                   <div className="mb-4 bg-black border border-green-900 p-3 rounded">
                      <p className="text-green-500 font-bold border-b border-green-900 mb-2 pb-1">📝 TRANSACTION PREVIEW</p>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-gray-400">
                         <span>Action:</span> <span className="text-white">DEPLOY CONTRACT</span>
                         <span>Network:</span> <span className={isMainnet ? "text-red-500 font-bold" : "text-green-300"}>{isMainnet ? "BNB MAINNET" : "BNB TESTNET"}</span>
                         <span>Token Name:</span> <span className="text-white">{getTxPreview(m.rawCode).name}</span>
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
            </div>
          ))}
          
          {loading && (
             <div className="flex justify-start">
               <div className="bg-black border border-green-700 p-3 rounded-lg animate-pulse text-yellow-400 flex items-center gap-2">
                 <span className="animate-spin">⚙️</span> Agent is working...
               </div>
             </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* INPUT AREA */}
        <div className="mt-4 flex gap-2">
          <input
            className="flex-grow bg-black border border-green-600 rounded p-3 text-white focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 placeholder-green-800 transition-all"
            placeholder={userAddress ? "Describe the contract you want to build..." : "Please connect wallet to start..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={loading || !userAddress || !!pendingCode}
          />
          <button 
            onClick={handleSend} 
            disabled={loading || !userAddress || !!pendingCode} 
            className="bg-green-700 px-8 rounded font-bold text-black hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            SEND
          </button>
        </div>
      </div>

      {/* --- RIGHT: ACTIVITY LOG --- */}
      <div className="w-80 hidden lg:flex flex-col border border-green-800 rounded-lg p-4 bg-gray-900 bg-opacity-50 h-fit max-h-[80vh]">
         <div className="border-b border-green-800 mb-4 pb-2 flex justify-between items-center">
            <h3 className="text-lg font-bold">📜 ACTIVITY LOG</h3>
            <span className="text-[10px] text-green-500 animate-pulse">● LIVE</span>
         </div>
         <div className="space-y-3 text-xs overflow-y-auto pr-1">
            {logs.length === 0 && <div className="text-gray-600 italic text-center py-4">No recent activity.</div>}
            {logs.map((log, i) => (
               <div key={i} className="flex flex-col border-b border-green-900 pb-2 last:border-0">
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