'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Box, ClipboardList, Home, LogOut,
  Menu, Megaphone, Package, Search, Settings, Truck, Users, X,
  Calculator, PackageCheck, PackageX, Funnel as FunnelIcon, Globe, Wallet, Trophy, Boxes, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SplashScreen } from './splash-screen';
import { OrbytLogo } from './orbyt-logo';
import { useAuth } from './auth-provider';
import { PendingUsersNotification } from './pending-users';
import { NotificationCenter } from './notifications';
import { TeamChat } from './team-chat';
import { RestrictedPage } from './restricted-page';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  adminOnly?: boolean;
  section?: string;
  parent?: string; // href of parent item (renders indented)
};

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Home, section: 'core' },
  { href: '/orders', label: 'Logistics', icon: Truck, section: 'core' },
  { href: '/orders/breakdown', label: 'Breakdown', icon: BarChart3, section: 'core', parent: '/orders' },
  { href: '/finance/calculator', label: 'Calculator', icon: Calculator, section: 'finance' },
  { href: '/finance/3pl-calculator', label: '3PL Calculator', icon: Boxes, section: 'finance' },
  { href: '/finance/funnels', label: 'Funnel Finance', icon: Wallet, section: 'finance' },
  { href: '/prs', label: 'PRS', icon: Search, section: 'marketing' },
  { href: '/prs/rejected', label: 'Rejected', icon: Ban, section: 'marketing', parent: '/prs' },
  { href: '/product-tracker', label: 'Products', icon: Package, section: 'marketing' },
  { href: '/product-tracker/winners', label: 'Winners', icon: Trophy, section: 'marketing', parent: '/product-tracker' },
  { href: '/funnels', label: 'Funnels', icon: FunnelIcon, section: 'marketing' },
  { href: '/ads-international', label: 'Ads', icon: Globe, section: 'marketing' },
  { href: '/ads-tracker', label: 'OPS Ads — India', icon: Megaphone, section: 'marketing' },
  { href: '/inventory', label: 'Inventory', icon: Box, section: 'ops' },
  { href: '/rto', label: 'RTO', icon: PackageX, section: 'ops' },
  { href: '/dispatch', label: 'Dispatch', icon: PackageCheck, section: 'ops' },
  { href: '/logs', label: 'Daily Logs', icon: ClipboardList, section: 'ops' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'system' },
  { href: '/users', label: 'Users', icon: Users, adminOnly: true, section: 'system' },
];

const ADMIN_ROLES = ['admin', 'ceo'];

function NavLink({ item, isActive, onNavigate, index }: { item: NavItem; isActive: boolean; onNavigate?: () => void; index: number }) {
  const Icon = item.icon;
  const isChild = !!item.parent;
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg py-2 text-[13px] font-medium transition-all duration-200',
          isChild ? 'pl-9 pr-3 text-[12px]' : 'px-3',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="nav-active"
            className="absolute inset-0 rounded-lg bg-primary/10"
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          />
        )}
        <Icon className={cn('relative z-10 shrink-0 transition-colors', isChild ? 'h-3.5 w-3.5' : 'h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
        <span className="relative z-10 truncate">{item.label}</span>
        {isActive && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="relative z-10 ml-auto h-1.5 w-1.5 rounded-full bg-primary"
          />
        )}
      </Link>
    </motion.div>
  );
}

function SideNavContent({ activePath, onNavigate, showClose }: { activePath: string; onNavigate?: () => void; showClose?: boolean }) {
  const { logout, user } = useAuth();
  const isAdmin = user && ADMIN_ROLES.includes(user.role);
  const perms = user?.permissions ?? [];

  // Check if user has access to a given path
  const hasAccess = (href: string): boolean => {
    if (isAdmin) return true;
    if (!user) return true; // not logged in yet, show all (page will block)
    // Exact match or parent match (e.g. perm "/finance" grants access to "/finance/entry")
    return perms.includes(href) || perms.some((p) => p !== '/' && href.startsWith(p + '/'));
  };

  const sections = [
    { key: 'core', label: null },
    { key: 'finance', label: 'Finance' },
    { key: 'marketing', label: 'Marketing' },
    { key: 'ops', label: 'Operations' },
    { key: 'system', label: 'System' },
  ];

  // Pick the single nav item whose href is the longest prefix of the current
  // path. This prevents a parent (e.g. /product-tracker) from staying lit
  // when a child route (/product-tracker/winners) should own the highlight.
  const activeHref = (() => {
    let best: string | null = null;
    for (const item of navItems) {
      if (item.href === activePath) return item.href;
      if (item.href === '/') continue;
      if (activePath.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.length) best = item.href;
      }
    }
    return best ?? '/';
  })();

  let globalIndex = 0;

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-1">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <OrbytLogo size={18} animate={false} />
          </div>
          <p className="text-sm font-semibold text-foreground">Orbit</p>
        </motion.div>
        <div className="flex items-center gap-1">
          <TeamChat />
          <NotificationCenter />
          <PendingUsersNotification />
          {showClose && (
            <button type="button" onClick={onNavigate} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-4 flex-1 space-y-4 overflow-y-auto px-2">
        {sections.map((section) => {
          const items = navItems.filter((i) => {
            if (i.section !== section.key) return false;
            if (i.adminOnly && !isAdmin) return false;
            // Hide pages the user doesn't have permission for
            if (!hasAccess(i.href)) return false;
            // Hide child items unless parent route is active
            if (i.parent) {
              if (!activePath.startsWith(i.parent)) return false;
            }
            return true;
          });
          if (items.length === 0) return null;
          return (
            <div key={section.key}>
              {section.label && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60"
                >
                  {section.label}
                </motion.p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const idx = globalIndex++;
                  const isActive = item.href === activeHref;
                  return <NavLink key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} index={idx} />;
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-2 py-3 space-y-2">
        {user && (
          <div className="px-3 py-1">
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const activeItem = useMemo(
    () => navItems.find((item) => item.href === pathname) ?? navItems.find((item) => !item.parent && pathname.startsWith(item.href + '/')) ?? navItems[0],
    [pathname]
  );

  const isAdmin = user && ADMIN_ROLES.includes(user.role);
  const perms = user?.permissions ?? [];
  const hasPermission =
    !user ||
    isAdmin ||
    pathname === '/users' ||
    perms.includes(pathname) ||
    perms.some((p) => p !== '/' && pathname.startsWith(p + '/'));

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-[#0c0c0e] py-4 md:flex">
          <SideNavContent activePath={pathname} />
        </aside>

        {/* Main */}
        <main className="relative flex-1 overflow-x-hidden">
          {/* Ambient orbs */}
          <div className="ambient-orb ambient-orb-1" />
          <div className="ambient-orb ambient-orb-2" />
          <div className="ambient-orb ambient-orb-3" />
          {/* Mobile header */}
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:hidden">
            <button type="button" onClick={() => setNavOpen(true)} className="rounded-md p-1.5 text-foreground" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-xs font-medium text-muted-foreground">{activeItem.label}</span>
            <div className="flex items-center gap-1">
              <TeamChat />
              <NotificationCenter />
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {hasPermission ? children : <RestrictedPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {navOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 border-r border-border bg-[#0c0c0e] py-4 transition-transform duration-200 md:hidden',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SideNavContent activePath={pathname} onNavigate={() => setNavOpen(false)} showClose />
      </aside>
    </div>
  );
}
