"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, BadgeCheck, Bell, Building2, CalendarDays, Camera, Check,
  ClipboardCheck, ClipboardCopy, Clock3, ExternalLink, Eye, EyeOff, FileCheck2, FileImage,
  FileScan, History, LayoutDashboard, ListChecks, LoaderCircle, LockKeyhole, LogOut,
  Menu, Pencil, Plus, Save, Search, Settings, ShieldCheck, Stethoscope, Trash2, Upload,
  UserCheck, UserCog, UserRound, UsersRound, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

const TESTS = [
  { key: "haemoglobin", label: "Haemoglobin", unit: "g/dL", aliases: ["haemoglobin", "hemoglobin", "hgb", "hb"] },
  { key: "wbc", label: "WBC", unit: "/µL", aliases: ["total leucocyte count", "total leukocyte count", "wbc", "tlc"] },
  { key: "rbc", label: "RBC", unit: "million/µL", aliases: ["red blood cell", "rbc"] },
  { key: "platelets", label: "Platelets", unit: "/µL", aliases: ["platelet count", "platelets", "plt"] },
  { key: "haematocrit", label: "Haematocrit", unit: "%", aliases: ["haematocrit", "hematocrit", "pcv", "hct"] },
  { key: "mcv", label: "MCV", unit: "fL", aliases: ["mcv"] },
  { key: "mch", label: "MCH", unit: "pg", aliases: ["mch"] },
  { key: "mchc", label: "MCHC", unit: "g/dL", aliases: ["mchc"] },
  { key: "neutrophils", label: "Neutrophils", unit: "%", aliases: ["neutrophils", "neutrophil"] },
  { key: "lymphocytes", label: "Lymphocytes", unit: "%", aliases: ["lymphocytes", "lymphocyte"] },
  { key: "sodium", label: "Sodium", unit: "mmol/L", aliases: ["serum sodium", "sodium", "na+"] },
  { key: "potassium", label: "Potassium", unit: "mmol/L", aliases: ["serum potassium", "potassium", "k+"] },
  { key: "chloride", label: "Chloride", unit: "mmol/L", aliases: ["serum chloride", "chloride", "cl-"] },
  { key: "creatinine", label: "Creatinine", unit: "mg/dL", aliases: ["serum creatinine", "creatinine"] },
  { key: "urea", label: "Urea", unit: "mg/dL", aliases: ["blood urea", "urea"] },
] as const;

type TestKey = (typeof TESTS)[number]["key"];
type Values = Record<TestKey, string>;
type EntryMode = "manual" | "scan";
type StaffRole = "nurse" | "doctor" | "admin" | "viewer";
type MemberStatus = "pending" | "active" | "inactive";
type NavView = "Dashboard" | "Patients" | "Emergency Admissions" | "Verification" | "Team" | "Activity" | "History" | "Settings";
type Membership = { hospitalId: string; hospitalName: string; hospitalCode: string; role: StaffRole; status: MemberStatus };
type ReportAttachment = { id: string; fileName: string; url: string; uploadedAt: string };
type PatientRecord = { recordId: string; id: string; name: string; age: string; createdAt: string; updatedAt: string; source: "Manual" | "Scan / upload"; values: Values; reports: ReportAttachment[]; reportCount: number; reportFileName?: string | null; reportUrl?: string | null; status: "pending" | "verified"; createdByEmail?: string | null; assignedToEmail?: string | null; verifiedByEmail?: string | null; verifiedAt?: string | null };
type PlatformUser = { email: string; name: string };
type StaffProfile = { email: string; name: string; staffId: string; membership: Membership | null };
type ActiveProfile = StaffProfile & { membership: Membership & { status: "active" } };
type TeamMember = { email: string; name: string; staffId: string; role: StaffRole; status: MemberStatus; joinedAt: string };
type AuditEvent = { id: string; recordId?: string | null; actorEmail: string; actorName: string; action: string; details: string; createdAt: string };
type DeleteTarget = { type: "record"; record: PatientRecord } | { type: "report"; record: PatientRecord; report: ReportAttachment };

const ROLE_LABELS: Record<StaffRole, string> = { nurse: "Nurse", doctor: "Doctor / Supervisor", admin: "Hospital Admin", viewer: "Read-only Viewer" };

const blankValues = () => Object.fromEntries(TESTS.map((test) => [test.key, ""])) as Values;
const reportTotal = (records: PatientRecord[]) => records.reduce((total, record) => total + record.reports.length, 0);

function Logo({ inverse = false }: { inverse?: boolean }) {
  return <div className="brand-lockup"><span className={inverse ? "brand-mark brand-mark-inverse" : "brand-mark"}><Plus aria-hidden="true" /></span><span className={inverse ? "brand-name text-white" : "brand-name"}>Rapid<span>Lab</span></span></div>;
}

function AuthScreen({ onAuthenticated, initialError = "" }: { onAuthenticated: (session: { user: PlatformUser; profile: StaffProfile }) => void; initialError?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupStep, setSignupStep] = useState<"details" | "otp">("details");
  const [name, setName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  function changeMode(value: "signin" | "signup") {
    setMode(value);
    setSignupStep("details");
    setOtp("");
  }

  async function requestSignupCode() {
    if (!name.trim() || !staffId.trim()) return void toast.error("Enter your full name and Staff ID.");
    if (!email.trim() || !password) return void toast.error("Enter your email and password.");
    if (password !== confirmPassword) return void toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, staffId, email, password }),
      });
      const payload = await response.json() as { verificationRequired?: boolean; email?: string; error?: string };
      if (!response.ok || !payload.verificationRequired) throw new Error(payload.error || "Could not send verification code");
      if (payload.email) setEmail(payload.email);
      setOtp("");
      setSignupStep("otp");
      toast.success("Verification code sent. Check your email.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send verification code"); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup" && signupStep === "details") return void await requestSignupCode();
    if (!email.trim() || (mode === "signin" && !password)) return void toast.error("Enter your email and password.");
    if (mode === "signup" && !/^\d{6}$/.test(otp)) return void toast.error("Enter the 6-digit code from your email.");
    setBusy(true);
    try {
      const response = await fetch(mode === "signin" ? "/api/auth/signin" : "/api/auth/verify-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signin" ? { email, password } : { email, code: otp }),
      });
      const payload = await response.json() as { user?: PlatformUser; profile?: StaffProfile; error?: string };
      if (!response.ok || !payload.user || !payload.profile) throw new Error(payload.error || (mode === "signin" ? "Could not sign in" : "Could not create account"));
      toast.success(mode === "signin" ? "Welcome back." : "Email verified. RapidLab account created.");
      onAuthenticated({ user: payload.user, profile: payload.profile });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not continue"); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-story" aria-label="RapidLab introduction">
      <Logo />
      <div className="auth-story-copy"><p className="eyebrow"><Zap /> Emergency care workflow</p><h1>Move from <em>paper</em> to <em>patient</em> in seconds.</h1><p>Fast laboratory data entry for high-pressure emergency care.</p></div>
      <p className="trust-line"><ShieldCheck /> Human-verified data entry · Clinical prototype</p>
    </section>
    <section className="auth-panel"><div className="auth-card">
      <p className="eyebrow">Staff access</p><h2>{mode === "signin" ? "Staff Login" : "Create Staff Account"}</h2>
      <p className="auth-intro">{mode === "signin" ? "Use your RapidLab email and password to open your hospital workspace." : signupStep === "otp" ? `We sent a 6-digit verification code to ${email}.` : "Create your own RapidLab login and verify your email before joining a hospital."}</p>
      {initialError && <div className="auth-status"><ShieldCheck /><span>{initialError}</span></div>}
      <Tabs value={mode} onValueChange={(value) => changeMode(value as "signin" | "signup")}>
        <TabsList className="auth-tabs"><TabsTrigger value="signin">Sign in</TabsTrigger><TabsTrigger value="signup">Sign up</TabsTrigger></TabsList>
        <form onSubmit={submit}>
          <TabsContent value="signin" className="auth-form">
            <Field label="Email address" value={email} onChange={setEmail} placeholder="nurse@hospital.org" type="email" />
            <PasswordField label="Password" value={password} onChange={setPassword} placeholder="Enter your password" />
            <p className="secure-note"><LockKeyhole /> Your account and hospital membership are checked before records are loaded.</p>
          </TabsContent>
          <TabsContent value="signup" className="auth-form">
            {signupStep === "details" ? <>
              <div className="auth-field-row"><Field label="Full name" value={name} onChange={setName} placeholder="Nurse name" /><Field label="Staff ID" value={staffId} onChange={setStaffId} placeholder="Example: NUR-204" /></div>
              <Field label="Email address" value={email} onChange={setEmail} placeholder="nurse@hospital.org" type="email" />
              <PasswordField label="Password" value={password} onChange={setPassword} placeholder="At least 10 characters" />
              <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Enter the password again" />
              <p className="secure-note"><ShieldCheck /> Use at least 10 characters, including a letter and a number.</p>
            </> : <div className="otp-step">
              <label className="field"><span>Email verification code</span>
                <InputOTP maxLength={6} value={otp} onChange={setOtp} inputMode="numeric" autoFocus aria-label="Six-digit email verification code">
                  <InputOTPGroup className="otp-group">
                    {[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot className="otp-slot" index={index} key={index} />)}
                  </InputOTPGroup>
                </InputOTP>
              </label>
              <p className="secure-note"><ShieldCheck /> The code expires in 10 minutes and can be used only once.</p>
              <div className="otp-actions"><button type="button" onClick={() => { setSignupStep("details"); setOtp(""); }} disabled={busy}>Change details</button><button type="button" onClick={() => void requestSignupCode()} disabled={busy}>Resend code</button></div>
            </div>}
          </TabsContent>
          <Button className="primary-cta" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" />}{mode === "signin" ? "Sign In" : signupStep === "otp" ? busy ? "Verifying…" : "Verify & Create Account" : busy ? "Sending code…" : "Send Verification Code"} {!busy && <ArrowRight />}</Button>
        </form>
      </Tabs>
      <p className="auth-switch">{mode === "signin" ? "Don’t have an account?" : "Already registered?"} <button type="button" onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create Account" : "Sign In"}</button></p>
      <div className="account-benefit"><BadgeCheck /><span><strong>Account-specific records</strong><small>Data and uploaded reports are shown only through your approved hospital membership.</small></span></div>
      <p className="auth-footnote">Existing staff: sign up once with the same email and original Staff ID to reconnect your saved workspace.</p>
    </div></section><Toaster position="top-center" />
  </main>;
}

