import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, User, Loader, Sparkles, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import Papa from 'papaparse';
import { DataRow } from '../types';

interface AIChatProps {
  productionData: DataRow[];
  materialData: DataRow[];
  khsxData: DataRow[];
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

const AIChat: React.FC<AIChatProps> = ({ productionData, materialData, khsxData }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Xin chào! Tôi đã kết nối với dữ liệu. Do lượng dữ liệu lớn, tôi sẽ tự động lọc thông tin liên quan nhất đến câu hỏi của bạn để trả lời chính xác.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Gemini Client
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- SMART DATA PROCESSING ---

  // 1. Remove columns that are completely empty to save tokens
  const removeEmptyColumns = (data: DataRow[]): DataRow[] => {
    if (!data || data.length === 0) return [];
    
    // Find all keys that have at least one non-empty value
    const validKeys = new Set<string>();
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        const val = row[key];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          validKeys.add(key);
        }
      });
    });

    // Create new data with only valid keys
    return data.map(row => {
      const newRow: Record<string, any> = {};
      Array.from(validKeys).forEach(key => {
        newRow[key] = row[key];
      });
      return newRow;
    });
  };

  // 2. Score rows based on match with user input
  // Returns a subset of data: Matches + Top Recent Rows to fill limit
  const getSmartContext = (data: DataRow[], userQuery: string, maxRows: number): DataRow[] => {
    if (!data || data.length === 0) return [];

    const cleanData = removeEmptyColumns(data);
    const lowerQuery = userQuery.toLowerCase().trim();
    const queryTokens = lowerQuery.split(/\s+/).filter(t => t.length > 2); // Only matches words > 2 chars

    if (!lowerQuery || queryTokens.length === 0) {
        // No specific query, return top rows up to limit
        return cleanData.slice(0, maxRows);
    }

    // Separate matches and non-matches
    const matches: DataRow[] = [];
    const nonMatches: DataRow[] = [];

    cleanData.forEach(row => {
        const rowStr = Object.values(row).join(' ').toLowerCase();
        // Check if row contains ANY of the significant query tokens
        // Or if the query is a direct substring
        if (rowStr.includes(lowerQuery) || queryTokens.some(token => rowStr.includes(token))) {
            matches.push(row);
        } else {
            nonMatches.push(row);
        }
    });

    // Strategy: Prioritize matches, fill rest with non-matches up to limit
    const result = [...matches];
    const remainingSlots = maxRows - result.length;
    
    if (remainingSlots > 0) {
        // Add some non-matches for context (e.g. recent items)
        result.push(...nonMatches.slice(0, remainingSlots));
    }

    return result;
  };

  const prepareContext = (userQuery: string, aggressiveness: 'normal' | 'high' = 'normal') => {
    // Aggressiveness determines row limits
    // Normal: Try to keep ~1000 rows per sheet (Good for 1M context)
    // High: Fallback if 1M exceeded, strict limit ~200 rows per sheet
    const limitProd = aggressiveness === 'normal' ? 800 : 150;
    const limitMat = aggressiveness === 'normal' ? 600 : 100;
    const limitKhsx = aggressiveness === 'normal' ? 300 : 50;

    const contextProd = getSmartContext(productionData, userQuery, limitProd);
    const contextMat = getSmartContext(materialData, userQuery, limitMat);
    const contextKhsx = getSmartContext(khsxData, userQuery, limitKhsx);

    const prodCsv = Papa.unparse(contextProd);
    const matCsv = Papa.unparse(contextMat);
    const khsxCsv = Papa.unparse(contextKhsx);

    return `
    Bạn là Trợ lý Quản lý Sản xuất (Production Manager Assistant).
    
    DỮ LIỆU ĐÃ ĐƯỢC LỌC THÔNG MINH (Contextual Data):
    Hệ thống đã tìm kiếm trong Database và trích xuất các dòng dữ liệu liên quan nhất đến câu hỏi: "${userQuery}".
    Ngoài ra còn bao gồm các dòng dữ liệu mới nhất để bạn nắm ngữ cảnh.

    1. DỮ LIỆU SẢN XUẤT (Production - ${contextProd.length} dòng):
    ${prodCsv}

    2. DỮ LIỆU VẬT TƯ (Material - ${contextMat.length} dòng):
    ${matCsv}

    3. DỮ LIỆU KHSX (Plan - ${contextKhsx.length} dòng):
    ${khsxCsv}

    NHIỆM VỤ:
    - Trả lời câu hỏi dựa trên dữ liệu trên.
    - Nếu tìm thấy thông tin khớp chính xác, hãy trả lời chi tiết.
    - Nếu không tìm thấy trong tập dữ liệu đã lọc này, hãy nói: "Không tìm thấy thông tin chi tiết trong các dòng dữ liệu liên quan nhất".
    - Trình bày Markdown chuyên nghiệp.
    `;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const currentInput = input;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentInput,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setIsRetrying(false);

    // CALL API WRAPPER with Retry Logic
    try {
      await callGemini(currentInput, 'normal');
    } catch (err: any) {
        console.warn("Normal attempt failed, retrying with aggressive filtering...", err);
        
        // Retry logic for 400 errors (likely token limit)
        if (err.message && (err.message.includes('400') || err.message.includes('token'))) {
            setIsRetrying(true);
            try {
                await callGemini(currentInput, 'high');
            } catch (retryErr: any) {
                console.error("Retry failed:", retryErr);
                handleError(retryErr);
            }
        } else {
            handleError(err);
        }
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  };

  const callGemini = async (userQuery: string, mode: 'normal' | 'high') => {
      const systemInstruction = prepareContext(userQuery, mode);
      
      const model = ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            // Keep history limited to prevent accumulating huge context
            ...messages.slice(-6).filter(m => m.id !== 'welcome').map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            })),
            { role: 'user', parts: [{ text: userQuery }] }
        ],
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.2,
        }
      });

      const response = await model;
      const responseText = response.text || "AI không trả về nội dung text.";

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText + (mode === 'high' ? '\n\n*(Đã tối ưu hóa dữ liệu để phù hợp giới hạn bộ nhớ)*' : ''),
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
  };

  const handleError = (err: any) => {
      let errorMsg = "Lỗi kết nối AI.";
      if (err instanceof Error) {
          errorMsg = err.message;
          if (errorMsg.includes('400')) errorMsg += " (Dữ liệu quá lớn - Vui lòng hỏi cụ thể hơn)";
          if (errorMsg.includes('429')) errorMsg += " (Quá tải - Vui lòng thử lại sau)";
      }
      setError(`Lỗi: ${errorMsg}`);
  };

  const clearHistory = () => {
    setMessages([
        {
          id: 'welcome',
          role: 'model',
          text: 'Đã xóa lịch sử. Tôi đã sẵn sàng tra cứu lại toàn bộ dữ liệu.',
          timestamp: new Date()
        }
    ]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 md:rounded-tl-2xl overflow-hidden relative">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-wood-100 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-inner">
            <Sparkles className="text-white w-5 h-5" />
            </div>
            <div>
            <h2 className="text-lg font-bold text-slate-800">Trợ lý AI (Smart Filter)</h2>
            <p className="text-xs text-slate-500">Tự động tìm & lọc dữ liệu liên quan</p>
            </div>
        </div>
        <button 
            onClick={clearHistory}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            title="Làm mới đoạn chat"
        >
            <RefreshCw size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar bg-slate-50/50">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-wood-600 text-white' : 'bg-white border border-slate-200 text-indigo-600'}`}>
               {msg.role === 'user' ? <User size={16} /> : <Bot size={18} />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[90%] md:max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-wood-600 text-white rounded-tr-sm' 
                  : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'
            }`}>
               {msg.text}
            </div>
          </div>
        ))}
        
        {isLoading && (
           <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-white border border-slate-200 text-indigo-600 flex items-center justify-center shadow-sm">
                 <Bot size={18} />
              </div>
              <div className="bg-white px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 flex items-center gap-2">
                 {isRetrying ? (
                    <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium animate-pulse">
                        <Zap size={14} /> Đang thử lại với bộ lọc tối ưu...
                    </div>
                 ) : (
                    <>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </>
                 )}
              </div>
           </div>
        )}

        {error && (
            <div className="flex justify-center my-4">
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-xs flex items-center gap-2 border border-red-200 shadow-sm max-w-md">
                    <AlertCircle size={16} className="shrink-0" /> 
                    <span className="font-mono">{error}</span>
                </div>
            </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-wood-100 z-10">
         <form onSubmit={handleSendMessage} className="relative flex items-center gap-2 max-w-4xl mx-auto">
             <input
               type="text"
               value={input}
               onChange={(e) => setInput(e.target.value)}
               placeholder="Hỏi chi tiết để AI tìm chính xác (Ví dụ: Tình trạng mã hàng V601?)"
               className="w-full pl-5 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm shadow-inner transition-all"
               disabled={isLoading}
             />
             <button 
                type="submit" 
                disabled={!input.trim() || isLoading}
                className="absolute right-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md"
             >
                {isLoading ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
             </button>
         </form>
         <div className="text-center mt-2">
            <p className="text-[10px] text-slate-400">
               Hệ thống tự động ưu tiên dữ liệu khớp với câu hỏi của bạn.
            </p>
         </div>
      </div>
    </div>
  );
};


export default AIChat;