"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Shield,
  HardDrive,
  FolderOpen,
  FileSpreadsheet,
  FileText,
  Download,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  Check,
  Lock,
  RefreshCw,
  Copy,
  Layers,
  Calendar,
  LogOut,
  Clock,
  Sparkles,
  TrendingUp,
  Server,
  KeyRound,
  FileCheck,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface ProfileUser {
  id: string;
  username: string;
  email: string;
  storageFolderKey: string;
  role: string;
  createdAt: string | null;
}

interface ProfileStats {
  portfolioCount: number;
  fileCount: number;
  storageBytes: number;
  totalTransactions: number;
}

interface StoredFile {
  id: string;
  originalFilename: string;
  storedRelativePath: string;
  fileType: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  createdAt: string;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    portfolioCount: 0,
    fileCount: 0,
    storageBytes: 0,
    totalTransactions: 0,
  });
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);

  // File Deletion
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [fileActionError, setFileActionError] = useState<string | null>(null);

  // Account Deletion Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const fetchProfileData = async () => {
    setIsLoading(true);
    setFileActionError(null);
    try {
      const [authRes, filesRes] = await Promise.all([
        fetch("/api/auth", { method: "GET" }),
        fetch("/api/user-files", { method: "GET" }),
      ]);

      if (!authRes.ok) {
        router.push("/login");
        return;
      }

      const authData = await authRes.json();
      if (authData.authenticated && authData.user) {
        setUser(authData.user);
        if (authData.stats) {
          setStats(authData.stats);
        }
      }

      if (filesRes.ok) {
        const filesData = await filesRes.json();
        if (Array.isArray(filesData.files)) {
          setFiles(filesData.files);
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const handleCopyStorageKey = () => {
    if (user?.storageFolderKey) {
      navigator.clipboard.writeText(user.storageFolderKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleDownloadFile = (fileId: string) => {
    window.open(`/api/user-files/${fileId}`, "_blank");
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Are you sure you want to permanently delete this file from storage?")) {
      return;
    }

    setDeletingFileId(fileId);
    setFileActionError(null);
    try {
      const res = await fetch(`/api/user-files/${fileId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete file");
      }

      // Update local file list and stats
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setStats((prev) => ({
        ...prev,
        fileCount: Math.max(0, prev.fileCount - 1),
      }));
    } catch (err: any) {
      setFileActionError(err.message || "Failed to delete file");
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleLogout = async () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("finvyo_portfolios_backup");
    } catch {}
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login";
  };

  const handleConfirmAccountDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError("");

    if (!deletePassword) {
      setDeleteError("Password is required to confirm deletion.");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_account",
          password: deletePassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete account");
      }

      // Clear client session and redirect
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {}

      window.location.href = "/register?deleted=true";
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete account. Please try again.");
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1400px] flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition shadow-sm group"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-blue-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Dashboard</span>
            </Link>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-sm shadow-blue-500/20 ring-1 ring-blue-400/30">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight text-white">
                Fin<span className="text-blue-400">vyo</span> Profile
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchProfileData}
              disabled={isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white transition disabled:opacity-50"
              title="Refresh profile info"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-300 transition"
              title="Sign out of Finvyo"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Profile Content */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {isLoading ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <p className="text-xs text-slate-400">Loading user profile & storage metrics...</p>
          </div>
        ) : (
          <>
            {/* 1. User Hero Card */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-900/40 p-6 sm:p-8 shadow-xl">
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-2xl sm:text-3xl shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/40 flex-shrink-0">
                    {user?.username ? user.username[0].toUpperCase() : "U"}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {user?.username || "Investor"}
                      </h1>
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-300 ring-1 ring-inset ring-blue-500/20">
                        {user?.role === "admin" ? "System Admin" : "Personal Investor"}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active Session
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-400 font-medium">
                      {user?.email}
                    </p>

                    {user?.createdAt && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>Member since {formatDate(user.createdAt, "MMMM d, yyyy")}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Storage Sandbox Pill */}
                <div className="w-full sm:w-auto rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 font-medium">
                      <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                      Isolated Storage Key
                    </span>
                    <button
                      onClick={handleCopyStorageKey}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition"
                    >
                      {copiedKey ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-xs font-semibold text-slate-200 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 truncate max-w-[240px]">
                    {user?.storageFolderKey || "sandbox_default"}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Portfolios</span>
                  <FolderOpen className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {stats.portfolioCount}
                </div>
                <div className="text-[11px] text-slate-400">Multi-tenant isolated</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Transactions</span>
                  <Layers className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {stats.totalTransactions.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">Calculated & tracked</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Stored Files</span>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {stats.fileCount}
                </div>
                <div className="text-[11px] text-slate-400">Archived statements</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Disk Storage</span>
                  <HardDrive className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {formatBytes(stats.storageBytes)}
                </div>
                <div className="text-[11px] text-slate-400">Safe directory sandbox</div>
              </div>
            </div>

            {/* 3. Stored Statement Files Section */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-400" />
                    Stored Statement Files & Exports
                  </h2>
                  <p className="text-xs text-slate-400">
                    Uploaded statements are safely kept in your isolated directory and can be downloaded or purged anytime.
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>
              </div>

              {fileActionError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                  {fileActionError}
                </div>
              )}

              {files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center space-y-2">
                  <FileSpreadsheet className="h-8 w-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">
                    No stored files yet
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    When you import statements from Vested or DriveWealth on the dashboard, they are archived here for your records.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                  {files.map((file) => {
                    const isXlsx = file.originalFilename.endsWith(".xlsx") || file.originalFilename.endsWith(".xls");
                    const isDeleting = deletingFileId === file.id;

                    return (
                      <div
                        key={file.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 sm:px-4 gap-3 hover:bg-slate-900/60 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isXlsx ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          }`}>
                            {isXlsx ? <FileSpreadsheet className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-200 truncate max-w-xs sm:max-w-md">
                              {file.originalFilename}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span>{formatBytes(file.fileSizeBytes)}</span>
                              <span>•</span>
                              <span>{formatDate(file.createdAt, "MMM d, yyyy h:mm a")}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                          <button
                            onClick={() => handleDownloadFile(file.id)}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700 transition"
                            title="Download original statement"
                          >
                            <Download className="h-3.5 w-3.5 text-blue-400" />
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            disabled={isDeleting}
                            className="flex items-center gap-1 rounded-lg border border-slate-800 hover:border-rose-500/30 bg-slate-900 hover:bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 transition disabled:opacity-50"
                            title="Delete file permanently"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Security & Isolation Architecture Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-400" />
                Security & Data Isolation
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Multi-Tenant Scoping
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    All portfolio read/write queries enforce strict PostgreSQL row-level tenancy (`WHERE user_id = $1`). Cross-tenant access is blocked.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Filesystem Sandbox
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Statements reside in an isolated host directory with strict regex key verification preventing path traversal (`..%2F`) attacks.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Cryptographic Passwords
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Credentials hashed with cryptographic salt + constant-time comparison. Cookies protected with HttpOnly, Secure, and Lax flags.
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Danger Zone Card */}
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/10 p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    Danger Zone: Delete Account
                  </h2>
                  <p className="text-xs text-slate-400 max-w-xl">
                    Permanently delete your account, all created portfolios, financial transactions, and linked statement files from both the database and the server's disk storage. This action cannot be reversed.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-600 hover:text-white transition shadow-sm flex-shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete My Account</span>
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Account Deletion Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Permanently Delete Account
                </h3>
                <p className="text-xs text-slate-400">
                  This will wipe all data for <strong className="text-slate-200">@{user?.username}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5 text-xs text-rose-200/90 space-y-1.5">
              <p className="font-semibold">What will be destroyed:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
                <li>All <strong className="text-white">{stats.portfolioCount} saved portfolios</strong> & historical metrics</li>
                <li>All <strong className="text-white">{stats.totalTransactions} recorded transactions</strong></li>
                <li>All <strong className="text-white">{stats.fileCount} uploaded statements & disk folders</strong></li>
                <li>Your login credentials and active authentication tokens</li>
              </ul>
            </div>

            <form onSubmit={handleConfirmAccountDelete} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Enter your password to confirm:
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <Lock className="absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
                </div>
              </div>

              {deleteError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 p-2.5 text-xs text-rose-300">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletePassword("");
                    setDeleteError("");
                  }}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAccount}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition disabled:opacity-50"
                >
                  {isDeletingAccount ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Deleting Account...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Confirm Permanent Delete</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