function HospitalOnboarding({ profile, onProfile, onLogout }: { profile: StaffProfile; onProfile: (profile: StaffProfile) => void; onLogout: () => void }) {
  const [mode, setMode] = useState<"create" | "join">("join");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalCode, setHospitalCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshProfile = useCallback(async (interactive = true) => {
    if (interactive) setBusy(true);
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const payload = await response.json() as { profile?: StaffProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Could not refresh membership");
      onProfile(payload.profile);
      if (payload.profile.membership?.status === "active") toast.success("Hospital access approved.");
      else if (interactive) toast.info("Your request is still waiting for Hospital Admin approval.");
    } catch (error) {
      if (interactive) toast.error(error instanceof Error ? error.message : "Could not refresh membership");
    } finally { if (interactive) setBusy(false); }
  }, [onProfile]);

  useEffect(() => {
    if (!profile.membership || profile.membership.status === "active") return;
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshProfile(false); };
    const interval = window.setInterval(refreshWhenVisible, 5000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [profile.membership, refreshProfile]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/hospital", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, hospitalName, hospitalCode }) });
      const payload = await response.json() as { profile?: StaffProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Could not set up hospital access");
      onProfile(payload.profile);
      toast.success(mode === "create" ? "Hospital workspace created." : "Join request sent to the Hospital Admin.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not set up hospital access"); }
    finally { setBusy(false); }
  }

  if (profile.membership) return <main className="onboarding-shell"><section className="pending-access-card"><span className="pending-icon"><Clock3 /></span><p className="eyebrow">Approval pending</p><h1>{profile.membership.hospitalName}</h1><p>Your request to join as a Nurse has been sent. A Hospital Admin must approve it before patient records become visible.</p><div className="hospital-code-line"><Building2 /><span><small>Hospital code</small><strong>{profile.membership.hospitalCode}</strong></span></div><div className="pending-actions"><Button onClick={() => void refreshProfile(true)} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Activity />} Check approval</Button><Button variant="outline" onClick={onLogout}><LogOut /> Logout</Button></div></section><Toaster position="top-center" /></main>;

  return <main className="auth-shell hospital-onboarding"><section className="auth-story"><Logo /><div className="auth-story-copy"><p className="eyebrow"><Building2 /> Shared clinical workspace</p><h1>One hospital.<em>One patient history.</em></h1><p>Authorized nurses, doctors and administrators can work together without sharing passwords.</p></div><p className="trust-line"><ShieldCheck /> Role-based access · Complete activity history</p></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">Hospital setup</p><h2>Connect your workplace</h2><p className="auth-intro">Create a new hospital workspace or join your team with its hospital code.</p><Tabs value={mode} onValueChange={(value) => setMode(value as "create" | "join")}><TabsList className="auth-tabs"><TabsTrigger value="join">Join hospital</TabsTrigger><TabsTrigger value="create">Create hospital</TabsTrigger></TabsList><form className="auth-form" onSubmit={submit}>{mode === "join" ? <Field label="Hospital code" value={hospitalCode} onChange={setHospitalCode} placeholder="Example: HSP-4A92BC" /> : <Field label="Hospital or clinic name" value={hospitalName} onChange={setHospitalName} placeholder="Example: City Emergency Hospital" />}<p className="secure-note"><LockKeyhole /> {mode === "join" ? "An administrator must approve your access." : "You will become the first Hospital Admin."}</p><Button className="primary-cta" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : mode === "join" ? <UsersRound /> : <Building2 />}{busy ? "Please wait…" : mode === "join" ? "Request access" : "Create hospital workspace"}</Button></form></Tabs><Button variant="ghost" className="onboarding-logout" onClick={onLogout}><LogOut /> Use another account</Button></div></section><Toaster position="top-center" /></main>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="field"><span>{label}</span><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function PasswordField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{label}</span><span className="password-control"><Input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><button type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff /> : <Eye />}</button></span></label>;
}

