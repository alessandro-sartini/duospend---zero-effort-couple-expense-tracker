import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Compass,
  Download,
  Heart,
  LayoutDashboard,
  Lock,
  Moon,
  MoreHorizontal,
  PieChart,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { CoupleProfile } from '../types';
import type { Theme } from '../services/theme';
import { DuoSpendLogo } from './ui/DuoSpendLogo';
import { SyncStatusBadge } from './ui/Loader';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  profile: CoupleProfile;
  isSyncingData?: boolean;
  authMethod?: 'google' | 'development' | null;
  onOpenSecurityModal: () => void;
  onLockVault: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  shortLabel: string;
  mobileLabel: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Panoramica', shortLabel: 'Panoramica', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'expenses', label: 'Spese', shortLabel: 'Spese', mobileLabel: 'Spese', icon: Receipt },
  { id: 'analytics', label: 'Categorie e Trend', shortLabel: 'Trend', mobileLabel: 'Trend', icon: PieChart },
  { id: 'settlement', label: 'Pareggio Saldo', shortLabel: 'Saldo', mobileLabel: 'Saldo', icon: Scale },
  { id: 'advisor', label: 'Consulente AI', shortLabel: 'Advisor AI', mobileLabel: 'AI', icon: Sparkles },
  { id: 'vision', label: 'Bacheca Obiettivi', shortLabel: 'Obiettivi', mobileLabel: 'Obiettivi', icon: Compass },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  profile,
  isSyncingData = false,
  authMethod = null,
  onOpenSecurityModal,
  onLockVault,
  theme,
  onToggleTheme,
  canInstallPwa = false,
  onInstallPwa,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRefs = useRef<Array<HTMLDivElement | null>>([]);

  const lgPrimaryItems = NAV_ITEMS.slice(0, 4);
  const lgSecondaryItems = NAV_ITEMS.slice(4);
  const mobilePrimaryItems = NAV_ITEMS.slice(0, 4);
  const mobileSecondaryItems = NAV_ITEMS.slice(4);

  const selectTab = (tab: string) => {
    onTabChange(tab);
    setIsMoreOpen(false);
  };

  const quickActions: Array<{
    id: string;
    label: string;
    ariaLabel?: string;
    icon: LucideIcon;
    iconClass: string;
    onClick: () => void;
    pressed?: boolean;
    badgeDot?: boolean;
  }> = [
    ...(canInstallPwa && onInstallPwa
      ? [
          {
            id: 'install-pwa',
            label: 'Installa app DuoSpend',
            ariaLabel: 'Installa app DuoSpend su questo dispositivo',
            icon: Download,
            iconClass: 'text-orange-600',
            onClick: onInstallPwa,
          },
        ]
      : []),
    {
      id: 'theme',
      label: theme === 'dark' ? 'Tema chiaro' : 'Tema scuro',
      ariaLabel: theme === 'dark' ? 'Attiva tema chiaro' : 'Attiva tema scuro',
      icon: theme === 'dark' ? Sun : Moon,
      iconClass: theme === 'dark' ? 'text-amber-500' : 'text-indigo-600',
      onClick: onToggleTheme,
      pressed: theme === 'dark',
    },
    {
      id: 'security',
      label: 'Sicurezza',
      icon: ShieldCheck,
      iconClass: 'text-emerald-600',
      onClick: onOpenSecurityModal,
    },
    {
      id: 'lock',
      label: 'Blocca cassaforte',
      icon: Lock,
      iconClass: 'text-stone-600',
      onClick: onLockVault,
    },
  ];

  useEffect(() => {
    if (!isMoreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (isMoreOpen && !moreMenuRefs.current.some((menu) => menu?.contains(target))) {
        setIsMoreOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  const renderDesktopNavPill = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = currentTab === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => selectTab(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 2xl:px-3 py-1.5 text-xs 2xl:text-[13px] transition-all cursor-pointer ${
          isActive
            ? 'ds-nav-pill-active font-semibold text-stone-900 shadow-xs border border-stone-200/70'
            : 'border border-transparent font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
        }`}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-orange-600' : 'text-stone-400'}`} />
        <span className="2xl:hidden">{item.shortLabel}</span>
        <span className="hidden 2xl:inline">{item.label}</span>
      </button>
    );
  };

  const isMobileSecondaryActive = mobileSecondaryItems.some((item) => item.id === currentTab);

  return (
    <>
      <header className="sticky top-0 z-30 ds-header backdrop-blur-xl border-b border-stone-200/80 pt-[env(safe-area-inset-top,0px)]">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 lg:h-16 min-w-0 items-center justify-between gap-2 sm:gap-3">
          {/* Zona 1: Brand & Pillola Coppia */}
          <div className="flex items-center gap-2.5 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => selectTab('dashboard')}
              aria-label="Vai alla Panoramica DuoSpend"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform hover:scale-105 cursor-pointer"
            >
              <DuoSpendLogo variant="mark" size="sm" />
            </button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => selectTab('dashboard')}
                  className="font-display text-base sm:text-lg font-extrabold leading-none tracking-tight text-stone-900 hover:text-orange-600 transition-colors whitespace-nowrap cursor-pointer text-left"
                >
                  DuoSpend
                </button>
                <SyncStatusBadge isSyncing={isSyncingData} authMethod={authMethod} />
              </div>
              <button
                type="button"
                onClick={() => selectTab('dashboard')}
                onDoubleClick={onOpenSecurityModal}
                title="Doppio clic per modificare nomi coppia e impostazioni"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-800 leading-tight whitespace-nowrap cursor-pointer rounded-md text-left"
              >
                <span>{profile.userName}</span>
                <Heart className="h-2.5 w-2.5 fill-rose-500 text-rose-500 shrink-0" />
                <span>{profile.partnerName}</span>
              </button>
            </div>
          </div>

          {/* Zona 2A: Navigazione Completa a Pillole (Desktop XL+) */}
          <nav
            aria-label="Navigazione principale"
            className="hidden xl:flex items-center gap-1 rounded-2xl border border-stone-200/80 ds-nav-track p-1"
          >
            {NAV_ITEMS.map(renderDesktopNavPill)}
          </nav>

          {/* Zona 2B: Navigazione Compatta (LG .. XL) */}
          <nav
            aria-label="Navigazione principale"
            className="hidden lg:flex xl:hidden items-center gap-1 rounded-2xl border border-stone-200/80 ds-nav-track p-1"
          >
            {lgPrimaryItems.map(renderDesktopNavPill)}
            <div className="relative" ref={(el) => { moreMenuRefs.current[0] = el; }}>
              <button
                type="button"
                onClick={() => setIsMoreOpen((open) => !open)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] transition-all cursor-pointer ${
                  lgSecondaryItems.some((item) => item.id === currentTab)
                    ? 'ds-nav-pill-active font-semibold text-stone-900 shadow-xs border border-stone-200/70'
                    : 'border border-transparent font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
                aria-haspopup="menu"
                aria-expanded={isMoreOpen}
                aria-controls="secondary-navigation"
              >
                <span>Altro</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
              </button>
              {isMoreOpen && (
                <div
                  id="secondary-navigation"
                  role="menu"
                  aria-label="Altre sezioni"
                  className="ds-card absolute right-0 top-full z-40 mt-2 min-w-52 p-1.5 shadow-xl"
                >
                  {lgSecondaryItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => selectTab(item.id)}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-orange-500/12 font-semibold text-orange-700'
                            : 'text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Zona 3: Toolbar Impostazioni Rapide */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Toolbar Icone (Mobile & Desktop) */}
            <div className="flex items-center gap-0.5 rounded-xl border border-stone-200/80 ds-nav-track p-1">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                    title={action.label}
                    aria-label={action.ariaLabel || action.label}
                    aria-pressed={action.pressed}
                    className="relative flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 transition-colors cursor-pointer"
                  >
                    <Icon className={`h-4 w-4 ${action.iconClass}`} />
                    {action.badgeDot && (
                      <span
                        className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-[var(--theme-nav-track)]"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      </header>

      {isMoreOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsMoreOpen(false)}
          className="fixed inset-0 z-[46] bg-stone-950/20 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* Bottom Tab Bar Nativa Mobile (< LG) */}
      <nav
        aria-label="Navigazione mobile"
        className={`fixed bottom-0 inset-x-0 lg:hidden ds-header backdrop-blur-xl border-t border-stone-200/80 pb-[env(safe-area-inset-bottom,0px)] ${
          isMoreOpen ? 'z-[48]' : 'z-30'
        }`}
      >
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1.5">
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-0 py-1.5 rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? 'text-orange-600'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center rounded-full px-3 py-1 transition-colors ${
                    isActive ? 'bg-orange-500/14' : ''
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                </span>
                <span className="text-[10px] font-semibold leading-none truncate max-w-full">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}

          <div
            className="relative flex min-w-0"
            ref={(el) => {
              moreMenuRefs.current[1] = el;
            }}
          >
            <button
              type="button"
              onClick={() => setIsMoreOpen((open) => !open)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 py-1.5 rounded-xl transition-colors cursor-pointer ${
                isMobileSecondaryActive || isMoreOpen
                  ? 'text-orange-600'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
              aria-haspopup="menu"
              aria-expanded={isMoreOpen}
              aria-controls="mobile-secondary-navigation"
            >
              <span
                className={`inline-flex items-center justify-center rounded-full px-3 py-1 transition-colors ${
                  isMobileSecondaryActive || isMoreOpen ? 'bg-orange-500/14' : ''
                }`}
              >
                <MoreHorizontal className="h-[18px] w-[18px] shrink-0" />
              </span>
              <span className="text-[10px] font-semibold leading-none truncate max-w-full">
                Altro
              </span>
            </button>
            {isMoreOpen && (
              <div
                id="mobile-secondary-navigation"
                role="menu"
                aria-label="Altre sezioni"
                className="ds-card absolute right-1 bottom-full z-40 mb-2.5 min-w-52 p-1.5 shadow-2xl"
              >
                {mobileSecondaryItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => selectTab(item.id)}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-orange-500/12 font-semibold text-orange-700'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};
