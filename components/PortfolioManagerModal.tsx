"use client";

import React, { useState } from "react";
import {
  FolderOpen,
  FileSpreadsheet,
  CheckCircle2,
  Trash2,
  Edit2,
  Check,
  X,
  Plus,
  Sparkles,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";
import { StoredPortfolio } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

interface PortfolioManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolios: StoredPortfolio[];
  currentPortfolioId: string;
  onSelectPortfolio: (id: string) => void;
  onRenamePortfolio: (id: string, newName: string) => void;
  onDeletePortfolio: (id: string) => void;
  onOpenUpload: () => void;
  onLoadDemo: () => void;
}

export const PortfolioManagerModal: React.FC<PortfolioManagerModalProps> = ({
  isOpen,
  onClose,
  portfolios,
  currentPortfolioId,
  onSelectPortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  onOpenUpload,
  onLoadDemo,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [portfolioToDelete, setPortfolioToDelete] = useState<StoredPortfolio | null>(null);

  if (!isOpen) return null;

  const handleStartRename = (p: StoredPortfolio, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const handleSaveRename = (id: string, e: React.SubmitEvent) => {
    e.preventDefault();
    if (editName.trim()) {
      onRenamePortfolio(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleConfirmDelete = () => {
    if (!portfolioToDelete) return;
    onDeletePortfolio(portfolioToDelete.id);
    setPortfolioToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Select Portfolio & Statements
              </h2>
              <p className="text-xs text-slate-400">
                Choose an imported statement to view, check import timestamps, or delete files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Active / Total Banner */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold uppercase tracking-wider text-slate-300">
              Saved Portfolios ({portfolios.length})
            </span>
            <span>
              {portfolios.length === 1
                ? "1 statement uploaded"
                : `${portfolios.length} statements uploaded`}
            </span>
          </div>

          {/* Empty State if 0 Portfolios */}
          {portfolios.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  No portfolios or statements loaded
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Upload your Vested Excel (.xlsx) statement to get started.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onOpenUpload();
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Upload Statement</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onLoadDemo();
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>Load Sample Demo</span>
                </button>
              </div>
            </div>
          ) : (
            /* List of Portfolios */
            <div className="space-y-2.5">
              {portfolios.map((p) => {
                const isSelected = p.id === currentPortfolioId;
                const isEditing = editingId === p.id;
                const formattedDate = p.createdAt
                  ? formatDate(p.createdAt, "MMM dd, yyyy · h:mm a")
                  : "Recently imported";

                return (
                  <div
                    key={p.id}
                    className={`relative rounded-xl border p-4 transition ${
                      isSelected
                        ? "border-blue-500/50 bg-blue-950/20 shadow-lg shadow-blue-500/5"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left Info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                            isSelected
                              ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <FileSpreadsheet className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Portfolio Title (or Edit Input) */}
                          {isEditing ? (
                            <form
                              onSubmit={(e) => handleSaveRename(p.id, e)}
                              className="flex items-center gap-1.5"
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="rounded-lg border border-blue-500 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="rounded-lg p-1 text-emerald-400 hover:bg-slate-800"
                                title="Save name"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white truncate">
                                {p.name}
                              </h3>
                              <button
                                onClick={(e) => handleStartRename(p, e)}
                                className="p-0.5 text-slate-500 hover:text-slate-300"
                                title="Rename portfolio"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Active Now
                                </span>
                              )}
                            </div>
                          )}

                          {/* Metadata Row: Source File, Import Date, Records */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            {p.sourceFileName && (
                              <span className="flex items-center gap-1 text-slate-300">
                                <FileText className="h-3 w-3 text-slate-500" />
                                <span className="truncate max-w-[180px]">
                                  {p.sourceFileName}
                                </span>
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="h-3 w-3 text-slate-500" />
                              <span>Imported: {formattedDate}</span>
                            </span>
                            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                              {p.transactions.length} records
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Actions: Select / Active Button + Delete Trash */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isSelected ? (
                          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Selected</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              onSelectPortfolio(p.id);
                              onClose();
                            }}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
                          >
                            <span>Select</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Delete Portfolio Button - Always available, even if single portfolio! */}
                        <button
                          onClick={() => setPortfolioToDelete(p)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition"
                          title="Delete portfolio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenUpload();
              }}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition"
            >
              <Plus className="h-3.5 w-3.5 text-blue-400" />
              <span>Import New Statement</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onLoadDemo();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Load Demo Data</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        {/* Delete Confirmation Modal Overlay */}
        {portfolioToDelete && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-md animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-950 p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/30">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Delete Portfolio
                  </h3>
                  <p className="text-xs text-slate-400">
                    Are you sure you want to delete “{portfolioToDelete.name}”?
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 text-xs text-slate-300 space-y-2">
                <p>
                  This will permanently remove the portfolio and all of its{" "}
                  <strong className="text-white">
                    {portfolioToDelete.transactions.length} transactions
                  </strong>
                  .
                </p>
                {portfolios.length === 1 ? (
                  <p className="text-amber-300/90 font-medium">
                    Notice: This is your only saved portfolio. Deleting it will clear the dashboard and return you to the upload statement screen so you can upload a new file.
                  </p>
                ) : (
                  <p className="text-slate-400">
                    The dashboard will switch to your next saved portfolio.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPortfolioToDelete(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Portfolio</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