function Dashboard({ profile, onProfileChange, onLogout }: { profile: ActiveProfile; onProfileChange: (profile: StaffProfile) => void; onLogout: () => void }) {
  const staffName = profile.name;
  const role = profile.membership.role;
  const roleLabel = ROLE_LABELS[role];
  const [view, setView] = useState<NavView>("Dashboard");
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PatientRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<PatientRecord | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("manual");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [values, setValues] = useState<Values>(blankValues);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "scan" | "manual">("all");
  const [settingsName, setSettingsName] = useState(profile.name);
  const [settingsStaffId, setSettingsStaffId] = useState(profile.staffId);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const teamRoleDrafts = useRef(new Set<string>());
  const initials = useMemo(() => staffName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), [staffName]);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()), []);
  const visiblePatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    return query ? records.filter((record) => `${record.name} ${record.id}`.toLowerCase().includes(query)) : records;
  }, [records, patientSearch]);
  const historyRecords = useMemo(() => records.filter((record) => historyFilter === "all" || (historyFilter === "scan" ? record.reports.length > 0 : record.reports.length === 0)), [records, historyFilter]);

  const refreshWorkspace = useCallback(async (showErrors = false) => {
    const requests: Promise<void>[] = [
      fetch("/api/records", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as { records?: PatientRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load records");
        const freshRecords = payload.records ?? [];
        setRecords(freshRecords);
        setSelectedRecord((current) => current ? freshRecords.find((record) => record.recordId === current.recordId) ?? current : null);
      }),
    ];

    if (role === "admin") requests.push(fetch("/api/team", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { members?: TeamMember[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load hospital staff");
      const freshMembers = payload.members ?? [];
      setTeam((current) => {
        const currentByEmail = new Map(current.map((member) => [member.email, member]));
        return freshMembers.map((member) => teamRoleDrafts.current.has(member.email) ? { ...member, role: currentByEmail.get(member.email)?.role ?? member.role } : member);
      });
    }));

    if (role === "admin" || role === "doctor") requests.push(fetch("/api/activity", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { activity?: AuditEvent[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load activity");
      setActivity(payload.activity ?? []);
    }));

    const results = await Promise.allSettled(requests);
    if (showErrors && results.some((result) => result.status === "rejected")) toast.error("Some hospital updates could not be loaded. RapidLab will keep trying automatically.");
  }, [role]);

  useEffect(() => {
    let stopped = false;
    let refreshing = false;
    const refresh = async (showErrors = false) => {
      if (stopped || refreshing) return;
      refreshing = true;
      await refreshWorkspace(showErrors);
      refreshing = false;
    };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refresh(false); };
    void refresh(true);
    const interval = window.setInterval(refreshWhenVisible, 5000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshWorkspace]);

  function changeMemberRole(email: string, nextRole: StaffRole) {
    teamRoleDrafts.current.add(email);
    setTeam((current) => current.map((member) => member.email === email ? { ...member, role: nextRole } : member));
  }

  function startEntry(mode: EntryMode) {
    setEditingRecord(null); setEntryMode(mode); setPatientName(""); setPatientAge(""); setValues(blankValues()); setReportFiles([]); setOcrText(""); setOcrProgress(null); setEntryOpen(true);
  }

  function startEdit(record: PatientRecord, preferredMode?: EntryMode) {
    setEditingRecord(record); setEntryMode(preferredMode ?? (record.source === "Manual" ? "manual" : "scan")); setPatientName(record.name); setPatientAge(record.age); setValues(record.values); setReportFiles([]); setOcrText(""); setOcrProgress(null); setSelectedRecord(null); setEntryOpen(true);
  }

  async function readReports(selected?: FileList | null) {
    if (!selected?.length) return;
    const room = Math.max(0, 8 - reportFiles.length);
    const files = Array.from(selected).slice(0, room);
    if (!files.length) return void toast.error("You can add up to 8 report files at a time.");
    if (selected.length > room) toast.info(`Only the first ${room} additional file${room === 1 ? " was" : "s were"} added.`);
    setReportFiles((current) => [...current, ...files]);
    const readableFiles = files.filter((file) => file.type !== "application/pdf");
    if (!readableFiles.length) {
      setOcrProgress(null);
      toast.success(`${files.length} PDF report${files.length === 1 ? "" : "s"} ready to save. Add the patient details; lab values may stay blank.`);
      return;
    }
    setOcrProgress(1);
    let extractedCount = 0;
    let failedCount = 0;
    const detectedText: string[] = [];
    try {
      const Tesseract = await import("tesseract.js");
      for (let index = 0; index < readableFiles.length; index += 1) {
        try {
          const result = await Tesseract.recognize(readableFiles[index], "eng", { logger(message) { if (message.status === "recognizing text" && typeof message.progress === "number") setOcrProgress(Math.max(2, Math.round(((index + message.progress) / readableFiles.length) * 100))); } });
          const text = result.data.text || "";
          detectedText.push(`--- ${readableFiles[index].name} ---\n${text}`);
          const extracted = extractValues(text);
          extractedCount += Object.values(extracted.values).filter(Boolean).length;
          setValues((current) => {
            const next = { ...current };
            for (const test of TESTS) if (!next[test.key] && extracted.values[test.key]) next[test.key] = extracted.values[test.key];
            return next;
          });
          if (extracted.name) setPatientName((current) => current || extracted.name || "");
          if (extracted.age) setPatientAge((current) => current || extracted.age || "");
        } catch { failedCount += 1; }
      }
      setOcrText((current) => [current, ...detectedText].filter(Boolean).join("\n\n"));
      setOcrProgress(100);
      if (failedCount === readableFiles.length) toast.info("The reports were added without extracted values. Add the patient details, then save them as they are.");
      else if (!extractedCount) toast.info("The reports were added, but none of the 15 values were found. You can still save them with the patient details.");
      else toast.success(`${files.length} report${files.length === 1 ? "" : "s"} added. ${extractedCount} value${extractedCount === 1 ? "" : "s"} extracted—please verify them.`);
    } catch { setOcrProgress(null); toast.info("The report reader could not start. The selected files are still ready to save without extracted values."); }
  }

  async function saveRecord() {
    if (!patientName.trim()) return void toast.error("Enter the patient name before saving.");
    setSaving(true);
    try {
      let response: Response;
      if (editingRecord) {
        response = await fetch(`/api/records/${editingRecord.recordId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientName: patientName.trim(), patientAge: patientAge.trim(), values }) });
      } else {
        const form = new FormData();
        form.set("patientName", patientName.trim()); form.set("patientAge", patientAge.trim());
        form.set("source", entryMode === "manual" ? "Manual" : "Scan / upload"); form.set("values", JSON.stringify(values));
        for (const report of reportFiles) form.append("reports", report);
        response = await fetch("/api/records", { method: "POST", body: form });
      }
      const payload = await response.json() as { record?: PatientRecord; error?: string };
      if (!response.ok || !payload.record) throw new Error(payload.error || "Could not save record");
      let savedRecord = payload.record;
      if (editingRecord && reportFiles.length) {
        const reportForm = new FormData();
        for (const report of reportFiles) reportForm.append("reports", report);
        const reportResponse = await fetch(`/api/records/${editingRecord.recordId}/reports`, { method: "POST", body: reportForm });
        const reportPayload = await reportResponse.json() as { reports?: ReportAttachment[]; status?: "pending"; updatedAt?: string; error?: string };
        if (!reportResponse.ok || !reportPayload.reports) throw new Error(reportPayload.error || "Patient details were saved, but the report files could not be attached");
        const combinedReports = [...savedRecord.reports, ...reportPayload.reports];
        savedRecord = { ...savedRecord, source: "Scan / upload", reports: combinedReports, reportCount: combinedReports.length, reportFileName: combinedReports[0]?.fileName ?? null, reportUrl: combinedReports[0]?.url ?? null, status: "pending", updatedAt: reportPayload.updatedAt || savedRecord.updatedAt };
      }
      setRecords((current) => editingRecord ? current.map((item) => item.recordId === savedRecord.recordId ? savedRecord : item) : [savedRecord, ...current]);
      void refreshWorkspace();
      setReportFiles([]); setEditingRecord(null); setEntryOpen(false); toast.success(editingRecord ? `Patient record updated${reportFiles.length ? ` with ${reportFiles.length} new report file${reportFiles.length === 1 ? "" : "s"}` : ""}.` : `Patient record saved with ${reportFiles.length} report file${reportFiles.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save record");
    } finally { setSaving(false); }
  }

  async function verifyRecord(record: PatientRecord) {
    setVerifying(true);
    try {
      const response = await fetch(`/api/records/${record.recordId}/verify`, { method: "POST" });
      const payload = await response.json() as { status?: "verified"; verifiedByEmail?: string; verifiedAt?: string; updatedAt?: string; error?: string };
      if (!response.ok || !payload.status) throw new Error(payload.error || "Could not verify record");
      const next = { ...record, status: payload.status, verifiedByEmail: payload.verifiedByEmail, verifiedAt: payload.verifiedAt, updatedAt: payload.updatedAt || record.updatedAt };
      setRecords((current) => current.map((item) => item.recordId === record.recordId ? next : item)); setSelectedRecord(next); toast.success("Patient record verified.");
      void refreshWorkspace();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not verify record"); }
    finally { setVerifying(false); }
  }

  async function saveMember(member: TeamMember, status: "active" | "inactive") {
    try {
      const response = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: member.email, role: member.role, status }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update staff access");
      teamRoleDrafts.current.delete(member.email);
      setTeam((current) => current.map((item) => item.email === member.email ? { ...item, status } : item)); toast.success(status === "active" ? "Staff access activated." : "Staff access paused.");
      void refreshWorkspace();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update staff access"); }
  }

  async function removeMember(member: TeamMember) {
    try {
      const response = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: member.email }) });
      const payload = await response.json() as { ok?: boolean; emailSent?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not remove staff account");
      teamRoleDrafts.current.delete(member.email);
      setTeam((current) => current.filter((item) => item.email !== member.email));
      void refreshWorkspace();
      toast.success("Staff login removed. Hospital patient records were retained.");
      if (!payload.emailSent) toast.info("Access was removed, but the notification email could not be delivered.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove staff account"); }
  }

  async function confirmDeleteTarget() {
    if (!deleteTarget) return;
    setDeletingTarget(true);
    try {
      const endpoint = deleteTarget.type === "record"
        ? `/api/records/${deleteTarget.record.recordId}`
        : `/api/records/${deleteTarget.record.recordId}/reports/${deleteTarget.report.id}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; status?: "pending"; updatedAt?: string; cleanupPending?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || (deleteTarget.type === "record" ? "Could not delete the patient record" : "Could not delete the lab report"));

      if (deleteTarget.type === "record") {
        const recordId = deleteTarget.record.recordId;
        setRecords((current) => current.filter((record) => record.recordId !== recordId));
        setSelectedRecord(null);
        toast.success("Patient record and its uploaded reports were deleted.");
      } else {
        const { record: targetRecord, report } = deleteTarget;
        const removeReport = (record: PatientRecord) => {
          const reports = record.reports.filter((item) => item.id !== report.id);
          return { ...record, reports, reportCount: reports.length, reportFileName: reports[0]?.fileName ?? null, reportUrl: reports[0]?.url ?? null, status: payload.status ?? "pending", verifiedByEmail: null, verifiedAt: null, updatedAt: payload.updatedAt ?? record.updatedAt };
        };
        setRecords((current) => current.map((record) => record.recordId === targetRecord.recordId ? removeReport(record) : record));
        setSelectedRecord((current) => current?.recordId === targetRecord.recordId ? removeReport(current) : current);
        toast.success("Lab report deleted. The patient record was kept.");
      }
      if (payload.cleanupPending) toast.info("The record was removed from RapidLab. Secure file cleanup will be retried by storage.");
      setDeleteTarget(null);
      void refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete the deletion");
    } finally { setDeletingTarget(false); }
  }

  async function saveProfileSettings() {
    if (!settingsName.trim() || !settingsStaffId.trim()) return void toast.error("Enter your name and staff ID.");
    setSettingsSaving(true);
    try {
      const response = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: settingsName, staffId: settingsStaffId }) });
      const payload = await response.json() as { profile?: StaffProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Could not save settings");
      onProfileChange(payload.profile); toast.success("Staff profile updated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save settings"); }
    finally { setSettingsSaving(false); }
  }

  const navItems: { label: NavView; icon: typeof LayoutDashboard }[] = [
    { label: "Dashboard", icon: LayoutDashboard }, { label: "Patients", icon: UsersRound },
    ...(role === "nurse" ? [{ label: "Emergency Admissions" as NavView, icon: Zap }] : []),
    ...(role === "doctor" ? [{ label: "Verification" as NavView, icon: ClipboardCheck }, { label: "Activity" as NavView, icon: ListChecks }] : []),
    ...(role === "admin" ? [{ label: "Verification" as NavView, icon: ClipboardCheck }, { label: "Team" as NavView, icon: UserCog }, { label: "Activity" as NavView, icon: ListChecks }] : []),
    { label: "History", icon: History }, { label: "Settings", icon: Settings },
  ];

  return <SidebarProvider>
    <Sidebar className="rapid-sidebar" collapsible="offcanvas">
      <SidebarHeader className="sidebar-logo"><Logo /></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
        {navItems.map((item) => <SidebarMenuItem key={item.label}><SidebarMenuButton isActive={view === item.label} onClick={() => setView(item.label)} tooltip={item.label}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
      </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="sidebar-footer"><div className="hospital-mini"><Building2 /><span><strong>{profile.membership.hospitalName}</strong><small>{profile.membership.hospitalCode}</small></span></div><div className="staff-mini"><span>{initials}</span><div><strong>{staffName}</strong><small>{roleLabel}</small></div></div><Button variant="ghost" className="logout-button" onClick={onLogout}><LogOut /> Logout</Button></SidebarFooter>
    </Sidebar>
    <SidebarInset className="dashboard-shell">
      <header className="topbar"><div className="topbar-left"><SidebarTrigger><Menu /></SidebarTrigger><span>{profile.membership.hospitalName}</span><i>/</i><span className="muted">{view}</span></div><div className="topbar-profile"><Bell /><span className="avatar">{initials}</span><div><strong>{staffName}</strong><small>{roleLabel}</small></div></div></header>
      <main className="dashboard-main">
        {view === "Dashboard" && <RoleDashboard profile={profile} dateLabel={dateLabel} records={records} team={team} activity={activity} onManual={() => startEntry("manual")} onScan={() => startEntry("scan")} onView={setSelectedRecord} onVerify={verifyRecord} />}
        {view === "Patients" && <PatientsWorkspace records={visiblePatients} search={patientSearch} onSearch={setPatientSearch} canCreate={role !== "viewer"} onNew={() => startEntry("manual")} onView={setSelectedRecord} />}
        {view === "Emergency Admissions" && <EmergencyWorkspace records={records} onManual={() => startEntry("manual")} onScan={() => startEntry("scan")} onView={setSelectedRecord} />}
        {view === "Verification" && <VerificationWorkspace records={records.filter((record) => record.status === "pending")} onView={setSelectedRecord} onVerify={verifyRecord} verifying={verifying} />}
        {view === "Team" && <TeamWorkspace members={team} currentEmail={profile.email} onRoleChange={changeMemberRole} onSave={saveMember} onRemove={removeMember} />}
        {view === "Activity" && <ActivityWorkspace activity={activity} />}
        {view === "History" && <HistoryWorkspace records={historyRecords} filter={historyFilter} onFilter={setHistoryFilter} onView={setSelectedRecord} />}
        {view === "Settings" && <SettingsWorkspace profile={profile} name={settingsName} staffId={settingsStaffId} saving={settingsSaving} onName={setSettingsName} onStaffId={setSettingsStaffId} onSave={saveProfileSettings} onAccountDeleted={onLogout} />}
      </main>
    </SidebarInset>
    <Dialog open={entryOpen} onOpenChange={(open) => { setEntryOpen(open); if (!open) setEditingRecord(null); }}><DialogContent className="entry-dialog">
      <DialogHeader><DialogTitle>{editingRecord ? `Edit ${editingRecord.id}` : "New laboratory record"}</DialogTitle><DialogDescription>{editingRecord ? "Changes are shared with the hospital and return the record to pending verification." : "Add the patient details and report. The record can be saved even when none of the 15 values is available."}</DialogDescription></DialogHeader>
      <Tabs value={entryMode} onValueChange={(value) => setEntryMode(value as EntryMode)}><TabsList className="entry-tabs"><TabsTrigger value="manual"><UserRound /> Manual entry</TabsTrigger><TabsTrigger value="scan"><FileScan /> Scan & upload</TabsTrigger></TabsList>
        <TabsContent value="manual"><p className="mode-note">Type only the values written on the patient’s report.</p></TabsContent>
        <TabsContent value="scan">{editingRecord?.reports.length ? <div className="existing-report-note"><FileImage /><span><strong>{editingRecord.reports.length} saved report{editingRecord.reports.length === 1 ? "" : "s"}</strong><small>They will remain attached. Add more images or PDFs below whenever the patient has another lab report.</small></span></div> : null}<div className="upload-zone">
          <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { void readReports(event.currentTarget.files); event.currentTarget.value = ""; }} />
          <input ref={uploadRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={(event) => { void readReports(event.currentTarget.files); event.currentTarget.value = ""; }} />
          <span><Camera /></span><div><strong>{reportFiles.length ? `${reportFiles.length} new report${reportFiles.length === 1 ? "" : "s"} selected` : "Scan or upload several lab reports"}</strong><p>Choose up to 8 JPG, PNG, WebP or PDF files at a time. Reports can be saved even when no lab values are extracted.</p></div><div><Button type="button" onClick={() => cameraRef.current?.click()}><Camera /> Scan another</Button><Button type="button" variant="outline" onClick={() => uploadRef.current?.click()}><Upload /> Upload multiple</Button></div>
        </div>{reportFiles.length ? <div className="pending-report-list">{reportFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><FileImage /><span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · ready to save</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setReportFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X /></button></div>)}</div> : null}{ocrProgress !== null && <div className="ocr-progress"><span style={{ width: `${ocrProgress}%` }} /><p>{ocrProgress < 100 ? <><LoaderCircle className="spin" /> Reading reports… {ocrProgress}%</> : <><Check /> Extraction complete — verify the 15 fields below</>}</p></div>}{ocrText && <details className="ocr-raw"><summary>View detected report text</summary><pre>{ocrText}</pre></details>}</TabsContent>
      </Tabs>
      <div className="patient-fields"><Field label="Patient name" value={patientName} onChange={setPatientName} placeholder="Enter or verify patient name" /><Field label="Age (years)" value={patientAge} onChange={setPatientAge} placeholder="Enter or verify age" /></div>
      <div className="lab-grid" aria-label="Laboratory values">{TESTS.map((test) => <label className="lab-field" key={test.key}><span>{test.label}<small>{test.unit}</small></span><Input inputMode="decimal" value={values[test.key]} onChange={(event) => setValues((current) => ({ ...current, [test.key]: event.target.value }))} placeholder="Blank" /></label>)}</div>
      <div className="entry-actions"><p><ShieldCheck /> Doctor or supervisor verification is required after submission.</p><div><Button variant="outline" onClick={() => setEntryOpen(false)} disabled={saving}>Cancel</Button><Button onClick={saveRecord} disabled={saving}>{saving && <LoaderCircle className="spin" />}{saving ? "Saving…" : editingRecord ? "Save changes" : "Share with hospital"}</Button></div></div>
    </DialogContent></Dialog>
    <Dialog open={Boolean(selectedRecord)} onOpenChange={(open) => { if (!open) setSelectedRecord(null); }}><DialogContent className="record-dialog">
      {selectedRecord && <>
        <DialogHeader><DialogTitle>{selectedRecord.name}</DialogTitle><DialogDescription>{selectedRecord.id} · {selectedRecord.age ? `${selectedRecord.age} years` : "Age not entered"} · {new Date(selectedRecord.createdAt).toLocaleString()}</DialogDescription></DialogHeader>
        <div className="record-summary"><span><strong>Entry method</strong>{selectedRecord.source}</span><span><strong>Status</strong><b className={`record-status ${selectedRecord.status}`}>{selectedRecord.status === "verified" ? "Verified" : "Pending verification"}</b></span><span><strong>Created by</strong>{selectedRecord.createdByEmail || "Hospital staff"}</span><span><strong>Last updated</strong>{new Date(selectedRecord.updatedAt).toLocaleString()}</span></div>
        <div className="record-values">{TESTS.map((test) => <div key={test.key}><span>{test.label}<small>{test.unit}</small></span><strong>{selectedRecord.values[test.key] || "—"}</strong></div>)}</div>
        <section className="report-collection"><div className="report-collection-head"><div><FileImage /><span><strong>Patient lab reports</strong><small>{selectedRecord.reports.length ? `${selectedRecord.reports.length} saved file${selectedRecord.reports.length === 1 ? "" : "s"}` : "No reports attached"}</small></span></div>{role !== "viewer" && <Button variant="outline" size="sm" onClick={() => startEdit(selectedRecord, "scan")}><Plus /> Add reports</Button>}</div>{selectedRecord.reports.length ? <div className="saved-report-list">{selectedRecord.reports.map((report, index) => <div key={report.id}><span><FileCheck2 /><strong>Report {index + 1}</strong><small>{report.fileName} · {new Date(report.uploadedAt).toLocaleString()}</small></span><div className="saved-report-actions"><Button asChild size="sm"><a href={report.url} target="_blank" rel="noreferrer">Open <ExternalLink /></a></Button>{role !== "viewer" && <Button variant="destructive" size="sm" className="remove-staff-button" aria-label={`Delete ${report.fileName}`} onClick={() => setDeleteTarget({ type: "report", record: selectedRecord, report })}><Trash2 /> Delete</Button>}</div></div>)}</div> : <p className="no-report-copy">Use “Add reports” to attach the patient’s lab report images or PDFs.</p>}</section>
        <div className="record-dialog-actions">{role !== "viewer" && <Button variant="destructive" className="record-delete-button" onClick={() => setDeleteTarget({ type: "record", record: selectedRecord })}><Trash2 /> Delete patient record</Button>}{role !== "viewer" && <Button variant="outline" onClick={() => startEdit(selectedRecord)}><Pencil /> Edit patient details</Button>}{(role === "doctor" || role === "admin") && selectedRecord.status === "pending" && <Button onClick={() => verifyRecord(selectedRecord)} disabled={verifying}>{verifying ? <LoaderCircle className="spin" /> : <ClipboardCheck />} Verify record</Button>}</div>
      </>}
    </DialogContent></Dialog>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletingTarget) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleteTarget?.type === "record" ? "Delete this patient record?" : "Delete this lab report?"}</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.type === "record" ? `This permanently deletes ${deleteTarget.record.name} (${deleteTarget.record.id}), all 15 lab values, and ${deleteTarget.record.reports.length} uploaded report file${deleteTarget.record.reports.length === 1 ? "" : "s"}. The deletion itself remains in hospital activity history.` : `This permanently deletes ${deleteTarget?.report.fileName}. The patient record and its other reports will remain available, and the record will return to pending verification.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deletingTarget}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deletingTarget} onClick={(event) => { event.preventDefault(); void confirmDeleteTarget(); }}>{deletingTarget ? <LoaderCircle className="spin" /> : <Trash2 />}{deletingTarget ? "Deleting…" : deleteTarget?.type === "record" ? "Delete patient permanently" : "Delete report permanently"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Toaster position="top-center" />
  </SidebarProvider>;
}

function RoleDashboard({ profile, dateLabel, records, team, activity, onManual, onScan, onView, onVerify }: { profile: ActiveProfile; dateLabel: string; records: PatientRecord[]; team: TeamMember[]; activity: AuditEvent[]; onManual: () => void; onScan: () => void; onView: (record: PatientRecord) => void; onVerify: (record: PatientRecord) => void }) {
  const role = profile.membership.role;
  const pending = records.filter((record) => record.status === "pending");
  const verified = records.filter((record) => record.status === "verified");
  if (role === "nurse") return <DashboardOverview staffName={profile.name} hospitalName={profile.membership.hospitalName} dateLabel={dateLabel} records={records} onManual={onManual} onScan={onScan} onView={onView} />;

  if (role === "doctor") return <div className="workspace-page doctor-dashboard"><section className="welcome-row"><div><p className="eyebrow"><Stethoscope /> Clinical verification</p><h1>Review queue</h1><p>{profile.membership.hospitalName} · Doctor / Supervisor workspace</p></div><span className="role-banner doctor"><ClipboardCheck /> {pending.length} awaiting review</span></section><section className="metrics"><Metric icon={ClipboardCheck} label="Pending Verification" value={String(pending.length)} note="Need clinical review" tone="orange" /><Metric icon={Check} label="Verified Records" value={String(verified.length)} note="Approved for hospital use" tone="green" /><Metric icon={UsersRound} label="Patient Records" value={String(records.length)} note="Hospital-wide access" tone="teal" /><Metric icon={FileImage} label="Report Files" value={String(reportTotal(records))} note="Available to reopen" tone="green" /></section><VerificationQueue records={pending.slice(0, 8)} onView={onView} onVerify={onVerify} /></div>;

  if (role === "admin") return <div className="workspace-page admin-dashboard"><section className="welcome-row"><div><p className="eyebrow"><UserCog /> Hospital control center</p><h1>{profile.membership.hospitalName}</h1><p>Manage people, clinical verification, access and accountability.</p></div><button className="invite-code-card" onClick={() => { navigator.clipboard.writeText(profile.membership.hospitalCode); toast.success("Hospital code copied."); }}><ClipboardCopy /><span><small>Staff invitation code</small><strong>{profile.membership.hospitalCode}</strong></span></button></section><section className="metrics"><Metric icon={UsersRound} label="Hospital Staff" value={String(team.filter((member) => member.status === "active").length)} note="Active authorized users" tone="green" /><Metric icon={Clock3} label="Pending Verification" value={String(pending.length)} note="Admin or doctor can verify" tone="orange" /><Metric icon={FileCheck2} label="Patient Records" value={String(records.length)} note="Shared in this hospital" tone="teal" /><Metric icon={ListChecks} label="Activity Events" value={String(activity.length)} note="Recent accountable actions" tone="green" /></section><section className="admin-split"><article><div className="section-title"><div><h2>Pending staff</h2><p>Approve new hospital members from the Team page.</p></div><strong>{team.filter((member) => member.status === "pending").length}</strong></div>{team.filter((member) => member.status === "pending").length ? <div className="mini-list">{team.filter((member) => member.status === "pending").slice(0, 4).map((member) => <div key={member.email}><span className="avatar">{member.name[0]}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><b>Pending</b></div>)}</div> : <div className="compact-empty"><UserCheck /><span><strong>No pending requests</strong><small>All staff access requests are handled.</small></span></div>}</article><article><div className="section-title"><div><h2>Latest activity</h2><p>Recent changes across the hospital.</p></div></div><AuditList activity={activity.slice(0, 4)} /></article></section></div>;

  return <div className="workspace-page viewer-dashboard"><section className="welcome-row"><div><p className="eyebrow"><Eye /> Read-only hospital access</p><h1>Patient records</h1><p>{profile.membership.hospitalName} · View records without changing clinical data.</p></div><span className="role-banner viewer"><LockKeyhole /> Read only</span></section><section className="metrics"><Metric icon={UsersRound} label="Patient Records" value={String(records.length)} note="Available in this hospital" tone="green" /><Metric icon={Check} label="Verified" value={String(verified.length)} note="Doctor-approved records" tone="teal" /><Metric icon={FileImage} label="Report Files" value={String(reportTotal(records))} note="Available to reopen" tone="orange" /><Metric icon={Clock3} label="Pending" value={String(pending.length)} note="Awaiting verification" tone="green" /></section><RecentRecords records={records.slice(0, 8)} onView={onView} /></div>;
}

function DashboardOverview({ staffName, hospitalName, dateLabel, records, onManual, onScan, onView }: { staffName: string; hospitalName: string; dateLabel: string; records: PatientRecord[]; onManual: () => void; onScan: () => void; onView: (record: PatientRecord) => void }) {
  return <div className="workspace-page dashboard-view">
    <section className="welcome-row"><div><p className="eyebrow">{dateLabel}</p><h1>Good day, {staffName.split(" ")[0]}</h1><p>Nurse · {hospitalName} shared laboratory workspace</p></div><Button className="new-patient" onClick={onManual}><Plus /> New emergency patient</Button></section>
    <section className="metrics" aria-label="Daily summary">
      <Metric icon={UsersRound} label="Emergency Patients" value={String(records.length)} note="Hospital-wide records" tone="green" />
      <Metric icon={FileScan} label="Report Files" value={String(reportTotal(records))} note="Saved under patient records" tone="orange" />
      <Metric icon={Check} label="Verified Records" value={String(records.filter((record) => record.status === "verified").length)} note="Doctor-approved entries" tone="green" />
      <Metric icon={Clock3} label="Average Entry Time" value={records.length ? "< 3m" : "—"} note="Across submitted entries" tone="teal" />
    </section>
    <section className="admissions-head"><div><h2>Hospital activity</h2><p>Latest patient records shared by your coworkers.</p></div><Button variant="outline" className="scan-button" onClick={onScan}><FileScan /> Quick scan lab report</Button></section>
    <RecentRecords records={records.slice(0, 5)} onView={onView} onManual={onManual} onScan={onScan} />
  </div>;
}

function RecentRecords({ records, onView, onManual, onScan }: { records: PatientRecord[]; onView: (record: PatientRecord) => void; onManual?: () => void; onScan?: () => void }) {
  return <section className="queue-card"><div className="queue-title"><h3>Latest records</h3><span><i /> Hospital data</span></div>
    {records.length ? <Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Age</TableHead><TableHead>Entry time</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Record</TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.recordId || record.id}>
      <TableCell><PatientCell record={record} /></TableCell><TableCell>{record.age ? `${record.age} yrs` : "—"}</TableCell><TableCell>{new Date(record.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell><TableCell><span className="source-cell">{record.reports.length > 0 && <FileImage />}{record.source}</span></TableCell><TableCell><span className={`record-status ${record.status}`}>{record.status === "verified" ? "Verified" : "Pending"}</span></TableCell><TableCell><Button variant="ghost" size="sm" className="view-record" onClick={() => onView(record)}>View</Button></TableCell>
    </TableRow>)}</TableBody></Table> : onManual && onScan ? <EmptyRecords onManual={onManual} onScan={onScan} /> : <div className="simple-empty"><UsersRound /><h3>No hospital records yet</h3><p>Patient records will appear after clinical staff submit them.</p></div>}
  </section>;
}

function VerificationQueue({ records, onView, onVerify }: { records: PatientRecord[]; onView: (record: PatientRecord) => void; onVerify: (record: PatientRecord) => void }) {
  return <section className="queue-card"><div className="queue-title"><h3>Pending clinical verification</h3><span><i /> Live queue</span></div>{records.length ? <Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Submitted by</TableHead><TableHead>Source</TableHead><TableHead>Updated</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.recordId}><TableCell><PatientCell record={record} /></TableCell><TableCell>{record.createdByEmail || "Hospital staff"}</TableCell><TableCell>{record.source}</TableCell><TableCell>{new Date(record.updatedAt).toLocaleString()}</TableCell><TableCell><div className="inline-actions"><Button size="sm" variant="outline" onClick={() => onView(record)}>Review</Button><Button size="sm" onClick={() => onVerify(record)}><ClipboardCheck /> Verify</Button></div></TableCell></TableRow>)}</TableBody></Table> : <div className="simple-empty"><ClipboardCheck /><h3>Verification queue is clear</h3><p>New and edited records will appear here.</p></div>}</section>;
}

