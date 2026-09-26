import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { chatAPI } from '../services/api';
import {
  GraduationCap,
  Bot,
  User,
  ArrowUp,
  Plus,
  RotateCcw,
  FileText,
  ChevronDown,
  Sparkles,
  BookOpen,
  Calendar,
  ShieldAlert,
  Building,
  Menu,
} from 'lucide-react';

const SUGGESTED_PROMPTS = [
  {
    icon: Building,
    label: 'Placement Policy',
    prompt: 'Give me detail placement policy and eligibility criteria.',
  },
  {
    icon: Calendar,
    label: 'Mid-Sem Examination',
    prompt: 'When are the mid semester examinations scheduled for 7th semester CSE?',
  },
  {
    icon: ShieldAlert,
    label: 'Attendance Regulations',
    prompt: 'What is the minimum attendance requirement to appear in examinations?',
  },
  {
    icon: BookOpen,
    label: 'Hostel Rules',
    prompt: 'What are the hostel curfew timings and disciplinary rules?',
  },
];

const Assistant = ({ onOpenMobileNav }) => {
  const { user } = useAuth();
  const {
    activeChatId,
    activeMessages,
    createNewChat,
    addMessageToActiveChat,
    addAssistantMessageToActiveChat,
  } = useChat();
  const location = useLocation();
  const navigate = useNavigate();

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages, isTyping]);

  // Handle URL query ?new=true
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('new') === 'true') {
      createNewChat();
      navigate('/assistant', { replace: true });
    }
  }, [location.search, navigate, createNewChat]);

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputValue).trim();
    if (!query || isTyping) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Save message into active chat session (or create new chat in folder if needed)
    const targetChatId = addMessageToActiveChat(userMsg);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsTyping(true);

    try {
      const response = await chatAPI.sendMessage(query);
      const {
        answer,
        sources,
        clarification,
      } = response.data;

      const assistantMsg = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: answer,
        sources: sources || [],
        clarification: clarification || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      addAssistantMessageToActiveChat(assistantMsg, targetChatId);
    } catch (err) {
      let friendlyError = `Sorry, I encountered an issue retrieving university documents: ${err.message}`;
      if (err.status === 429 || err.message?.includes('429') || err.message?.includes('Too many requests')) {
        friendlyError = "You're sending messages too quickly. Please wait a moment and try again.";
      }

      const errorMsg = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: friendlyError,
        isError: true,
        sources: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      addAssistantMessageToActiveChat(errorMsg, targetChatId);
    } finally {
      setIsTyping(false);
    }
  };

  const handleReset = () => {
    createNewChat();
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="flex flex-col h-full bg-campus-bg text-campus-text select-text">
      {/* Minimal Top Bar (No CampusGpt title above chat - kept in sidebar only) */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-campus-border/50 bg-campus-bg/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onOpenMobileNav && (
            <button
              onClick={onOpenMobileNav}
              className="md:hidden p-1.5 rounded-lg text-campus-muted hover:text-white hover:bg-campus-card transition-colors"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>

        <button
          onClick={handleReset}
          title="Start new conversation"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-campus-card hover:bg-zinc-700/60 border border-campus-border transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>New chat</span>
        </button>
      </header>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto w-full">
          {/* Empty State / Welcome Hero */}
          {activeMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-campus-card border border-campus-border text-blue-400 flex items-center justify-center mb-4 shadow-sm">
                <GraduationCap className="w-7 h-7" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-sm text-campus-muted max-w-md mt-2 leading-relaxed">
                Ask anything about NIT Kurukshetra — admissions, courses, examinations, hostel rules, or placement policies.
              </p>

              {/* Classic Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-8">
                {SUGGESTED_PROMPTS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="p-3.5 rounded-xl border border-campus-border bg-campus-card/70 hover:bg-campus-card hover:border-zinc-500 text-left transition-all duration-150 group shadow-sm"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-white mb-1">
                        <Icon className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                        <span>{item.label}</span>
                      </div>
                      <p className="text-xs text-campus-muted line-clamp-2 leading-relaxed">
                        {item.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Active Message List */
            <div className="space-y-6 pb-4">
              {activeMessages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-lg bg-campus-card border border-campus-border text-blue-400 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5 shadow-sm">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm'
                          : msg.isError
                          ? 'bg-red-500/10 border border-red-500/30 text-red-300 rounded-tl-sm'
                          : 'bg-campus-card/90 border border-campus-border text-campus-text rounded-tl-sm shadow-sm'
                      }`}
                    >
                      {/* Message Content */}
                      <div className="text-sm leading-relaxed">
                        {isUser ? (
                          <div className="whitespace-pre-wrap">{msg.text}</div>
                        ) : (
                          <div className="space-y-2">
                            <ReactMarkdown
                              components={{
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-white tracking-wide">{children}</strong>
                                ),
                                p: ({ children }) => (
                                  <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="space-y-1.5 my-2 list-disc pl-5 marker:text-blue-400">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="space-y-1.5 my-2 list-decimal pl-5 marker:text-blue-400">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="leading-relaxed pl-0.5">{children}</li>
                                ),
                                h1: ({ children }) => (
                                  <h1 className="text-base font-bold text-white mt-3 mb-1.5 tracking-tight">{children}</h1>
                                ),
                                h2: ({ children }) => (
                                  <h2 className="text-sm sm:text-base font-bold text-white mt-3 mb-1.5 tracking-tight">{children}</h2>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="text-sm font-semibold text-white mt-2.5 mb-1">{children}</h3>
                                ),
                                code: ({ inline, children }) =>
                                  inline ? (
                                    <code className="px-1.5 py-0.5 rounded bg-campus-bg text-blue-300 font-mono text-xs">
                                      {children}
                                    </code>
                                  ) : (
                                    <pre className="p-3 my-2 rounded-lg bg-campus-bg border border-campus-border overflow-x-auto text-xs font-mono text-zinc-200">
                                      <code>{children}</code>
                                    </pre>
                                  ),
                              }}
                            >
                              {msg.text}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

                      {/* Interactive Clarification Options (if applicable) */}
                      {!isUser && msg.clarification?.options && msg.clarification.options.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-campus-border/70 space-y-2">
                          <p className="text-xs font-medium text-blue-300">Select an option:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.clarification.options.map((option, optIdx) => (
                              <button
                                key={optIdx}
                                onClick={() => handleSendMessage(option)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-campus-bg hover:bg-zinc-700/60 border border-campus-border text-campus-subtext hover:text-white transition-colors"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Clean Collapsed Sources Accordion */}
                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <details className="mt-3 pt-2.5 border-t border-campus-border/50 text-xs text-campus-muted group">
                          <summary className="cursor-pointer hover:text-white flex items-center gap-1.5 font-medium select-none py-0.5 transition-colors">
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                            <span>{msg.sources.length} Verified Sources</span>
                            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 ml-auto" />
                          </summary>
                          <div className="mt-2 space-y-1.5 pt-1">
                            {msg.sources.map((src, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2.5 rounded-lg bg-campus-bg/70 border border-campus-border/60 text-[11px] text-campus-subtext"
                              >
                                <div className="font-medium text-white flex items-center justify-between gap-2">
                                  <span className="truncate">{src.documentTitle || 'Official Document'}</span>
                                  {src.pageNumber && (
                                    <span className="font-mono text-[10px] text-campus-muted flex-shrink-0">
                                      Page {src.pageNumber}
                                    </span>
                                  )}
                                </div>
                                {src.text && (
                                  <p className="text-campus-muted mt-1 line-clamp-2 leading-relaxed">
                                    {src.text}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-campus-card border border-campus-border text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-campus-card/90 border border-campus-border text-campus-muted text-sm flex items-center gap-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-150" />
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-300" />
                    <span className="text-xs ml-1 text-campus-muted">Searching official documents...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Input (ChatGPT Style) */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-gradient-to-t from-campus-bg via-campus-bg to-transparent">
        <div className="max-w-3xl mx-auto w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="rounded-2xl border border-campus-border bg-campus-card/95 focus-within:border-zinc-500 shadow-md p-2 flex items-end gap-2 transition-colors"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about NIT Kurukshetra..."
              className="w-full bg-transparent text-sm text-campus-text placeholder-campus-muted px-2 py-1.5 focus:outline-none resize-none max-h-40 min-h-[24px]"
            />

            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              aria-label="Send message"
              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                inputValue.trim() && !isTyping
                  ? 'bg-white text-zinc-900 hover:bg-zinc-200'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-campus-border/60'
              }`}
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          </form>

          <p className="text-[11px] text-campus-muted text-center mt-2">
            CampusGpt answers are grounded in official NIT Kurukshetra documents.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Assistant;
