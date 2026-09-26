import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import {
  GraduationCap,
  MessageSquare,
  FileText,
  BookOpen,
  Bell,
  LayoutDashboard,
  Shield,
  Plus,
  LogOut,
  Trash2,
  FolderArchive,
  Folder,
  FolderOpen,
  ChevronDown,
  X,
} from 'lucide-react';

const Sidebar = ({ mobileOpen, setMobileOpen }) => {
  const { user, isAdmin, logout } = useAuth();
  const { chats, activeChatId, createNewChat, selectChat, deleteChat } = useChat();
  const [chatsFolderOpen, setChatsFolderOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNewChat = () => {
    createNewChat();
    if (location.pathname !== '/assistant') {
      navigate('/assistant');
    }
    if (setMobileOpen) setMobileOpen(false);
  };

  const handleSelectChat = (chatId) => {
    selectChat(chatId);
    if (location.pathname !== '/assistant') {
      navigate('/assistant');
    }
    if (setMobileOpen) setMobileOpen(false);
  };

  const navItems = [
    { name: 'Documents', path: '/documents', icon: FileText },
    { name: 'Courses', path: '/courses', icon: BookOpen },
    { name: 'Notices', path: '/notices', icon: Bell },
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  ];

  if (isAdmin) {
    navItems.push({ name: 'Admin Portal', path: '/admin', icon: Shield });
  }

  const isActiveNav = (path) => location.pathname === path;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-campus-sidebar border-r border-campus-border text-campus-text select-none">
      {/* Top Header & Brand */}
      <div className="p-3.5 border-b border-campus-border/60 flex items-center justify-between">
        <Link
          to="/assistant"
          onClick={() => setMobileOpen && setMobileOpen(false)}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-white tracking-tight text-base">CampusGpt</span>
            <span className="block text-[10px] text-campus-muted leading-none">NIT Kurukshetra</span>
          </div>
        </Link>

        {/* Mobile close button */}
        {setMobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-campus-muted hover:text-white hover:bg-campus-card"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-campus-border bg-campus-card/70 hover:bg-campus-card text-zinc-100 text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 text-blue-400" />
          <span>New chat</span>
        </button>
      </div>

      {/* Scrollable Center: Chat Folder & Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
        {/* Previous Chats Folders */}
        <div>
          <button
            type="button"
            onClick={() => setChatsFolderOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-campus-muted hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <FolderArchive className="w-3.5 h-3.5 text-blue-400" />
              <span>Chat Folders</span>
            </span>
            <div className="flex items-center gap-1">
              {chats.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-campus-card text-campus-muted font-sans font-medium">
                  {chats.length}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-campus-muted transition-transform duration-200 ${
                  chatsFolderOpen ? '' : '-rotate-90'
                }`}
              />
            </div>
          </button>

          {chatsFolderOpen && (
            <div className="space-y-1 mt-1">
              {chats.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-campus-muted/70 italic text-left">
                  No saved chat folders yet.
                </p>
              ) : (
                chats.map((chat) => {
                  const isCurrent =
                    activeChatId === chat.id && location.pathname === '/assistant';
                  return (
                    <div
                      key={chat.id}
                      onClick={() => handleSelectChat(chat.id)}
                      className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-campus-card text-white font-medium border border-campus-border shadow-sm'
                          : 'text-campus-muted hover:text-white hover:bg-campus-card/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isCurrent ? (
                          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
                        ) : (
                          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-zinc-400 group-hover:text-blue-400 transition-colors" />
                        )}
                        <span className="truncate">{chat.title || 'Inquiry Topic'}</span>
                      </div>

                      {/* Delete folder/chat button */}
                      <button
                        onClick={(e) => deleteChat(chat.id, e)}
                        title="Delete chat folder"
                        className="opacity-70 md:opacity-0 md:group-hover:opacity-100 p-1 rounded hover:bg-zinc-700/60 hover:text-red-400 text-campus-muted transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Campus Navigation Links */}
        <div className="pt-2 border-t border-campus-border/60">
          <div className="text-[11px] font-mono uppercase tracking-wider text-campus-muted px-2 py-1">
            Explore Campus
          </div>
          <div className="space-y-1 mt-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveNav(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen && setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-campus-card text-white font-medium border border-campus-border/60'
                      : 'text-campus-muted hover:text-white hover:bg-campus-card/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-blue-400' : 'text-campus-muted'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Profile & Account Footer */}
      <div className="p-3 border-t border-campus-border/60 bg-campus-surface/30">
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg">
          <Link
            to="/profile"
            onClick={() => setMobileOpen && setMobileOpen(false)}
            className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-85 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-semibold uppercase flex-shrink-0">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-campus-muted truncate capitalize">
                {user?.role || 'Student'}
              </p>
            </div>
          </Link>

          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 rounded-md text-campus-muted hover:text-red-400 hover:bg-campus-card transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden md:flex flex-col w-64 h-screen flex-shrink-0 sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Responsive Overlay) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer content */}
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
