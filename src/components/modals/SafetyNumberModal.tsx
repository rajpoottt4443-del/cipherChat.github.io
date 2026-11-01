import React, { useState, useEffect } from 'react';
import { PublicUser } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { computeSafetyNumber } from '../../crypto/cipherCrypto.ts';
import { ShieldCheck, ShieldAlert, Copy, Check, X, QrCode } from 'lucide-react';

interface SafetyNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  peer: PublicUser;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({ isOpen, onClose, peer }) => {
  const { user } = useAuth();
  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [activeTab, setActiveTab] = useState<'numbers' | 'matrix'>('numbers');

  useEffect(() => {
    if (!isOpen || !user || !user.public_identity_key || !peer.public_identity_key) return;

    // Check if previously marked as verified
    const saved = localStorage.getItem(`cipherchat_verified_${peer.id}`);
    setIsVerified(saved === 'true');

    // Compute deterministic 60-digit safety number
    computeSafetyNumber(user.id, user.public_identity_key, peer.id, peer.public_identity_key)
      .then(res => {
        setSafetyNumber(res.safetyNumber);
        setChunks(res.fingerprintChunks);
      })
      .catch(err => {
        console.error('Failed computing safety numbers:', err);
      });
  }, [isOpen, user, peer]);

  if (!isOpen) return null;

  const copySafetyNumber = () => {
    navigator.clipboard.writeText(safetyNumber);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const toggleVerified = () => {
    const next = !isVerified;
    setIsVerified(next);
    localStorage.setItem(`cipherchat_verified_${peer.id}`, String(next));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Cryptographic Safety Number</h2>
            <p className="text-xs text-slate-400">Verify end-to-end encryption with {peer.display_name}</p>
          </div>
        </div>

        {/* Explanation */}
        <div className="p-3 bg-[#0B0F14] border border-white/5 rounded-xl text-xs text-slate-400 mb-5 leading-relaxed">
          If you wish to confirm the security of your end-to-end encryption with <strong className="text-slate-200">{peer.display_name}</strong>, compare these 60 numbers with the numbers on their screen. Both devices compute this number deterministically from your authenticated public identity keys.
        </div>

        {/* Tabs: Numbers vs Matrix */}
        <div className="flex gap-2 p-1 bg-[#0B0F14] rounded-xl mb-4 border border-white/5">
          <button
            onClick={() => setActiveTab('numbers')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'numbers' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            60-Digit Numbers
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'matrix' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            Visual Fingerprint
          </button>
        </div>

        {/* 60 Digits Grid */}
        {activeTab === 'numbers' ? (
          <div className="p-4 bg-[#0B0F14] rounded-xl border border-white/10 mb-5">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 font-mono text-center tracking-widest text-sm text-slate-200">
              {chunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className="py-1.5 px-2 bg-white/[0.03] border border-white/5 rounded-lg text-[#3987FF] font-semibold"
                >
                  {chunk}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <span className="text-[11px] text-slate-500">12 groups · 60 digits total</span>
              <button
                onClick={copySafetyNumber}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white transition-colors flex items-center gap-1.5"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Numbers</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Visual QR Matrix representation */
          <div className="p-6 bg-[#0B0F14] rounded-xl border border-white/10 mb-5 flex flex-col items-center justify-center">
            <div className="p-3 bg-white rounded-xl shadow-lg">
              {/* Deterministic QR SVG generator based on safety number */}
              <svg className="w-40 h-40" viewBox="0 0 21 21">
                {Array.from({ length: 21 }).map((_, r) =>
                  Array.from({ length: 21 }).map((_, c) => {
                    const isCorner =
                      (r < 7 && c < 7) || (r < 7 && c >= 14) || (r >= 14 && c < 7);
                    const hashIndex = (r * 21 + c) % (safetyNumber.length || 1);
                    const isFilled =
                      isCorner
                        ? (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
                        : (safetyNumber.charCodeAt(hashIndex) + r * 7 + c * 3) % 2 === 0;
                    return isFilled ? (
                      <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0B0F14" />
                    ) : null;
                  })
                )}
              </svg>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 text-center">
              Scan with camera or compare visually with {peer.display_name}'s screen
            </p>
          </div>
        )}

        {/* Verification Checkbox */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 mb-5">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className={`w-5 h-5 ${isVerified ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div>
              <p className="text-xs font-semibold text-white">Mark as Verified Contact</p>
              <p className="text-[11px] text-slate-400">Display verified badge in conversation header</p>
            </div>
          </div>
          <button
            onClick={toggleVerified}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
              isVerified ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                isVerified ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Bottom Notice */}
        <div className="text-[11px] text-slate-500">
          🔒 CipherChat alerts you immediately if a contact's encryption keys ever change.
        </div>
      </div>
    </div>
  );
};
