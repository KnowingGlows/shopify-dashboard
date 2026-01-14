'use client';

import { useState, type FormEvent } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, ShieldCheck, User } from 'lucide-react';

const allowedEmail = 'tsovansh@gmail.com';
const allowedPassword = 'Sovansh@1234';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matches = email.trim() === allowedEmail && password === allowedPassword;

    if (matches) {
      setIsAuthorized(true);
      setError('');
      return;
    }

    setIsAuthorized(false);
    setError('Access denied. Double check the email and password.');
  };

  const handleSignOut = () => {
    setIsAuthorized(false);
    setEmail('');
    setPassword('');
    setError('');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Settings access
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Secure the dashboard before adjusting integrations and access.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Lock className="h-5 w-5 text-primary" />
                Auth gate
              </CardTitle>
              <CardDescription>
                Only approved credentials can view settings controls.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAuthorized ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    Access granted. Settings are now unlocked.
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        Sync cadence
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        Every 10 minutes
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        Store access
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        Kairova, Mavric
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        Alerts
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        Revenue spikes enabled
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSignOut}
                    className="mt-2 w-full border-border/60 bg-background/60"
                  >
                    Sign out
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Enter your email"
                        className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        autoComplete="username"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Password
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  {error ? (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                      {error}
                    </div>
                  ) : null}
                  <Button type="submit" className="w-full">
                    Unlock settings
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardHeader>
              <CardTitle>Security notes</CardTitle>
              <CardDescription>Quick reminders for safe access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                Credentials are checked locally for now. Wire this up to a real auth provider
                when you are ready to lock the entire app.
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                Access is currently limited to the approved email and password combination.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
