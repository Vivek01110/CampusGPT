import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { chatAPI } from '../services/api';
import {
  GraduationCap,
  Bot,
  User,
  ArrowUp,
  RotateCcw,
  FileText,
  ChevronDown,
  Sparkles,
  BookOpen,
  Calendar,
  ShieldAlert,
  Building,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

const getSourceUrl = (src) => {
  if (!src) return null;
  const url = src.sourceUrl || src.sourcePageUrl || src.url;
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // If relative path like /api/documents/:id/file
  const rawApiBase = import.meta.env.VITE_API_BASE_URL || '/api';
  const origin = rawApiBase.startsWith('http')
    ? rawApiBase.replace(/\/api\/?$/, '')
    : '';
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
};

const formatSourceDomain = (url) => {
  if (!url) return '';
  try {
    if (url.startsWith('http')) {
      const parsed = new URL(url);
      const filename = parsed.pathname.split('/').filter(Boolean).pop();
      if (filename && filename.length < 24) {
        return `${parsed.hostname}/.../${filename}`;
      }
      return parsed.hostname;
    }
    return 'View Document';
  } catch {
    return 'View Link';
  }
};

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

const formatMarkdownContent = (text) => {
  if (!text || typeof text !== 'string') return '';
  let processed = text;
  // Normalize LaTeX delimiters \( ... \) -> $ ... $ and \[ ... \] -> $$ ... $$
  processed = processed.replace(/\\\((.*?)\\\)/gs, '$$$1$$');
  processed = processed.replace(/\\\[(.*?)\\\]/gs, '$$$$$1$$$$');
  // Fix headings without space: e.g. "###Heading" -> "### Heading"
  processed = processed.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
  return processed;
};

const CodeBlock = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  const extractText = (elem) => {
    if (!elem) return '';
    if (typeof elem === 'string') return elem;
    if (typeof elem === 'number') return String(elem);
    if (Array.isArray(elem)) return elem.map(extractText).join('');
    if (elem?.props?.children) return extractText(elem.props.children);
    return '';
  };

  const rawCode = extractText(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-campus-border bg-[#141517] shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#1b1c20] border-b border-campus-border/70 text-[11px] text-campus-muted font-mono select-none">
        <span className="uppercase font-semibold tracking-wider text-zinc-400">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-zinc-700/60 hover:text-white transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed text-zinc-200">
        <code>{rawCode}</code>
      </pre>
    </div>
  );
};

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

  return (
    <div className="flex flex-col h-full bg-campus-bg text-campus-text select-text">
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
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                h1: ({ children }) => (
                                  <h1 className="text-lg sm:text-xl font-bold text-white mt-5 mb-2.5 tracking-tight first:mt-0 pb-1 border-b border-campus-border/40">
                                    {children}
                                  </h1>
                                ),
                                h2: ({ children }) => (
                                  <h2 className="text-base sm:text-lg font-bold text-white mt-4 mb-2 tracking-tight first:mt-0">
                                    {children}
                                  </h2>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="text-sm sm:text-base font-semibold text-white mt-3.5 mb-1.5 first:mt-0">
                                    {children}
                                  </h3>
                                ),
                                h4: ({ children }) => (
                                  <h4 className="text-xs sm:text-sm font-semibold text-zinc-300 mt-3 mb-1 first:mt-0">
                                    {children}
                                  </h4>
                                ),
                                p: ({ children }) => (
                                  <p className="mb-2.5 last:mb-0 leading-relaxed text-campus-text">
                                    {children}
                                  </p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="space-y-1.5 my-2.5 list-disc pl-5 marker:text-blue-400/80 leading-relaxed">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="space-y-1.5 my-2.5 list-decimal pl-5 marker:text-blue-400/80 leading-relaxed">
                                    {children}
                                  </ol>
                                ),
                                li: ({ children }) => (
                                  <li className="leading-relaxed pl-0.5 my-0.5">
                                    {children}
                                  </li>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-white tracking-wide">
                                    {children}
                                  </strong>
                                ),
                                em: ({ children }) => (
                                  <em className="italic text-zinc-300">{children}</em>
                                ),
                                pre: ({ children }) => {
                                  const codeProps = children?.props || {};
                                  return (
                                    <CodeBlock className={codeProps.className}>
                                      {codeProps.children || children}
                                    </CodeBlock>
                                  );
                                },
                                code: ({ node, className, children, ...props }) => {
                                  return (
                                    <code
                                      className="px-1.5 py-0.5 mx-0.5 rounded-md bg-[#141517] border border-campus-border/60 text-blue-300 font-mono text-[12px] font-medium"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                                table: ({ children }) => (
                                  <div className="my-3 overflow-x-auto rounded-xl border border-campus-border bg-campus-card/30 shadow-sm">
                                    <table className="min-w-full divide-y divide-campus-border text-left text-xs">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead className="bg-[#1b1c20] text-white border-b border-campus-border">{children}</thead>
                                ),
                                tbody: ({ children }) => (
                                  <tbody className="divide-y divide-campus-border/50 text-xs bg-campus-card/20">{children}</tbody>
                                ),
                                tr: ({ children }) => (
                                  <tr className="hover:bg-campus-card/50 transition-colors">{children}</tr>
                                ),
                                th: ({ children }) => (
                                  <th className="px-3.5 py-2.5 font-semibold text-white tracking-wider text-left">{children}</th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-3.5 py-2 text-campus-subtext leading-relaxed whitespace-normal">{children}</td>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote className="my-3 pl-3.5 border-l-2 border-blue-500 text-campus-muted italic bg-campus-bg/40 py-1.5 rounded-r-lg">
                                    {children}
                                  </blockquote>
                                ),
                                hr: () => <hr className="my-4 border-campus-border/70" />,
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors font-medium inline-flex items-center gap-0.5"
                                  >
                                    {children}
                                    <ExternalLink className="w-3 h-3 inline-block ml-0.5 opacity-70" />
                                  </a>
                                ),
                              }}
                            >
                              {formatMarkdownContent(msg.text)}
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
                          <div className="mt-2 space-y-2 pt-1">
                            {msg.sources.map((src, sIdx) => {
                              const sourceLink = getSourceUrl(src);
                              const displayDomain = formatSourceDomain(sourceLink);

                              return (
                                <div
                                  key={sIdx}
                                  className="p-2.5 rounded-lg bg-campus-bg/70 border border-campus-border/60 text-[11px] text-campus-subtext hover:border-campus-border transition-colors"
                                >
                                  <div className="font-medium text-white flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                                    {/* Source Name */}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span
                                        className="truncate font-semibold text-white"
                                        title={src.documentTitle || src.title || 'Official Document'}
                                      >
                                        {src.documentTitle || src.title || 'Official Document'}
                                      </span>
                                    </div>

                                    {/* Right side: Clickable URL with symbol & Page info */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                                      {src.pageDisplay ? (
                                        <span className="font-mono text-[10px] text-campus-muted px-1.5 py-0.5 rounded bg-campus-card border border-campus-border/40">
                                          {src.pageDisplay}
                                        </span>
                                      ) : src.pageNumber ? (
                                        <span className="font-mono text-[10px] text-campus-muted px-1.5 py-0.5 rounded bg-campus-card border border-campus-border/40">
                                          Page {src.pageNumber}
                                        </span>
                                      ) : null}

                                      {sourceLink && (
                                        <a
                                          href={sourceLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title={`Open official source URL: ${sourceLink}`}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all group/link"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <span className="max-w-[120px] sm:max-w-[180px] truncate underline decoration-blue-400/40 group-hover/link:decoration-blue-300">
                                            {displayDomain}
                                          </span>
                                          <ExternalLink className="w-3 h-3 flex-shrink-0 text-blue-400 group-hover/link:text-blue-300" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {src.text && (
                                    <p className="text-campus-muted mt-1.5 line-clamp-2 leading-relaxed text-[11px]">
                                      {src.text}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
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
