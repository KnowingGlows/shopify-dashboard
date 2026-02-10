'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Home, LogOut, Menu, Settings, Store, Users, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SplashScreen } from './splash-screen';
import { useAuth } from './auth-provider';
import { PendingUsersNotification } from './pending-users';
import { RestrictedPage } from './restricted-page';

type NavItem = {
  href: string;
  label: string;
  helper: string;
  icon: typeof Home;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    helper: 'Live sales pulse',
    icon: Home,
  },
  {
    href: '/brands',
    label: 'Brands',
    helper: 'Kairova and Mavric',
    icon: Store,
  },
  {
    href: '/p-and-l',
    label: 'P&L',
    helper: 'Daily profit + cashflow',
    icon: BarChart3,
  },
  {
    href: '/settings',
    label: 'Settings',
    helper: 'Store integrations',
    icon: Settings,
  },
  {
    href: '/users',
    label: 'Users',
    helper: 'Manage access',
    icon: Users,
    adminOnly: true,
  },
];

function NavLink({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-4 overflow-hidden rounded-2xl border px-4 py-3 transition-all duration-300',
        isActive
          ? 'border-primary/40 bg-primary/10 text-foreground shadow-[0_0_30px_rgba(34,211,238,0.18)]'
          : 'border-transparent bg-card/30 text-muted-foreground hover:border-border/60 hover:text-foreground'
      )}
    >
      <span
        className={cn(
          'absolute inset-0 bg-[linear-gradient(120deg,rgba(34,211,238,0.12),rgba(251,191,36,0.08),rgba(16,185,129,0.1))] opacity-0 transition-opacity duration-500',
          isActive ? 'opacity-100' : 'group-hover:opacity-100'
        )}
      />
      <span
        className={cn(
          'absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-primary/70 opacity-0 transition-opacity duration-300 motion-safe:animate-[navPulse_6s_ease-in-out_infinite]',
          isActive ? 'opacity-100' : 'group-hover:opacity-40'
        )}
      />
      <span
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/60 transition-all duration-300',
          isActive
            ? 'border-primary/40 bg-primary/20 text-primary shadow-[0_0_16px_rgba(34,211,238,0.35)]'
            : 'text-muted-foreground group-hover:text-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="relative flex flex-col">
        <span className="text-sm font-semibold uppercase tracking-[0.12em]">{item.label}</span>
        <span className="text-xs text-muted-foreground">{item.helper}</span>
      </span>
    </Link>
  );
}

function SideNavContent({
  activePath,
  onNavigate,
  showClose,
}: {
  activePath: string;
  onNavigate?: () => void;
  showClose?: boolean;
}) {
  const { logout, user } = useAuth();

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(15,23,42,0.6))] bg-[length:200%_200%] text-primary shadow-[0_0_24px_rgba(34,211,238,0.2)] motion-safe:animate-[shimmer_12s_linear_infinite]">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Shopify</p>
            <p className="text-lg font-semibold text-foreground">Vaultik</p>
          </div>
        </div>
        {showClose ? (
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-2xl border border-border/50 bg-card/40 p-3 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[inset_0_0_20px_rgba(15,23,42,0.4)]">
          Live sync enabled
        </div>
        <PendingUsersNotification />
      </div>
      <nav className="flex flex-col gap-3">
        {navItems
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={activePath === item.href}
              onNavigate={onNavigate}
            />
          ))}
      </nav>
      <div className="mt-auto space-y-3">
        {user && (
          <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Signed in as</p>
            <p className="mt-1 truncate text-xs font-medium text-foreground">{user.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-4 py-3 text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Sign out</span>
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

  // Permission gate: admins always pass, users check their permissions array
  // /users page is admin-only (handled by the page itself)
  const hasPermission =
    !user ||
    user.role === 'admin' ||
    pathname === '/users' || // let the page handle its own admin check
    (user.permissions ?? []).includes(pathname);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
      <div className="flex min-h-screen">
        <aside className="relative hidden w-72 flex-col border-r border-border/40 bg-sidebar/70 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.4)] backdrop-blur md:flex">
          <SideNavContent activePath={pathname} />
        </aside>
        <main className="relative flex-1">
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/40 bg-background/70 px-4 py-3 backdrop-blur md:hidden">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-foreground shadow-[0_0_20px_rgba(15,23,42,0.4)] transition hover:border-primary/40 hover:text-primary"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {activeItem.label}
            </div>
            <div className="h-9 w-9" aria-hidden="true" />
          </div>
          {hasPermission ? children : <RestrictedPage />}
        </main>
      </div>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 opacity-0 backdrop-blur-sm transition-opacity md:hidden',
          navOpen ? 'opacity-100' : 'pointer-events-none'
        )}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 -translate-x-full border-r border-border/40 bg-sidebar/90 px-6 py-6 shadow-[0_0_40px_rgba(15,23,42,0.4)] backdrop-blur transition-transform duration-300 md:hidden',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SideNavContent
          activePath={pathname}
          onNavigate={() => setNavOpen(false)}
          showClose
        />
      </aside>
    </div>
  );
}