function VerificationWorkspace({ records, onView, onVerify, verifying }: { records: PatientRecord[]; onView: (record: PatientRecord) => void; onVerify: (record: PatientRecord) => void; verifying: boolean }) {
  return <div className="workspace-page"><PageHeading eyebrow="Clinical review" title="Pending Verification" description="Review nurse-entered values and scanned reports before approving them."><span className="live-badge"><i /> {verifying ? "Verifying…" : `${records.length} waiting`}</span></PageHeading><VerificationQueue records={records} onView={onView} onVerify={onVerify} /></div>;
}

function TeamWorkspace({ members, currentEmail, onRoleChange, onSave, onRemove }: { members: TeamMember[]; currentEmail: string; onRoleChange: (email: string, role: StaffRole) => void; onSave: (member: TeamMember, status: "active" | "inactive") => void; onRemove: (member: TeamMember) => void }) {
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  return <div className="workspace-page team-view">
    <PageHeading eyebrow="Hospital administration" title="Staff & Access" description="Approve staff, assign clinical roles, or remove access when someone leaves. Patient records always remain with the hospital." />
    <section className="role-guide"><article><UserRound /><span><strong>Nurse</strong><small>Create and update patient records</small></span></article><article><Stethoscope /><span><strong>Doctor</strong><small>Review and verify clinical entries</small></span></article><article><UserCog /><span><strong>Admin</strong><small>Manage staff and verify records</small></span></article><article><Eye /><span><strong>Viewer</strong><small>Read-only access to patient records</small></span></article></section>
    <section className="directory-card"><div className="directory-toolbar"><div><h2>Hospital staff</h2><p>Removing a staff account revokes its login without deleting hospital patient history.</p></div><span className="member-count">{members.length} members</span></div>{members.length ? <Table><TableHeader><TableRow><TableHead>Staff member</TableHead><TableHead>Staff ID</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.email}><TableCell><div className="patient-cell"><span>{member.name[0]}</span><div><strong>{member.name}{member.email === currentEmail ? " (You)" : ""}</strong><small>{member.email}</small></div></div></TableCell><TableCell>{member.staffId}</TableCell><TableCell><select className="role-select" value={member.role} disabled={member.email === currentEmail} onChange={(event) => onRoleChange(member.email, event.target.value as StaffRole)}><option value="nurse">Nurse</option><option value="doctor">Doctor / Supervisor</option><option value="admin">Hospital Admin</option><option value="viewer">Read-only Viewer</option></select></TableCell><TableCell><span className={`member-status ${member.status}`}>{member.status}</span></TableCell><TableCell>{member.email === currentEmail ? <span className="muted-status">Creator Admin · protected</span> : <div className="inline-actions">{member.status === "active" ? <><Button size="sm" onClick={() => onSave(member, "active")}><Save /> Save role</Button><Button size="sm" variant="outline" onClick={() => onSave(member, "inactive")}>Pause</Button></> : <Button size="sm" onClick={() => onSave(member, "active")}>{member.status === "pending" ? `Approve as ${ROLE_LABELS[member.role]}` : `Reactivate as ${ROLE_LABELS[member.role]}`}</Button>}<Button size="sm" variant="destructive" className="remove-staff-button" onClick={() => setRemoving(member)}><Trash2 /> Remove</Button></div>}</TableCell></TableRow>)}</TableBody></Table> : <div className="simple-empty"><UsersRound /><h3>No staff members found</h3></div>}</section>
    <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {removing?.name} from the hospital?</AlertDialogTitle><AlertDialogDescription>The staff login and hospital membership will be deleted immediately. All patient records, lab values, scanned reports, and audit history they created will remain stored under this hospital.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (removing) void onRemove(removing); setRemoving(null); }}>Remove staff account</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function ActivityWorkspace({ activity }: { activity: AuditEvent[] }) {
  return <div className="workspace-page activity-view"><PageHeading eyebrow="Accountability" title="Hospital Activity" description="See who created, updated, verified or approved access across the workspace."><ListChecks /></PageHeading><section className="activity-card"><AuditList activity={activity} /></section></div>;
}

