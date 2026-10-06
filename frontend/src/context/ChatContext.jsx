import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { chatAPI } from '../services/api';

const ChatContext = createContext(null);

/**
 * Extracts a concise, professional topic name for the chat folder
 */
export const extractTopicName = (text) => {
  if (!text || typeof text !== 'string') return 'Campus Inquiry';
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Domain-specific topic matches for university categories
  if (
    lower.includes('placement') ||
    lower.includes('internship') ||
    lower.includes('job') ||
    lower.includes('tpo') ||
    lower.includes('spc') ||
    lower.includes('package') ||
    lower.includes('ctc') ||
    lower.includes('jinf') ||
    lower.includes('sinf')
  ) {
    return 'Placement Policy';
  }
  if (
    lower.includes('mid sem') ||
    lower.includes('mid-sem') ||
    lower.includes('end sem') ||
    lower.includes('end-sem') ||
    lower.includes('exam') ||
    lower.includes('datesheet') ||
    lower.includes('schedule')
  ) {
    return 'Exam Schedule';
  }
  if (
    lower.includes('attendance') ||
    lower.includes('condonation') ||
    lower.includes('detain') ||
    lower.includes('shortage')
  ) {
    return 'Attendance Rules';
  }
  if (
    lower.includes('hostel') ||
    lower.includes('mess') ||
    lower.includes('curfew') ||
    lower.includes('warden') ||
    lower.includes('room')
  ) {
    return 'Hostel Rules';
  }
  if (
    lower.includes('fee') ||
    lower.includes('scholarship') ||
    lower.includes('dues') ||
    lower.includes('refund')
  ) {
    return 'Fees & Scholarships';
  }
  if (
    lower.includes('course') ||
    lower.includes('syllabus') ||
    lower.includes('curriculum') ||
    lower.includes('branch') ||
    lower.includes('credit')
  ) {
    return 'Courses & Syllabus';
  }
  if (
    lower.includes('admission') ||
    lower.includes('cutoff') ||
    lower.includes('seat') ||
    lower.includes('counseling') ||
    lower.includes('counselling')
  ) {
    return 'Admissions & Cutoffs';
  }
  if (lower.includes('library') || lower.includes('book') || lower.includes('reading room')) {
    return 'Library Rules';
  }
  if (
    lower.includes('holiday') ||
    lower.includes('vacation') ||
    lower.includes('calendar') ||
    lower.includes('break')
  ) {
    return 'Academic Calendar';
  }
  if (
    lower.includes('club') ||
    lower.includes('fest') ||
    lower.includes('sports') ||
    lower.includes('gymkhana')
  ) {
    return 'Campus Activities';
  }

  // 2. Natural cleanup for custom user questions
  let stripped = clean.replace(/[?.,!":;]/g, '').trim();
  const prefixRegex =
    /^(can you (please )?|could you (please )?|please |give me (the )?|tell me (about )?|what is (the )?|what are (the )?|when is (the )?|when are (the )?|how to |how do i |explain (the )?|show me (the )?|summarize (the )?|summary of (the )?)/i;
  stripped = stripped.replace(prefixRegex, '').trim();
  if (!stripped) stripped = clean;

  const words = stripped.split(/\s+/).slice(0, 4);
  const title = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return title.length > 28 ? `${title.slice(0, 28)}...` : title || 'Campus Inquiry';
};

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?._id || user?.id || null;

  const currentUserIdRef = React.useRef(userId);

  // Clean up legacy fallback key if present
  useEffect(() => {
    try {
      localStorage.removeItem('campusgpt_chats_default_user');
      localStorage.removeItem('campusgpt_active_chat_id_default_user');
    } catch (e) {}
  }, []);

  const [chats, setChats] = useState(() => {
    if (!userId) return [];
    try {
      const saved = localStorage.getItem(`campusgpt_chats_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load chats from localStorage:', e);
    }
    return [];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    if (!userId) return null;
    try {
      const active = localStorage.getItem(`campusgpt_active_chat_id_${userId}`);
      if (active) return active;
      const saved = localStorage.getItem(`campusgpt_chats_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0].id;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  // Sync state cleanly when user identity changes
  useEffect(() => {
    currentUserIdRef.current = userId;

    if (!userId) {
      setChats([]);
      setActiveChatId(null);
      return;
    }

    const storageKey = `campusgpt_chats_${userId}`;
    const activeKey = `campusgpt_active_chat_id_${userId}`;

    try {
      const savedChats = localStorage.getItem(storageKey);
      if (savedChats) {
        const parsed = JSON.parse(savedChats);
        setChats(Array.isArray(parsed) ? parsed : []);
      } else {
        setChats([]);
      }
      setActiveChatId(localStorage.getItem(activeKey) || null);
    } catch (e) {
      setChats([]);
      setActiveChatId(null);
    }
  }, [userId]);

  // Persist chats strictly for the current active user (debounced for streaming performance)
  useEffect(() => {
    if (!userId || currentUserIdRef.current !== userId) return;
    const timer = setTimeout(() => {
      try {
        const storageKey = `campusgpt_chats_${userId}`;
        localStorage.setItem(storageKey, JSON.stringify(chats));
      } catch (e) {
        console.warn('Failed to persist chats:', e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [chats, userId]);

  // Persist activeChatId strictly for the current active user
  useEffect(() => {
    if (!userId || currentUserIdRef.current !== userId) return;
    try {
      const activeKey = `campusgpt_active_chat_id_${userId}`;
      if (activeChatId) {
        localStorage.setItem(activeKey, activeChatId);
      } else {
        localStorage.removeItem(activeKey);
      }
    } catch (e) {
      console.warn('Failed to persist activeChatId:', e);
    }
  }, [activeChatId, userId]);

  // Import existing history from backend database only once if user's local chats are completely empty
  useEffect(() => {
    if (!userId) return;

    const importBackendHistory = async () => {
      const storageKey = `campusgpt_chats_${userId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return;
        } catch (e) {}
      }

      const checkedKey = `campusgpt_checked_${userId}`;
      if (sessionStorage.getItem(checkedKey)) return;
      sessionStorage.setItem(checkedKey, 'true');

      try {
        const res = await chatAPI.getHistory();
        if (res?.data?.messages && res.data.messages.length > 0) {
          if (currentUserIdRef.current !== userId) return;

          const formattedMessages = res.data.messages.map((m) => ({
            id: m._id || `hist-${Date.now()}-${Math.random()}`,
            sender: m.role,
            text: m.content,
            sources: m.sources || [],
            timestamp: m.createdAt
              ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Earlier',
          }));

          const firstUserMsg = formattedMessages.find((m) => m.sender === 'user');
          const topicTitle = firstUserMsg ? extractTopicName(firstUserMsg.text) : 'Placement Policy';

          const importedChat = {
            id: `chat_${Date.now()}`,
            title: topicTitle,
            messages: formattedMessages,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          setChats([importedChat]);
          setActiveChatId(importedChat.id);
        }
      } catch (err) {
        // Non-blocking
      }
    };

    importBackendHistory();
  }, [userId]);

  // Resolve current active chat
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const activeMessages = activeChat ? activeChat.messages || [] : [];

  /**
   * Start a brand new empty chat session (guarantees empty chat stream)
   */
  const createNewChat = () => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setActiveChatId(newId);
    if (userId) {
      try {
        localStorage.setItem(`campusgpt_active_chat_id_${userId}`, newId);
      } catch (e) {}
    }
    return newId;
  };

  /**
   * Switch to an existing chat from the sidebar
   */
  const selectChat = (chatId) => {
    setActiveChatId(chatId);
    if (userId) {
      try {
        localStorage.setItem(`campusgpt_active_chat_id_${userId}`, chatId);
      } catch (e) {}
    }
  };

  /**
   * Rename a chat session
   */
  const renameChat = (chatId, newTitle) => {
    if (!newTitle || !newTitle.trim()) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, title: newTitle.trim(), updatedAt: Date.now() } : c
      )
    );
  };

  /**
   * Delete a chat session / folder
   */
  const deleteChat = (chatId, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      createNewChat();
    }
  };

  /**
   * Add a user message to the active chat session (storing in a new folder named by the topic)
   */
  const addMessageToActiveChat = (userMessage) => {
    let currentId = activeChatId;
    const exists = currentId && chats.some((c) => c.id === currentId);

    if (!exists) {
      currentId = currentId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setActiveChatId(currentId);
      try {
        localStorage.setItem(activeKey, currentId);
      } catch (e) {}

      // Name this new chat folder by the topic of the query
      const topicName = extractTopicName(userMessage.text);

      const newChat = {
        id: currentId,
        title: topicName || 'Campus Inquiry',
        messages: [userMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setChats((prev) => [newChat, ...prev]);
      return currentId;
    }

    // Existing session
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === currentId) {
          return {
            ...c,
            messages: [...(c.messages || []), userMessage],
            updatedAt: Date.now(),
          };
        }
        return c;
      })
    );

    return currentId;
  };

  /**
   * Add assistant response to a chat session
   */
  const addAssistantMessageToActiveChat = (assistantMessage, targetChatId) => {
    const targetId = targetChatId || activeChatId;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === targetId) {
          return {
            ...c,
            messages: [...(c.messages || []), assistantMessage],
            updatedAt: Date.now(),
          };
        }
        return c;
      })
    );
  };

  /**
   * Update an existing message in a chat session (for SSE streaming chunks, status, sources)
   */
  const updateMessageInChat = (messageId, updater, targetChatId) => {
    const targetId = targetChatId || activeChatId;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === targetId) {
          const updatedMessages = (c.messages || []).map((msg) => {
            if (msg.id === messageId) {
              return typeof updater === 'function' ? updater(msg) : { ...msg, ...updater };
            }
            return msg;
          });
          return {
            ...c,
            messages: updatedMessages,
            updatedAt: Date.now(),
          };
        }
        return c;
      })
    );
  };

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChatId,
        activeChat,
        activeMessages,
        createNewChat,
        selectChat,
        renameChat,
        deleteChat,
        addMessageToActiveChat,
        addAssistantMessageToActiveChat,
        updateMessageInChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
