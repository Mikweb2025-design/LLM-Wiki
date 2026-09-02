import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { chatApi } from '../utils/api';
import { useVoice } from '../hooks/useVoice';
import ReactMarkdown from 'react-markdown';

// Inline mini chart for chat — reuse Analytics SVG logic without extra dep
function ChatMiniChart({ chart }) {
  if (!chart || !chart.chart_data || chart.chart_data.length === 0) return null;
  const data = chart.chart_data;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 420, h = 160, pad = 30;
  const barGap = 6;
  const barW = (w - pad*2 - barGap*(data.length-1)) / data.length;
  const colors = ['#4a9eff','#a855f7','#ec4899','#7ee787'];
  return (
    <div style={{ marginTop: '0.75rem', padding: '0.6rem', background: 'rgba(15,15,25,0.6)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
      <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '0.4rem', display:'flex', justifyContent:'space-between' }}>
        <span>📊 {chart.preset} • {chart.group_by} • {chart.sum_field}</span>
        <span style={{ color:'var(--accent-green)', fontWeight:600 }}>{chart.total?.toLocaleString('it-IT')}€ totale</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height:'160px' }}>
        {data.map((d,i)=>{
          const bh = (d.value/max)*(h-pad*2);
          const x = pad + i*(barW+barGap);
          const y = h - pad - bh;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={bh} rx="4" fill={colors[i%colors.length]} opacity="0.85" />
              <text x={x+barW/2} y={h-pad+11} textAnchor="middle" fontSize="7" fill="var(--text-secondary)">{d.label.length>8?d.label.slice(0,8)+'…':d.label}</text>
              <text x={x+barW/2} y={y-4} textAnchor="middle" fontSize="7" fill="var(--text-primary)" fontWeight="600">{d.value.toLocaleString('it-IT')}€</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const MessageBubble = memo(({ msg, onCopy, onSpeak }) => {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      animation: 'slideInRight 0.3s ease-out',
    }}>
      <div style={{
        maxWidth: '85%', borderRadius: '16px', padding: '0.75rem 1rem',
        background: isUser
          ? 'linear-gradient(135deg, var(--accent-green) 0%, var(--accent-blue) 100%)'
          : msg.error
          ? 'rgba(255,85,85,0.1)'
          : 'var(--bg-glass)',
        border: isUser
          ? 'none'
          : msg.error
          ? '1px solid rgba(255,85,85,0.2)'
          : '1px solid var(--border-glass)',
        color: isUser ? 'var(--bg-dark)' : 'var(--text-primary)',
        boxShadow: isUser ? '0 4px 20px rgba(126,231,135,0.2)' : 'none',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => { if (!isUser) e.currentTarget.style.transform = 'translateX(2px)'; }}
      onMouseLeave={(e) => { if (!isUser) e.currentTarget.style.transform = 'none'; }}
      >
        <div className="prose prose-sm max-w-none" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>

        {msg.chart && <ChatMiniChart chart={msg.chart} />}

        {msg.sources?.length > 0 && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-glass)' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
              SOURCES
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {msg.sources.map((s, i) => (
                <span key={i} style={{
                  fontSize: '0.7rem', background: 'rgba(74,158,255,0.1)', color: 'var(--accent-blue)',
                  padding: '0.15rem 0.5rem', borderRadius: '4px', fontFamily: 'var(--font-mono)',
                }}>{s.filename}</span>
              ))}
            </div>
          </div>
        )}

        {msg.role === 'assistant' && (
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => onCopy(msg.content)} style={{
                background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)', padding: 0,
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
              >[copy]</button>
              {onSpeak && (
                <button onClick={() => onSpeak(msg.content)} style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                  fontSize: '0.75rem', fontFamily: 'var(--font-mono)', padding: 0,
                }}
                onMouseEnter={(e) => e.target.style.color = 'var(--accent-green)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                >[speak]</button>
              )}
              {msg.provider && (
                <span style={{
                  fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '3px',
                  background: msg.provider === 'IONOS' ? 'rgba(74,158,255,0.15)' : 'rgba(126,231,135,0.15)',
                  color: msg.provider === 'IONOS' ? 'var(--accent-blue)' : 'var(--accent-green)',
                  fontFamily: 'var(--font-mono)',
                }}>{msg.provider}</span>
              )}
            </div>
            {msg.model && (
              <span style={{
                fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{msg.model}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false); // default off per stabilità — streaming riattivabile via toggle
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState([]);
  const messagesEndRef = useRef(null);
  const { isRecording, isProcessing, startRecording, stopRecording } = useVoice(
    (text) => {
      setInput(text);
      // Auto send after voice input
      setTimeout(() => {
        if (text.trim()) sendMessage(text);
      }, 500);
    }
  );

  useEffect(() => { loadModels(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadModels = async () => {
    try {
      const res = await chatApi.getModels();
      setModels(res.data.models || []);
      setSelectedModel(res.data.current);
    } catch (e) { console.error(e); }
  };

  const sendMessage = useCallback(async (messageText = null) => {
    const text = messageText || input;
    if (!text.trim() || isLoading) return;
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    const userInput = text;
    if (!messageText) setInput('');
    setIsLoading(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    // Streaming path (SSE) — performance percepita molto migliore + chart
    if (isStreaming) {
      let acc = '';
      // placeholder assistant msg per streaming
      setMessages((prev) => [...prev, { role: 'assistant', content: '', sources: [], chart: null, provider: '…', streaming: true }]);
      try {
        await chatApi.sendMessageStream(userInput, history, selectedModel || null,
          (token) => {
            acc += token;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.streaming) last.content = acc;
              return copy;
            });
          },
          (doneData) => {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.streaming) {
                last.streaming = false;
                last.sources = doneData?.sources || [];
                last.chart = doneData?.chart || null;
                last.model = doneData?.model || selectedModel || '';
                const mi = last.model || '';
                last.provider = mi.includes('(Ollama)') ? 'Ollama' : mi.includes('(IONOS)') ? 'IONOS' : 'AI';
              }
              return copy;
            });
          }
        );
      } catch (error) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.streaming) {
            last.content = `Error: ${error.message}`;
            last.error = true;
            last.streaming = false;
          } else {
            copy.push({ role: 'assistant', content: `Error: ${error.message}`, error: true });
          }
          return copy;
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Fallback non-streaming + chart
    try {
      const res = await chatApi.sendMessage(userInput, history, selectedModel || null);
      const modelInfo = res.data.model || selectedModel || '';
      const provider = modelInfo.includes('(Ollama)') ? 'Ollama' : modelInfo.includes('(IONOS)') ? 'IONOS' : 'AI';
      setMessages((prev) => [...prev, {
        role: 'assistant', content: res.data.answer,
        sources: res.data.sources, chart: res.data.chart || null, provider, model: modelInfo,
      }]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant', content: `Error: ${error.message}`, error: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedModel, isStreaming]);

  const clearChat = useCallback(() => setMessages([]), []);
  const copyMessage = useCallback((content) => { navigator.clipboard.writeText(content); }, []);
  const speakMessage = useCallback((content) => {
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'it-IT';
    window.speechSynthesis.speak(utterance);
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)',
      background: 'var(--bg-secondary)', borderRadius: '16px', overflow: 'hidden',
      border: '1px solid var(--border-glass)',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-glass)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600,
          color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem',
          letterSpacing: '-0.01em',
        }}>
          <span style={{ fontSize: '1.2rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>💬</span>
          Knowledge Chat
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isStreaming} onChange={(e) => setIsStreaming(e.target.checked)} style={{ accentColor: 'var(--accent-blue)' }} />
            stream
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
              borderRadius: '10px', padding: '0.4rem 0.8rem', fontSize: '0.8rem',
              color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none',
            }}
          >
            {models.map((m) => (
              <option key={m} value={m} style={{ backgroundColor: 'var(--bg-secondary)' }}>{m}</option>
            ))}
          </select>
          <button onClick={clearChat} style={{
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            color: 'var(--text-secondary)', padding: '0.35rem 0.8rem', borderRadius: '10px',
            cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.target.style.background = 'var(--bg-glass)'; e.target.style.color = 'var(--text-secondary)'; }}
          >[new]</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {messages.length === 0 && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem', opacity: 0.6 }}>📚</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 500, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Ask about your documents
            </p>
            <p style={{ fontSize: '0.8rem', fontFamily: 'var(--font-sans)' }}>e.g. "What does the PDF contain?"</p>
            <p style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)', marginTop:'0.6rem', opacity:0.8 }}>💡 Prova: "Fammi un grafico di tutti i miei guadagni" o "Quanto ho speso per benzina? fammi un grafico"</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={idx} msg={msg} onCopy={copyMessage} onSpeak={speakMessage} />
        ))}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              background: 'var(--bg-glass)', borderRadius: '16px', padding: '0.75rem 1rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              border: '1px solid var(--border-glass)',
            }}>
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                Processing
              </span>
              {['var(--accent-green)', 'var(--accent-blue)', 'var(--accent-purple)'].map((color, i) => (
                <div key={i} style={{
                  width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color,
                  animation: `pulsePulse 1.5s infinite ${i * 0.2}s`,
                }}></div>
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-primary)' }}>
        {/* Typing indicator */}
        {isLoading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem',
            fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)',
              animation: 'pulsePulse 1s infinite',
            }}></div>
            AI is typing...
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {/* Voice button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            style={{
              padding: '0.75rem 1rem', borderRadius: '12px', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer',
              background: isRecording ? 'rgba(255,85,85,0.15)' : isProcessing ? 'rgba(255,166,87,0.1)' : 'var(--bg-glass)',
              color: isRecording ? '#ff5555' : isProcessing ? 'var(--accent-orange)' : 'var(--accent-blue)',
              border: `1px solid ${isRecording ? 'rgba(255,85,85,0.2)' : 'var(--border-glass)'}`,
              transition: 'all 0.2s',
            }}
            title={isRecording ? 'Stop recording' : 'Start voice input'}
          >
            {isProcessing ? '⏳' : isRecording ? '⬛' : '🎤'}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Type your question..."
            style={{
              flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)',
              borderRadius: '12px', padding: '0.75rem 1rem', color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-green)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-glass)'}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              background: input.trim() ? 'var(--accent-gradient)' : 'var(--bg-tertiary)',
              color: input.trim() ? 'var(--bg-dark)' : 'var(--text-secondary)',
              border: 'none', borderRadius: '12px', cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '0.9rem', fontFamily: 'var(--font-mono)',
              opacity: isLoading ? 0.5 : 1, transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { if (input.trim() && !isLoading) e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { if (input.trim() && !isLoading) e.target.style.transform = 'none'; }}
          >
            [{'>'}]
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