function AuditList({ activity }: { activity: AuditEvent[] }) {
  return activity.length ? <div className="audit-list">{activity.map((event) => <article key={event.id}><span className={`audit-icon ${event.action}`}><ListChecks /></span><div><strong>{event.details}</strong><small>{event.actorName} · {event.actorEmail}</small></div><time>{new Date(event.createdAt).toLocaleString()}</time></article>)}</div> : <div className="compact-empty"><ListChecks /><span><strong>No activity yet</strong><small>Hospital actions will appear here.</small></span></div>;
}

function PatientsWorkspace({ records, search, onSearch, canCreate, onNew, onView }: { records: PatientRecord[]; search: string; onSearch: (value: string) => void; canCreate: boolean; onNew: () => void; onView: (record: PatientRecord) => void }) {
  const scanned = reportTotal(records);
  return <div className="workspace-page patients-view">
    <PageHeading eyebrow="Hospital patient directory" title="Patients" description="Find records shared by authorized staff in this hospital.">{canCreate && <Button onClick={onNew}><Plus /> Add patient record</Button>}</PageHeading>
    <section className="patient-insights"><article><UsersRound /><div><strong>{records.length}</strong><span>Matching records</span></div></article><article><FileImage /><div><strong>{scanned}</strong><span>Saved report files</span></div></article><article><UserCheck /><div><strong>{records.length}</strong><span>Patient entries</span></div></article></section>
    <section className="directory-card"><div className="directory-toolbar"><div><h2>Patient list</h2><p>Search by patient name or record ID.</p></div><label className="search-box"><Search /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search patients…" /></label></div>
      {records.length ? <Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Record ID</TableHead><TableHead>Age</TableHead><TableHead>Created by</TableHead><TableHead>Status</TableHead><TableHead>Reports</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.recordId || record.id}><TableCell><PatientCell record={record} /></TableCell><TableCell>{record.id}</TableCell><TableCell>{record.age || "—"}</TableCell><TableCell>{record.createdByEmail || "Hospital staff"}</TableCell><TableCell><span className={`record-status ${record.status}`}>{record.status}</span></TableCell><TableCell>{record.reports.length ? <span className="file-status"><FileImage /> {record.reports.length} saved</span> : <span className="muted-status">No images</span>}</TableCell><TableCell><Button variant="outline" size="sm" onClick={() => onView(record)}>Open patient</Button></TableCell></TableRow>)}</TableBody></Table> : <div className="simple-empty"><Search /><h3>{search ? "No matching patients" : "No patients yet"}</h3><p>{search ? "Try a different patient name or record ID." : "Patient records will appear when clinical staff submit them."}</p>{!search && canCreate && <Button onClick={onNew}><Plus /> Add patient</Button>}</div>}
    </section>
  </div>;
}

