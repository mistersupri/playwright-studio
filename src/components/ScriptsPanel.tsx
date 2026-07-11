import React, { useState, useEffect, useRef } from "react";
import { Search, X, BookOpen, Database, FileCode, Trash2, Copy, Folder, FolderOpen, ChevronDown, ChevronRight, Plus, Edit, Check, Play } from "lucide-react";
import { SavedScript, ScriptTemplate } from "../types";
import { TEMPLATES } from "../data/templates";
import { User } from "../firebase";

interface ScriptsPanelProps {
  scripts: SavedScript[];
  user: User | null;
  activeScriptId: string | null;
  selectedTemplateId: string;
  scriptSearchQuery: string;
  setScriptSearchQuery: (query: string) => void;
  handleSelectTemplate: (tpl: ScriptTemplate) => void;
  handleLoadScript: (script: SavedScript) => void;
  handleDeleteScript: (script: SavedScript, e: React.MouseEvent) => void;
  handleMakeCopy: (script: SavedScript) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; script: any; isTemplate?: boolean } | null>>;
  setScriptName: (name: string) => void;
  setCurrentCode: (code: string) => void;
  setOriginalName: (name: string) => void;
  setOriginalCode: (code: string) => void;
  setSelectedTemplateId: (id: string) => void;
  setActiveScriptId: (id: string | null) => void;
  setIsPrivate: (priv: boolean) => void;
  addTerminalLine: (message: string, type: "info" | "success" | "warning" | "error" | "log") => void;
  setShowMobileSidebar: (show: boolean) => void;
  workspaceFiles: { name: string; code: string }[];
  setWorkspaceFiles: React.Dispatch<React.SetStateAction<{ name: string; code: string }[]>>;
  activeFileName: string;
  setActiveFileName: (name: string) => void;
  handleSwitchFile: (name: string) => void;
  handleCreateFile: (name: string) => void;
  handleRenameFile: (oldName: string, newName: string) => void;
  handleDeleteFile: (name: string) => void;
  handleRunSpecificTemplate?: (tpl: ScriptTemplate) => void;
  handleRunSpecificFile?: (fileName: string) => void;
}

