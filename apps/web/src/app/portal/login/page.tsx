"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";

import { auth } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await auth.signIn.email({ email, password });

    if (signInError) {
      setError(signInError.message || "Authentication failed. Check your credentials.");
      setLoading(false);
      return;
    }

    router.push(searchParams.get("next") ?? "/portal/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 1) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="absolute top-1/4 left-1/4 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, oklch(0.72 0.19 145 / 0.06) 0%, transparent 70%)" }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-[360px] h-[360px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, oklch(0.65 0.17 250 / 0.05) 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass glow-primary mb-5">
            <Shield className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold tracking-[0.2em] text-foreground uppercase">
            Vehicle Surveillance
          </h1>
          <p className="text-muted-foreground text-sm mt-2 tracking-wide">
            Vehicle Surveillance Platform
          </p>
        </div>

        <div className="glass-heavy rounded-2xl p-8">
          <h2 className="text-base font-semibold text-foreground mb-1">Operator Sign In</h2>
          <p className="text-xs text-muted-foreground mb-6">Restricted access — authorized personnel only.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@vehiclesurveillance.io"
                  className="h-auto bg-input border-border pl-10 py-3 placeholder:text-muted-foreground/40 focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="h-auto bg-input border-border pl-10 pr-11 py-3 placeholder:text-muted-foreground/40 focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3.5 py-2.5">
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className={cn("w-full mt-1 py-3 h-auto", !loading && "glow-primary")}
            >
              {loading ? "Authenticating…" : "Sign In"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          This system is monitored. All access is logged.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
