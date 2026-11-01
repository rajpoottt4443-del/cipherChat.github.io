/**
 * CipherChat — Private, Secure & End-to-End Encrypted Messaging Platform
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ChatProvider, useChat } from './context/ChatContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { ChatArea } from './components/chat/ChatArea.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { NewChatModal } from './components/modals/NewChatModal.tsx';
import { ContactsModal } from './components/modals/ContactsModal.tsx';
import { SettingsModal } from './components/modals/SettingsModal.tsx';
import { SecurityAuditModal } from './components/modals/SecurityAuditModal.tsx';
import { AdminModal } from './components/modals/AdminModal.tsx';

function MainLayout() {
  const { user, isLoading } = useAuth();
  const { activeConversation, selectConversation } = useChat();

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#0B0F14] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-[#3987FF]/20 border border-[#3987FF]/40 flex items-center justify-center text-[#3987FF] mb-4 animate-pulse">
          <span className="font-mono font-bold text-lg">CC</span>
        </div>
        <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">
          Initializing CipherChat Cryptographic Engine...
        </p>
      </div>
    );
  }

  // If unauthenticated or email not verified, show AuthModal
  if (!user || !user.is_email_verified) {
    return (
      <div className="h-screen w-screen bg-[#0B0F14] flex items-center justify-center p-4">
        <AuthModal />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0B0F14] text-white flex overflow-hidden">
      {/* Sidebar: Visible on desktop, or on mobile when no conversation is selected */}
      <div className={`w-full md:w-80 lg:w-96 h-full ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
        <Sidebar
          onOpenNewChat={() => setIsNewChatOpen(true)}
          onOpenContacts={() => setIsContactsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAudit={() => setIsAuditOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
        />
      </div>

      {/* Main Chat Area: Visible on desktop, or on mobile when a conversation is selected */}
      <div className={`flex-1 h-full ${!activeConversation ? 'hidden md:flex' : 'flex'}`}>
        <ChatArea onBackToSidebar={() => selectConversation(null)} />
      </div>

      {/* Global Modals */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
      />

      <ContactsModal
        isOpen={isContactsOpen}
        onClose={() => setIsContactsOpen(false)}
        onOpenNewChat={() => setIsNewChatOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenAudit={() => setIsAuditOpen(true)}
      />

      <SecurityAuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
      />

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <MainLayout />
      </ChatProvider>
    </AuthProvider>
  );
}
