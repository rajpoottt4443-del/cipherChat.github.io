import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '../types/index.ts';
import { api, getStoredToken, setStoredToken, clearStoredToken } from '../services/api.ts';
import { socketService } from '../services/socket.ts';
import {
  generateIdentityKeyPair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPrivateKeyJWK,
  computeKeyFingerprint,
  saveLocalIdentityKeys,
  getLocalIdentityPrivateKey,
  getLocalIdentityPublicKey,
  clearLocalIdentityKeys,
  generateRecoveryPhrase,
  encryptPrivateKeyWithPassphrase,
  decryptPrivateKeyWithPassphrase,
} from '../crypto/cipherCrypto.ts';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  identityPrivateKey: CryptoKey | null;
  identityPublicKeyJWK: string | null;
  keyFingerprint: string | null;
  recoveryPhrase: string | null;
  isOnline: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; display_name: string; username: string }) => Promise<{ verificationCode: string }>;
  logout: () => Promise<void>;
  verifyEmail: (code?: string, bypass?: boolean) => Promise<void>;
  resendVerification: () => Promise<string>;
  updateProfile: (data: { display_name?: string; username?: string; avatar_url?: string; settings?: any }) => Promise<void>;
  restoreKeyWithPhrase: (phrase: string, backupBlob: string, salt: string, iv: string) => Promise<boolean>;
  regenerateIdentityKeys: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [identityPrivateKey, setIdentityPrivateKey] = useState<CryptoKey | null>(null);
  const [identityPublicKeyJWK, setIdentityPublicKeyJWK] = useState<string | null>(null);
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('cipherchat_theme');
    return (saved === 'light' ? 'light' : 'dark');
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem('cipherchat_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Initialize session on load
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const token = getStoredToken();
      if (!token) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const { user: authedUser } = await api.auth.me();
        if (isMounted) {
          setUser(authedUser);

          // Restore or load local encryption key
          await loadOrCreateLocalCryptoKeys(authedUser.id, authedUser.public_identity_key);

          // Connect WebSocket
          socketService.connect(token);
        }
      } catch (err) {
        console.warn('Session verification failed, logging out', err);
        clearStoredToken();
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    const unsubSocket = socketService.on('connection:status', (data: any) => {
      setIsOnline(Boolean(data.connected));
    });

    return () => {
      isMounted = false;
      unsubSocket();
    };
  }, []);

  // Helper to load or generate local identity key
  async function loadOrCreateLocalCryptoKeys(userId: string, remotePubJWK?: string) {
    try {
      const storedPrivJWK = getLocalIdentityPrivateKey(userId);
      const storedPubJWK = getLocalIdentityPublicKey(userId);

      if (storedPrivJWK && storedPubJWK) {
        const privKey = await importPrivateKeyJWK(storedPrivJWK);
        const fingerprint = await computeKeyFingerprint(storedPubJWK);
        setIdentityPrivateKey(privKey);
        setIdentityPublicKeyJWK(storedPubJWK);
        setKeyFingerprint(fingerprint);

        // If server doesn't have it yet, publish it
        if (!remotePubJWK || remotePubJWK !== storedPubJWK) {
          await api.user.updateIdentityKey(storedPubJWK, fingerprint);
        }
        return;
      }

      // Generate fresh ECDH P-256 Identity Keypair
      const keyPair = await generateIdentityKeyPair();
      const pubJWK = await exportPublicKeyJWK(keyPair.publicKey);
      const privJWK = await exportPrivateKeyJWK(keyPair.privateKey);
      const fingerprint = await computeKeyFingerprint(pubJWK);

      saveLocalIdentityKeys(userId, privJWK, pubJWK);
      setIdentityPrivateKey(keyPair.privateKey);
      setIdentityPublicKeyJWK(pubJWK);
      setKeyFingerprint(fingerprint);

      // Generate a new 12-word recovery phrase
      const phrase = generateRecoveryPhrase();
      setRecoveryPhrase(phrase);
      localStorage.setItem(`cipherchat_recovery_${userId}`, phrase);

      // Publish public key to server
      await api.user.updateIdentityKey(pubJWK, fingerprint);
    } catch (err) {
      console.error('Error in crypto key setup:', err);
    }
  }

  const register = async (data: { email: string; password: string; display_name: string; username: string }) => {
    setIsLoading(true);
    try {
      // 1. Generate client-side ECDH P-256 identity keypair BEFORE transmission
      const keyPair = await generateIdentityKeyPair();
      const pubJWK = await exportPublicKeyJWK(keyPair.publicKey);
      const privJWK = await exportPrivateKeyJWK(keyPair.privateKey);
      const fingerprint = await computeKeyFingerprint(pubJWK);

      // 2. Register account with public key (private key stays on device!)
      const res = await api.auth.register({
        ...data,
        public_identity_key: pubJWK,
        public_key_fingerprint: fingerprint,
      });

      // 3. Store private key locally
      saveLocalIdentityKeys(res.user.id, privJWK, pubJWK);
      setIdentityPrivateKey(keyPair.privateKey);
      setIdentityPublicKeyJWK(pubJWK);
      setKeyFingerprint(fingerprint);

      // 4. Generate recovery phrase
      const phrase = generateRecoveryPhrase();
      setRecoveryPhrase(phrase);
      localStorage.setItem(`cipherchat_recovery_${res.user.id}`, phrase);

      // 5. Store session and connect
      setStoredToken(res.token);
      setUser(res.user);
      socketService.connect(res.token);

      return { verificationCode: res.verification_code };
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login(identifier, password);
      setStoredToken(res.token);
      setUser(res.user);

      // Restore or generate device crypto keys
      await loadOrCreateLocalCryptoKeys(res.user.id, res.user.public_identity_key);

      // Connect socket
      socketService.connect(res.token);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      console.warn('Logout API error:', e);
    } finally {
      socketService.disconnect();
      clearStoredToken();
      setUser(null);
      setIdentityPrivateKey(null);
      setIdentityPublicKeyJWK(null);
      setKeyFingerprint(null);
      setRecoveryPhrase(null);
    }
  };

  const verifyEmail = async (code?: string, bypass?: boolean) => {
    const res = await api.auth.verifyEmail(code, bypass);
    setUser(res.user);
  };

  const resendVerification = async () => {
    const res = await api.auth.resendVerification();
    setUser(res.user);
    return res.verification_code;
  };

  const updateProfile = async (data: { display_name?: string; username?: string; avatar_url?: string; settings?: any }) => {
    const res = await api.user.updateProfile(data);
    setUser(res.user);
  };

  const restoreKeyWithPhrase = async (phrase: string, backupBlob: string, salt: string, iv: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const restoredJWK = await decryptPrivateKeyWithPassphrase(backupBlob, phrase, salt, iv);
      const privKey = await importPrivateKeyJWK(restoredJWK);
      // Derive or match public key
      const pubJWK = user.public_identity_key;
      saveLocalIdentityKeys(user.id, restoredJWK, pubJWK);
      setIdentityPrivateKey(privKey);
      setIdentityPublicKeyJWK(pubJWK);
      return true;
    } catch (e) {
      console.error('Failed to restore identity key from phrase:', e);
      return false;
    }
  };

  const regenerateIdentityKeys = async () => {
    if (!user) return;
    const keyPair = await generateIdentityKeyPair();
    const pubJWK = await exportPublicKeyJWK(keyPair.publicKey);
    const privJWK = await exportPrivateKeyJWK(keyPair.privateKey);
    const fingerprint = await computeKeyFingerprint(pubJWK);

    saveLocalIdentityKeys(user.id, privJWK, pubJWK);
    setIdentityPrivateKey(keyPair.privateKey);
    setIdentityPublicKeyJWK(pubJWK);
    setKeyFingerprint(fingerprint);

    const phrase = generateRecoveryPhrase();
    setRecoveryPhrase(phrase);
    localStorage.setItem(`cipherchat_recovery_${user.id}`, phrase);

    const res = await api.user.updateIdentityKey(pubJWK, fingerprint);
    setUser(res.user);
  };

  const deleteAccount = async () => {
    if (!user) return;
    const userId = user.id;
    await api.user.deleteAccount();
    clearLocalIdentityKeys(userId);
    localStorage.removeItem(`cipherchat_recovery_${userId}`);
    await logout();
  };

  const refreshUser = async () => {
    const { user: updated } = await api.auth.me();
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        identityPrivateKey,
        identityPublicKeyJWK,
        keyFingerprint,
        recoveryPhrase,
        isOnline,
        theme,
        toggleTheme,
        login,
        register,
        logout,
        verifyEmail,
        resendVerification,
        updateProfile,
        restoreKeyWithPhrase,
        regenerateIdentityKeys,
        deleteAccount,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
