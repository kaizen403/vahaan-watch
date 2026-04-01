"use client";

import { useState } from "react";
import { auth } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Shield,
  Bell,
  Monitor,
  Moon,
  Lock,
  KeyRound,
  Mail,
  Save,
  Loader2,
  CheckCircle,
} from "lucide-react";

type SettingsTab = "profile" | "security" | "notifications" | "system";

const TABS: { value: SettingsTab; label: string; icon: typeof User }[] = [
  { value: "profile", label: "Profile", icon: User },
  { value: "security", label: "Security", icon: Shield },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "system", label: "System", icon: Monitor },
];

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-6">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  enabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between w-full py-3">
      <Label className="text-sm text-foreground font-normal cursor-pointer">{label}</Label>
      <Switch checked={enabled} onCheckedChange={() => onToggle()} />
    </div>
  );
}

function InputField({
  id,
  label,
  icon: Icon,
  ...props
}: {
  id: string;
  label: string;
  icon: typeof Mail;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5"
      >
        <Icon className="h-3 w-3" /> {label}
      </Label>
      <Input
        id={id}
        className="bg-input border-border placeholder:text-muted-foreground"
        {...props}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = auth.useSession();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(session?.user?.name ?? "");
  const [email] = useState(session?.user?.email ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [notifyAlerts, setNotifyAlerts] = useState(true);
  const [notifyDeviceOffline, setNotifyDeviceOffline] = useState(true);
  const [notifyNewVersion, setNotifyNewVersion] = useState(false);
  const [notifySounds, setNotifySounds] = useState(true);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await auth.updateUser({ name });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // auth client surfaces errors
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    setSaving(true);
    try {
      await auth.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // auth client surfaces errors
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and system preferences
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
        <TabsList className="flex gap-2 flex-wrap bg-transparent p-0 h-auto">
          {TABS.map((t) => {
            const TabIcon = t.icon;
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  "glass glass-hover text-muted-foreground hover:text-foreground",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
                )}
              >
                <TabIcon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {saved && (
          <div className="glass rounded-xl p-4 border border-success/30 bg-success/5 flex items-center gap-3 mt-6">
            <CheckCircle className="h-4 w-4 text-success" />
            <p className="text-sm text-success">Settings saved successfully.</p>
          </div>
        )}

        <TabsContent value="profile" className="mt-6">
          <SettingsCard
            title="Profile Information"
            description="Update your account details."
          >
            <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
              <InputField
                id="profile-name"
                label="Display Name"
                icon={User}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <InputField
                id="profile-email"
                label="Email Address"
                icon={Mail}
                type="email"
                value={email}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Email changes require admin assistance.
              </p>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <div className="space-y-4">
            <SettingsCard
              title="Change Password"
              description="Update your authentication credentials."
            >
              <form
                onSubmit={handleChangePassword}
                className="space-y-4 max-w-lg"
              >
                <InputField
                  id="current-pw"
                  label="Current Password"
                  icon={Lock}
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <InputField
                  id="new-pw"
                  label="New Password"
                  icon={KeyRound}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <InputField
                  id="confirm-pw"
                  label="Confirm New Password"
                  icon={KeyRound}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {newPassword &&
                  confirmPassword &&
                  newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">
                      Passwords do not match.
                    </p>
                  )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={
                      saving ||
                      !currentPassword ||
                      !newPassword ||
                      newPassword !== confirmPassword
                    }
                    className="flex items-center gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Update Password
                  </Button>
                </div>
              </form>
            </SettingsCard>

            <SettingsCard title="Session Information">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Signed in as</span>
                  <span className="text-foreground font-medium">{email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span className="text-foreground font-medium">Operator</span>
                </div>
              </div>
            </SettingsCard>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <SettingsCard
            title="Notification Preferences"
            description="Configure how you receive alerts and updates."
          >
            <div className="max-w-lg divide-y divide-border">
              <Toggle
                enabled={notifyAlerts}
                onToggle={() => setNotifyAlerts(!notifyAlerts)}
                label="Match alert notifications"
              />
              <Toggle
                enabled={notifyDeviceOffline}
                onToggle={() => setNotifyDeviceOffline(!notifyDeviceOffline)}
                label="Device offline alerts"
              />
              <Toggle
                enabled={notifyNewVersion}
                onToggle={() => setNotifyNewVersion(!notifyNewVersion)}
                label="Hitlist version updates"
              />
              <Toggle
                enabled={notifySounds}
                onToggle={() => setNotifySounds(!notifySounds)}
                label="Sound effects"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Notification preferences are stored locally. Server-side delivery is
              not yet implemented.
            </p>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="system" className="mt-6">
          <div className="space-y-4">
            <SettingsCard title="System Information">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="text-foreground font-mono text-xs">
                    Vehicle Surveillance v1.0
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API Endpoint</span>
                  <span className="text-foreground font-mono text-xs">
                    {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Frontend</span>
                  <span className="text-foreground font-mono text-xs">
                    Next.js + Tailwind
                  </span>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Appearance"
              description="Visual preferences for the portal interface."
            >
              <div className="max-w-lg space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">Dark Mode</span>
                  </div>
                  <Badge variant="secondary">Always on</Badge>
                </div>
              </div>
            </SettingsCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
