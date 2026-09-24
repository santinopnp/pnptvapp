import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WalletPayCard, WalletLoginGate } from '@/components/payments/PayInWalletChips';
import { NpAppPickerSheet } from '@/components/payments/NowPaymentsWaitingPanel';
import { useI18n } from '@/lib/i18n';

interface FreeTierOverlayProps {
  label?: string;
  requiredTier?: 'member' | 'prime';
  children: React.ReactNode;
}

const PROMO_PLANS = [
  { id: 'yearly50',    price: 50,  labelEn: 'PRIME Annual',    labelEs: 'PRIME anual',        tagEn: '🔥 Best deal',  tagEs: '🔥 Mejor precio', subEn: '1 year · $50',                  subEs: '1 año · $50'                      },
  { id: 'lifetime100', price: 100, labelEn: 'PNPtv Founders',  labelEs: 'PNPtv Founders',     tagEn: '🖤 Founders',   tagEs: '🖤 Fundadores',   subEn: '$100 once · 18 mo PRIME + ✨ Prime Channel', subEs: '$100 una vez · 18 meses PRIME + ✨ Prime Channel' },
] as const;

export default function FreeTierOverlay({ label, requiredTier = 'member', children }: FreeTierOverlayProps) {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const es = lang === 'es';

  const [sheetOpen, setSheetOpen] = useState(false);
  const [walletPlanId, setWalletPlanId] = useState<string | null>(null);
  const [npPickerPlanId, setNpPickerPlanId] = useState<string | null>(null);

  if (requiredTier === 'member') {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none" style={{ filter: 'blur(8px)' }}>{children}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-lg">
          <div className="text-white text-center p-4">
            <svg className="w-8 h-8 mx-auto mb-2 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-sm font-medium mb-3">{label || (es ? 'Hazte miembro para ver esto' : 'Become a member to view this')}</p>
            <button
              onClick={() => navigate('/subscribe')}
              className="inline-block px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              {es ? 'Hazte miembro' : 'Become a Member'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <div className="pointer-events-none select-none" style={{ filter: 'blur(8px)' }}>{children}</div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg cursor-pointer"
          onClick={() => setSheetOpen(true)}
        >
          <div className="text-white text-center p-4">
            <div className="text-2xl mb-1">🔥</div>
            <p className="text-sm font-bold mb-1">{label || (es ? 'Contenido PRIME' : 'PRIME Content')}</p>
            <p className="text-xs text-white/70 mb-3">{es ? 'Desde $50/año · Toca para desbloquear' : 'From $50/yr · Tap to unlock'}</p>
            <div
              className="inline-block px-4 py-2 rounded-full text-sm font-black text-white"
              style={{ background: 'linear-gradient(135deg,#D4007A,#E69138)' }}
            >
              {es ? 'Ver opciones' : 'See plans'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => { setSheetOpen(false); setWalletPlanId(null); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full rounded-t-2xl p-5 space-y-4"
            style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-2" />

            <div className="text-center">
              <p className="text-base font-black text-white">{es ? '🔥 Desbloquea todo PRIME' : '🔥 Unlock all PRIME'}</p>
              <p className="text-xs text-white/50 mt-0.5">{es ? 'Elige tu plan — pago único, sin suscripción' : 'Pick a plan — one-time payment, no subscription'}</p>
            </div>

            <WalletLoginGate lang={lang as 'es' | 'en'}>
            <div className="grid grid-cols-2 gap-2.5">
              {PROMO_PLANS.map(plan => {
                const isLifetime = plan.id === 'lifetime100';
                const isWalletOpen = walletPlanId === plan.id;
                const cardStyle = isLifetime
                  ? { background: 'linear-gradient(145deg,rgba(20,20,20,0.95),rgba(30,25,20,0.95))', border: '1px solid rgba(230,145,56,0.40)' }
                  : { background: 'linear-gradient(145deg,rgba(212,0,122,0.14),rgba(255,107,176,0.07))', border: '1px solid rgba(212,0,122,0.40)' };
                const accent = isLifetime ? '#E69138' : '#FF6BB0';

                return (
                  <div key={plan.id} className="flex flex-col rounded-2xl overflow-hidden" style={cardStyle}>
                    <div className="p-3 flex flex-col gap-1.5 flex-1">
                      <span
                        className="self-start text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ background: isLifetime ? 'rgba(230,145,56,0.15)' : 'rgba(212,0,122,0.18)', color: accent, border: `1px solid ${isLifetime ? 'rgba(230,145,56,0.40)' : 'rgba(212,0,122,0.40)'}` }}
                      >
                        {es ? plan.tagEs : plan.tagEn}
                      </span>
                      <div className="flex items-baseline gap-0.5 leading-none mt-0.5">
                        <span className="text-[11px] font-bold" style={{ color: accent }}>$</span>
                        <span className="text-2xl font-black text-white">{plan.price}</span>
                        {!isLifetime && <span className="text-[10px] font-semibold text-white/50 ml-0.5">{es ? '/año' : '/yr'}</span>}
                      </div>
                      <p className="text-[11px] font-bold text-white leading-tight">{es ? plan.labelEs : plan.labelEn}</p>
                      <p className="text-[10px] text-white/50 leading-snug">{es ? plan.subEs : plan.subEn}</p>
                    </div>
                    <div className="px-3 pb-3 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setWalletPlanId(isWalletOpen ? null : plan.id)}
                        className="w-full py-2.5 rounded-xl text-[11px] font-black text-white transition-all active:scale-[0.97]"
                        style={{ background: isWalletOpen ? 'linear-gradient(135deg,#34d399,#10b981)' : 'linear-gradient(135deg,#10b981,#059669)' }}
                      >
                        {es ? '💎 Pagar con wallet' : '💎 Pay with wallet'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNpPickerPlanId(plan.id)}
                        className="w-full py-2 rounded-xl text-[11px] font-semibold transition-all active:scale-[0.97]"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.70)' }}
                      >
                        <span className="block">{es ? '₿ Pagar con apps y wallets' : '₿ Pay with apps & wallets'}</span>
                        <span className="block text-[9px] font-normal opacity-50 mt-0.5">BTC · ETH · USDC · USDT · etc.</span>
                      </button>
                    </div>
                    {isWalletOpen && (
                      <div className="px-3 pb-3">
                        <WalletPayCard
                          surface="prime"
                          amountUsd={plan.price}
                          entitlementSpec={{ planId: plan.id }}
                          metadata={{ source: 'paywall_overlay', planId: plan.id }}
                          label={es ? `Pagar $${plan.price} · ${plan.labelEs}` : `Pay $${plan.price} · ${plan.labelEn}`}
                          lang={lang as 'es' | 'en'}
                          onSuccess={() => { setSheetOpen(false); setWalletPlanId(null); setTimeout(() => { window.location.href = '/'; }, 1200); }}
                          compact
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </WalletLoginGate>

            <button
              type="button"
              onClick={() => navigate('/subscribe')}
              className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              {es ? 'Ver todos los planes →' : 'See all plans →'}
            </button>
          </div>
        </div>
      )}

      <NpAppPickerSheet
        isOpen={!!npPickerPlanId}
        onClose={() => setNpPickerPlanId(null)}
        planId={npPickerPlanId}
        lang={lang}
        planLabel={npPickerPlanId === 'lifetime100' ? 'PNPtv Founders' : 'PRIME Annual'}
      />
    </>
  );
}