export default function ScriptsPanel({
  scripts,
  user,
  activeScriptId,
  selectedTemplateId,
  scriptSearchQuery,
  setScriptSearchQuery,
  handleSelectTemplate,
  handleLoadScript,
  handleDeleteScript,
  handleMakeCopy,
  setContextMenu,
  setScriptName,
  setCurrentCode,
  setOriginalName,
  setOriginalCode,
  setSelectedTemplateId,
  setActiveScriptId,
  setIsPrivate,
  addTerminalLine,
  setShowMobileSidebar,
  workspaceFiles,
  setWorkspaceFiles,
  activeFileName,
  setActiveFileName,
  handleSwitchFile,
  handleCreateFile,
  handleRenameFile,
  handleDeleteFile,
  handleRunSpecificTemplate,
  handleRunSpecificFile,
}: ScriptsPanelProps) {
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Resizable height states for the Workspace Files panel
  const [filesHeight, setFilesHeight] = useState<number>(() => {
    return Number(localStorage.getItem("playwright_sidebar_files_height")) || 320;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(320);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = filesHeight;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.max(120, Math.min(600, startHeightRef.current + deltaY));
      setFilesHeight(newHeight);
      localStorage.setItem("playwright_sidebar_files_height", String(newHeight));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, filesHeight]);

  // Apply visual styles to body when dragging is active
  useEffect(() => {
    if (isResizing) {
      document.body.classList.add("select-none", "cursor-row-resize");
    } else {
      document.body.classList.remove("select-none", "cursor-row-resize");
    }
    return () => {
      document.body.classList.remove("select-none", "cursor-row-resize");
    };
  }, [isResizing]);

  // Helper to build a hierarchical file tree
  const buildFileTree = (files: { name: string; code: string }[]) => {
    const root: Record<string, any> = {};
    files.forEach(file => {
      const parts = file.name.split("/");
      let current = root;
      let currentPath = "";
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;
        if (!current[part]) {
          current[part] = {
            name: part,
            path: currentPath,
            isFile: isLast,
            children: isLast ? null : {}
          };
        }
        if (!isLast) {
          current = current[part].children;
        }
      });
    });
    return root;
  };

  const renderNode = (node: any, depth: number = 0) => {
    const isFolder = !node.isFile;
    const isExpanded = expandedFolders[node.path] !== false; // expanded by default
    const isActiveFile = node.isFile && activeFileName === node.path;

    const toggleFolder = (path: string) => {
      setExpandedFolders(prev => ({
        ...prev,
        [path]: prev[path] === false ? true : false
      }));
    };

    if (isFolder) {
      return (
        <div key={`folder-${node.path}`} className="select-none">
          <div
            onClick={() => toggleFolder(node.path)}
            className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-[#161b22] text-[#8b949e] hover:text-white cursor-pointer transition-colors text-xs"
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            )}
            <span className="truncate font-medium text-zinc-300">{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div className="space-y-0.5 mt-0.5">
              {Object.values(node.children).map((child: any) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // It's a file
    const isRenaming = renamingPath === node.path;

    return (
      <div
        key={`file-${node.path}`}
        onClick={() => {
          if (!isRenaming) {
            handleSwitchFile(node.path);
            setShowMobileSidebar(false);
          }
        }}
        className={`group flex items-center justify-between px-2 py-1 rounded text-xs transition-colors border select-none cursor-pointer ${
          isActiveFile
            ? "bg-[#1f2937] border-[#30363d] text-white"
            : "bg-transparent border-transparent text-[#8b949e] hover:bg-[#161b22] hover:text-white"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-grow mr-2">
          <FileCode className={`h-3.5 w-3.5 shrink-0 ${isActiveFile ? "text-blue-400" : "text-[#8b949e]"}`} />
          {isRenaming ? (
            <input
              type="text"
              value={renamingValue}
              onChange={(e) => setRenamingValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameFile(node.path, renamingValue);
                  setRenamingPath(null);
                } else if (e.key === "Escape") {
                  setRenamingPath(null);
                }
              }}
              onBlur={() => {
                handleRenameFile(node.path, renamingValue);
                setRenamingPath(null);
              }}
              autoFocus
              className="bg-[#161b22] border border-blue-500 rounded px-1 py-0.5 text-xs text-white focus:outline-none w-full"
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
        </div>

        {!isRenaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (handleRunSpecificFile) {
                  handleRunSpecificFile(node.path);
                }
              }}
              title={`Run ${node.name} immediately`}
              className="text-zinc-500 hover:text-emerald-400 p-0.5 rounded transition cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
            {node.path !== "main.js" && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingPath(node.path);
                    setRenamingValue(node.path);
                  }}
                  title="Rename file"
                  className="text-zinc-500 hover:text-blue-400 p-0.5 rounded transition cursor-pointer"
                >
                  <Edit className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFile(node.path);
                  }}
                  title="Delete file"
                  className="text-zinc-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      {/* Search filter input */}
      <div className="p-3 border-b border-[#30363d] shrink-0 bg-[#0d1117]">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={scriptSearchQuery}
            onChange={(e) => setScriptSearchQuery(e.target.value)}
            placeholder="Search script library by name..."
            className="w-full bg-[#161b22] border border-[#30363d] rounded-md pl-8 pr-7 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 placeholder-zinc-500 font-sans"
          />
          {scriptSearchQuery && (
            <button
              onClick={() => setScriptSearchQuery("")}
              className="absolute right-2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Project Files Section */}
      <div 
        style={{ height: `${filesHeight}px` }}
        className="p-3 pb-4 border-b border-[#30363d] bg-[#0d1117] flex flex-col relative"
      >
        <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
            <span>Project Files</span>
            <span className="text-[9px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-normal">
              {workspaceFiles.length} file{workspaceFiles.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => setIsCreatingFile(true)}
            title="Create new file (supports folders, e.g. utils/helper.js)"
            className="text-[#8b949e] hover:text-white p-0.5 rounded transition cursor-pointer flex items-center gap-0.5 hover:bg-[#21262d] border border-transparent hover:border-[#30363d] px-1.5 text-[9px] font-normal"
          >
            <Plus className="h-3 w-3" /> Add File
          </button>
        </div>

        {isCreatingFile && (
          <div className="mb-2 px-1">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="e.g. helpers.js or utils/api.js"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (newFileName.trim()) {
                      handleCreateFile(newFileName.trim());
                      setNewFileName("");
                      setIsCreatingFile(false);
                    }
                  } else if (e.key === "Escape") {
                    setIsCreatingFile(false);
                  }
                }}
                className="w-full bg-[#161b22] border border-[#30363d] rounded pl-2 pr-12 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-sans"
                autoFocus
              />
              <div className="absolute right-1 flex items-center gap-0.5">
                <button
                  onClick={() => {
                    if (newFileName.trim()) {
                      handleCreateFile(newFileName.trim());
                      setNewFileName("");
                      setIsCreatingFile(false);
                    }
                  }}
                  className="text-emerald-500 hover:text-emerald-400 p-0.5 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setIsCreatingFile(false);
                    setNewFileName("");
                  }}
                  className="text-zinc-500 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-grow overflow-y-auto space-y-0.5 pr-1 min-h-0">
          {(() => {
            const tree = buildFileTree(workspaceFiles);
            return Object.values(tree).map((node: any) => renderNode(node));
          })()}
        </div>

        {/* Vertical Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize bg-transparent hover:bg-blue-500/20 active:bg-blue-500/40 transition-colors flex items-center justify-center group ${
            isResizing ? "bg-blue-500/30" : ""
          }`}
          title="Drag to resize project files list"
        >
          <div className={`w-8 h-1 bg-zinc-700/50 group-hover:bg-blue-400/80 rounded transition-colors ${
            isResizing ? "bg-blue-400" : ""
          }`} />
        </div>
      </div>

      {/* Templates Section */}
      <div className="p-3 border-t border-[#30363d] bg-[#161b22]/30 flex-grow flex flex-col min-h-0">
        <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center gap-1.5 shrink-0">
          <BookOpen className="h-3 w-3" />
          <span>Step Templates</span>
        </div>
        
        <div className="space-y-1 flex-grow overflow-y-auto pr-1 min-h-0">
          {(() => {
            const filtered = TEMPLATES.filter(tpl => 
              tpl.name.toLowerCase().includes(scriptSearchQuery.toLowerCase())
            );
            if (filtered.length === 0) {
              return (
                <p className="text-[10px] text-[#8b949e] italic pl-1">No matching templates</p>
              );
            }
            return filtered.map((tpl, idx) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={`template-${tpl.id || "no-id"}-${idx}`}
                  onClick={() => {
                    handleSelectTemplate(tpl);
                    setShowMobileSidebar(false);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      script: tpl,
                      isTemplate: true
                    });
                  }}
                  className={`group w-full flex items-center justify-between p-1.5 rounded text-xs transition border cursor-pointer ${
                    isSelected
                      ? "bg-[#1f2937] border-[#30363d] text-white font-medium"
                      : "bg-transparent border-transparent hover:bg-[#161b22] text-[#8b949e] hover:text-white"
                  }`}
                >
                  <span className="truncate flex-grow">{tpl.name}</span>
                  {handleRunSpecificTemplate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunSpecificTemplate(tpl);
                        setShowMobileSidebar(false);
                      }}
                      title="Run template immediately"
                      className="text-[#8b949e] hover:text-blue-400 p-0.5 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1.5"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
