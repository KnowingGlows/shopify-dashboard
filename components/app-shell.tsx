'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Box, ClipboardList, DollarSign, Home, LogOut, Megaphone,
  Menu, Package, Search, Settings, Store, Users, X, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SplashScreen } from './splash-screen';
import { useAuth } from './auth-provider';
import { PendingUsersNotification } from './pending-users';
import { RestrictedPage } from './restricted-page';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  adminOnly?: boolean;
  section?: string;
};

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Home, section: 'core' },
  { href: '/brands', label: 'Brands', icon: Store, section: 'core' },
  { href: '/p-and-l', label: 'P&L', icon: BarChart3, section: 'core' },
  { href: '/finance', label: 'Finance', icon: DollarSign, section: 'core' },
  { href: '/product-tracker', label: 'Products', icon: Package, section: 'ops' },
  { href: '/ads-tracker', label: 'Ads', icon: Megaphone, section: 'ops' },
  { href: '/prs', label: 'PRS', icon: Search, section: 'ops' },
  { href: '/inventory', label: 'Inventory', icon: Box, section: 'ops' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'system' },
  { href: '/logs', label: 'Logs', icon: ClipboardList, section: 'system' },
  { href: '/users', label: 'Users', icon: Users, adminOnly: true, section: 'system' },
];

function NavLink({ item, isActive, onNavigate }: { item: NavItem; isActive: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
      <span className="truncate">{item.label}</span>
      {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

function SideNavContent({ activePath, onNavigate, showClose }: { activePath: string; onNavigate?: () => void; showClose?: boolean }) {
  const { logout, user } = useAuth();

  const sections = [
    { key: 'core', label: null },
    { key: 'ops', label: 'Operations' },
    { key: 'system', label: 'System' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Vaultik</p>
            <p className="text-[10px] text-muted-foreground">Management</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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
          const items = navItems.filter((i) => i.section === section.key && (!i.adminOnly || user?.role === 'admin'));
          if (items.length === 0) return null;
          return (
            <div key={section.key}>
              {section.label && (
                <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.href} item={item} isActive={activePath === item.href} onNavigate={onNavigate} />
                ))}
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
    () => navItems.find((item) => item.href === pathname) ?? navItems[0],
    [pathname]
  );

  const perms = user?.permissions ?? [];
  const hasPermission =
    !user ||
    user.role === 'admin' ||
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
          {/* Mobile header */}
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:hidden">
            <button type="button" onClick={() => setNavOpen(true)} className="rounded-md p-1.5 text-foreground" aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-xs font-medium text-muted-foreground">{activeItem.label}</span>
            <div className="w-8" />
          </div>
          {hasPermission ? children : <RestrictedPage />}
        </main>
      </div>

      {/* Mobile overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden',
          navOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
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