function EmergencyWorkspace({ records, onManual, onScan, onView }: { records: PatientRecord[]; onManual: () => void; onScan: () => void; onView: (record: PatientRecord) => void }) {
  return <div className="workspace-page emergency-view">
    <PageHeading eyebrow="Rapid intake" title="Emergency Admissions" description="Choose the fastest entry method for the report in front of you."><span className="live-badge"><i /> Ready for intake</span></PageHeading>
    <section className="intake-actions"><button onClick={onManual}><span className="action-icon manual"><UserRound /></span><div><small>Option 01</small><h2>Manual entry</h2><p>Open a completely blank 15-value form for handwritten reports.</p></div><ArrowRight /></button><button onClick={onScan}><span className="action-icon scan"><FileScan /></span><div><small>Option 02</small><h2>Scan or upload</h2><p>Photograph a report, extract its values, then verify every field.</p></div><ArrowRight /></button></section>
    <section className="workflow-strip"><div><span>1</span><strong>Choose method</strong><small>Manual or image</small></div><i /><div><span>2</span><strong>Capture values</strong><small>No fixed entries</small></div><i /><div><span>3</span><strong>Verify & save</strong><small>Human confirmation</small></div></section>
    <section className="emergency-queue"><div className="section-title"><div><h2>Current emergency queue</h2><p>Recently submitted admissions across your hospital.</p></div><strong>{records.length} total</strong></div>
      {records.length ? <div className="admission-list">{records.slice(0, 8).map((record, index) => <article key={record.recordId || record.id}><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><PatientCell record={record} /><span className="admission-time"><Clock3 />{new Date(record.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className="source-pill">{record.source}</span><Button variant="ghost" onClick={() => onView(record)}>Review <ArrowRight /></Button></article>)}</div> : <div className="simple-empty"><Zap /><h3>Queue is clear</h3><p>New emergency entries will appear here.</p></div>}
    </section>
  </div>;
}

function HistoryWorkspace({ records, filter, onFilter, onView }: { records: PatientRecord[]; filter: "all" | "scan" | "manual"; onFilter: (value: "all" | "scan" | "manual") => void; onView: (record: PatientRecord) => void }) {
  return <div className="workspace-page history-view">
    <PageHeading eyebrow="Saved archive" title="Record History" description="Review past entries and reopen their attached lab reports."><CalendarDays /></PageHeading>
    <Tabs value={filter} onValueChange={(value) => onFilter(value as "all" | "scan" | "manual")}><div className="history-toolbar"><TabsList><TabsTrigger value="all">All records</TabsTrigger><TabsTrigger value="scan">Scanned</TabsTrigger><TabsTrigger value="manual">Manual</TabsTrigger></TabsList><span>{records.length} result{records.length === 1 ? "" : "s"}</span></div></Tabs>
    {records.length ? <section className="history-timeline">{records.map((record) => <article key={record.recordId || record.id}><div className="history-date"><strong>{new Date(record.createdAt).toLocaleDateString([], { day: "2-digit" })}</strong><span>{new Date(record.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })}</span></div><div className="history-line"><i /></div><div className="history-card"><div><PatientCell record={record} /><span className="history-meta">{record.source} · {Object.values(record.values).filter(Boolean).length} values · {record.createdByEmail || "Hospital staff"}</span></div><div className="history-actions"><span className={`record-status ${record.status}`}>{record.status}</span>{record.reports.length > 0 && <span><FileCheck2 /> {record.reports.length} report{record.reports.length === 1 ? "" : "s"}</span>}<Button variant="outline" size="sm" onClick={() => onView(record)}>View record</Button></div></div></article>)}</section> : <div className="history-empty"><History /><h3>No records in this category</h3><p>Choose another history filter.</p></div>}
  </div>;
}

function SettingsWorkspace({ profile, name, staffId, saving, onName, onStaffId, onSave, onAccountDeleted }: { profile: ActiveProfile; name: string; staffId: string; saving: boolean; onName: (value: string) => void; onStaffId: (value: string) => void; onSave: () => void; onAccountDeleted: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canSelfDelete = profile.membership.role === "nurse" || profile.membership.role === "doctor";

  async function deleteAccount() {
    setDeleting(true);
    try {
      const response = await fetch("/api/profile", { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; emailSent?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not delete your account");
      setDeleteOpen(false);
      toast.success("Your account was deleted. Hospital patient records were retained.");
      if (!payload.emailSent) toast.info("Your account was deleted, but the confirmation email could not be delivered.");
      onAccountDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete your account");
    } finally {
      setDeleting(false);
    }
  }

  return <div className="workspace-page settings-view">
    <PageHeading eyebrow="Workspace preferences" title="Settings" description="Manage your staff identity and account security." />
    <section className="settings-grid"><article className="settings-card profile-settings"><div className="settings-card-head"><span><UserRound /></span><div><h2>Staff profile</h2><p>These details appear throughout your workspace.</p></div></div><div className="settings-form"><Field label="Display name" value={name} onChange={onName} placeholder="Full name" /><Field label="Staff ID" value={staffId} onChange={onStaffId} placeholder="Staff ID" /><label className="field"><span>Account email</span><Input value={profile.email} disabled /></label><Button onClick={onSave} disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />}{saving ? "Saving…" : "Save profile changes"}</Button></div></article>
      <article className="settings-card security-settings"><div className="settings-card-head"><span><ShieldCheck /></span><div><h2>Hospital access</h2><p>Your permissions and shared workspace.</p></div></div><div className="security-list"><div><Building2 /><span><strong>{profile.membership.hospitalName}</strong><small>Code: {profile.membership.hospitalCode}</small></span><b>Active</b></div><div><UserCheck /><span><strong>{ROLE_LABELS[profile.membership.role]}</strong><small>Permissions are controlled by a Hospital Admin.</small></span><b>{profile.membership.role}</b></div><div><ListChecks /><span><strong>Accountable updates</strong><small>Every clinical change records the staff identity and time.</small></span><b>On</b></div><div><FileImage /><span><strong>Shared report storage</strong><small>Authorized coworkers can reopen attached scans.</small></span><b>On</b></div></div></article></section>
    {canSelfDelete && <section className="account-danger-zone"><div><span><Trash2 /></span><div><h2>Delete my staff account</h2><p>This permanently removes your login and hospital membership. Patient records, lab values, scanned reports, and audit history you created stay with {profile.membership.hospitalName}.</p></div></div><Button variant="destructive" className="remove-staff-button" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete my account</Button></section>}
    <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Permanently delete your staff account?</AlertDialogTitle><AlertDialogDescription>You will be signed out immediately and will no longer have access to {profile.membership.hospitalName}. This cannot be undone. All patient records and uploaded reports will remain securely stored with the hospital.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Keep my account</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); void deleteAccount(); }}>{deleting ? <LoaderCircle className="spin" /> : <Trash2 />}{deleting ? "Deleting…" : "Delete permanently"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <section className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-heading-action">{children}</div>}</section>;
}

function PatientCell({ record }: { record: PatientRecord }) {
  return <div className="patient-cell"><span>{record.name[0]?.toUpperCase()}</span><div><strong>{record.name}</strong><small>{record.id}</small></div></div>;
}

function EmptyRecords({ onManual, onScan }: { onManual: () => void; onScan: () => void }) {
  return <div className="empty-queue"><span><Activity /></span><h3>No patient records yet</h3><p>Start with a blank manual form or extract values from a report photo.</p><div><Button onClick={onManual}><UserRound /> Manual entry</Button><Button variant="outline" onClick={onScan}><FileScan /> Scan or upload</Button></div></div>;
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof UsersRound; label: string; value: string; note: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon /></span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function extractValues(text: string): { values: Values; name?: string; age?: string } {
  const values = blankValues(); const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const test of TESTS) {
    const alias = [...test.aliases].sort((a, b) => b.length - a.length).find((candidate) => lines.some((line) => line.toLowerCase().includes(candidate.toLowerCase())));
    if (!alias) continue; const line = lines.find((item) => item.toLowerCase().includes(alias.toLowerCase())); if (!line) continue;
    const start = line.toLowerCase().indexOf(alias.toLowerCase()) + alias.length; const afterLabel = line.slice(start).replace(/^[\s:=-]+/, ""); const number = afterLabel.match(/[-+]?\d+(?:[.,]\d+)?/);
    if (number) values[test.key] = number[0].replace(",", ".");
  }
  const nameLine = lines.find((line) => /(?:patient\s*name|name)\s*[:\-]/i.test(line)); const ageLine = lines.find((line) => /\bage\s*[:\-]/i.test(line));
  return { values, name: nameLine?.replace(/^.*?(?:patient\s*name|name)\s*[:\-]\s*/i, "").trim(), age: ageLine?.match(/\bage\s*[:\-]?\s*(\d{1,3})/i)?.[1] };
}

export default function RapidLabClient() {
  const [session, setSession] = useState<{ user: PlatformUser; profile: StaffProfile } | null>(null);
  const [activeProfile, setActiveProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then(async (response) => {
        const payload = await response.json() as { user?: PlatformUser; profile?: StaffProfile | null; error?: string };
        if (response.status === 401) { setSession(null); setActiveProfile(null); return; }
        if (!response.ok || !payload.user || !payload.profile) throw new Error(payload.error || "Staff account unavailable");
        setSession({ user: payload.user, profile: payload.profile });
        setActiveProfile(payload.profile);
      })
      .catch((error) => setSessionError(error instanceof Error ? error.message : "Could not load your account"))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { setSession(null); setActiveProfile(null); setSessionError(""); }
  }

  if (loading) return <main className="auth-loading"><Logo /><LoaderCircle className="spin" /><p>Connecting your secure workspace…</p></main>;
  if (!session) return <AuthScreen initialError={sessionError} onAuthenticated={(next) => { setSession(next); setActiveProfile(next.profile); setSessionError(""); }} />;
  if (activeProfile && (!activeProfile.membership || activeProfile.membership.status !== "active")) return <HospitalOnboarding profile={activeProfile} onProfile={(profile) => { setActiveProfile(profile); setSession({ ...session, profile }); }} onLogout={logout} />;
  if (activeProfile?.membership?.status === "active") return <Dashboard profile={activeProfile as ActiveProfile} onProfileChange={(profile) => { setActiveProfile(profile); setSession({ ...session, profile }); }} onLogout={logout} />;
  return <AuthScreen onAuthenticated={(next) => { setSession(next); setActiveProfile(next.profile); }} />;
}
