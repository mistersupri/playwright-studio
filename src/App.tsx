import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  Play,
  Pause,
  Square,
  Save,
  Trash2,
  Terminal,
  Download,
  Image as ImageIcon,
  FileText,
  FileCode,
  RefreshCw,
  Eye,
  Sliders,
  Sparkles,
  BookOpen,
  Info,
  ChevronRight,
  AlertTriangle,
  Database,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  ChevronDown,
  Copy,
  Users,
  Plus,
  EyeOff,
  Lock,
  SlidersHorizontal,
  Share2,
  Mail,
  Link,
  Globe,
  Edit,
  HeartPulse,
  Bug,
  CheckCircle,
  XCircle,
  Check,
  Wand2,
  Zap,
  Contrast,
  Upload,
  Search,
  X,
  FolderOpen,
  Folder,
  History,
  FolderPlus,
  ChevronLeft,
  Columns,
  LayoutGrid,
  Clock,
  Video,
  Calendar,
  Chrome,
  Puzzle,
  Settings,
  LogOut,
  DollarSign
} from "lucide-react";
import { ScriptTemplate, SavedScript, ScriptVersion, Artifact, TerminalLine, RunHistoryItem } from "./types";
import JSZip from "jszip";
import { EXTENSION_FILES } from "./data/extensionFiles";
import { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, signOut, User } from "./firebase";
import { formatFileSize, formatAssetTimestamp } from "./utils/formatters";
import { TEMPLATES } from "./data/templates";
import { getRequiredPackages } from "./utils/packageParser";
import ExcelPreviewerContent from "./components/ExcelPreviewerContent";
import LoginModal from "./components/LoginModal";
import GeminiSettingsModal from "./components/GeminiSettingsModal";
import ScriptsPanel from "./components/ScriptsPanel";
import HistoryPanel from "./components/HistoryPanel";
import VariablesPanel from "./components/VariablesPanel";
import PackagesPanel from "./components/PackagesPanel";
import SchedulesPanel from "./components/SchedulesPanel";
import BreakpointsPanel from "./components/BreakpointsPanel";
import ExtensionPanel from "./components/ExtensionPanel";
import AIPanel from "./components/AIPanel";
import { SearchPanel } from "./components/SearchPanel";

export default function App() {
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [currentCode, setCurrentCode] = useState<string>(TEMPLATES[0].code);
  const [workspaceFiles, setWorkspaceFiles] = useState<{ name: string; code: string }[]>([
    { name: "main.js", code: TEMPLATES[0].code }
  ]);
  const [activeFileName, setActiveFileName] = useState<string>("main.js");
  const [scriptName, setScriptName] = useState<string>("");
  const [originalCode, setOriginalCode] = useState<string>(TEMPLATES[0].code);
  const [originalName, setOriginalName] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("basic");
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState<boolean>(true);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Manual Admin Auth modal states
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Real-time states
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "running" | "completed" | "error" | "stopped">("idle");
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [consoleTab, setConsoleTab] = useState<"scripts" | "browser" | "network" | "cookies">("scripts");
  const [browserCookies, setBrowserCookies] = useState<any[]>([]);
  const [networkLogs, setNetworkLogs] = useState<any[]>([]);
  const [selectedNetworkLog, setSelectedNetworkLog] = useState<any | null>(null);
  const [networkFilterText, setNetworkFilterText] = useState<string>("");
  const [networkTypeFilter, setNetworkTypeFilter] = useState<string>("all");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "assets">("preview");
  const [activeAssetSubTab, setActiveAssetSubTab] = useState<"all" | "screenshot" | "pdf" | "excel" | "upload" | "video">("all");
  const [clearing, setClearing] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [savingScript, setSavingScript] = useState<boolean>(false);
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [scriptSavedMsg, setScriptSavedMsg] = useState<string | null>(null);
  const [viewerVideo, setViewerVideo] = useState<string | null>(null);
  const [viewerVideoTitle, setViewerVideoTitle] = useState<string>("");

  // Dialog/Confirmation states to completely bypass blocking standard window.confirm calls in iframes
  const [scriptToDelete, setScriptToDelete] = useState<SavedScript | null>(null);
  const [envToRevoke, setEnvToRevoke] = useState<{ id: string; key: string } | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [workspaceFileToDelete, setWorkspaceFileToDelete] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [clearType, setClearType] = useState<string>("all");
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [fileToDeleteType, setFileToDeleteType] = useState<string>("upload");
  const [workspaceModalMode, setWorkspaceModalMode] = useState<"create" | "rename" | null>(null);
  const [workspaceModalName, setWorkspaceModalName] = useState<string>("");
  const [showConfigDropdown, setShowConfigDropdown] = useState<boolean>(false);

  // Interactive element list choice states
  const [pendingChoice, setPendingChoice] = useState<{ options: { index: number; text: string; selector: string; html: string; tagName?: string; classList?: string; id?: string }[] } | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [submittingChoice, setSubmittingChoice] = useState<boolean>(false);

  // Script Search, Console Clear, and Pre-Run Validation states
  const [scriptSearchQuery, setScriptSearchQuery] = useState<string>("");
  const [showConsoleClearConfirm, setShowConsoleClearConfirm] = useState<boolean>(false);
  const [consoleClearType, setConsoleClearType] = useState<"scripts" | "browser" | "network" | "cookies">("scripts");
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [validationIssues, setValidationIssues] = useState<{ type: "error" | "warning"; message: string; line?: number }[]>([]);

  // Assets Enhancement states
  const [screenshotViewMode, setScreenshotViewMode] = useState<"grid" | "carousel">("carousel");
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number>(0);
  
  // Custom Folder structures
  const [customFolders, setCustomFolders] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("assets_custom_folders");
      return stored ? JSON.parse(stored) : ["Default"];
    } catch {
      return ["Default"];
    }
  });
  
  const [activeFolder, setActiveFolder] = useState<string>("All");
  const [showNewFolderModal, setShowNewFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>("");

  const [fileFolderMap, setFileFolderMap] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("assets_file_folder_map");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Artifact Version History states
  const [artifactVersionHistory, setArtifactVersionHistory] = useState<Record<string, { url: string; timestamp: string; size: number; note?: string }[]>>(() => {
    try {
      const stored = localStorage.getItem("playwright_artifact_version_history");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Modal / Comparison states
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean;
    fileName: string;
    versionA: { url: string; timestamp: string; size: number; note?: string };
    versionB: { url: string; timestamp: string; size: number; note?: string };
  } | null>(null);

  const [compareSliderPosition, setCompareSliderPosition] = useState<number>(50);
  const [compareViewType, setCompareViewType] = useState<"side-by-side" | "slider">("slider");
  const [expandedHistoryFile, setExpandedHistoryFile] = useState<string | null>(null);

  // Auto-Save Toggle state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem("playwright_autosave_enabled") === "true";
  });

  // Script Execution Timeout (in seconds)
  const [scriptTimeout, setScriptTimeout] = useState<number>(() => {
    const saved = localStorage.getItem("playwright_script_timeout");
    return saved ? parseInt(saved, 10) : 60; // default 60s
  });

  // CAPTCHA and Session recording states
  const [skipCaptcha, setSkipCaptcha] = useState<boolean>(() => {
    return localStorage.getItem("playwright_skip_captcha") === "true";
  });
  const [binarizeCaptcha, setBinarizeCaptcha] = useState<boolean>(() => {
    return localStorage.getItem("playwright_binarize_captcha") === "true";
  });
  const [useGeminiCaptcha, setUseGeminiCaptcha] = useState<boolean>(() => {
    return localStorage.getItem("playwright_use_gemini_captcha") === "true";
  });
  const [recordSession, setRecordSession] = useState<boolean>(() => {
    return localStorage.getItem("playwright_record_session") === "true";
  });

  // Formatting and NPM packaging states
  const [formatting, setFormatting] = useState<boolean>(false);
  const [installedDeps, setInstalledDeps] = useState<{ [key: string]: string }>({});
  const [installingPkg, setInstallingPkg] = useState<string | null>(null);
  const [newPkgName, setNewPkgName] = useState<string>("");
  const [sidebarTab, setSidebarTab] = useState<"scripts" | "search" | "packages" | "variables" | "history" | "ai" | "schedules" | "breakpoints" | "extension">("scripts");
  const [selectedExtensionFileIndex, setSelectedExtensionFileIndex] = useState<number>(0);
  const [breakpointsMuted, setBreakpointsMuted] = useState<boolean>(() => {
    return localStorage.getItem("playwright_breakpoints_muted") === "true";
  });
  
  // AI Script Generation states
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [generatingScript, setGeneratingScript] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [aiGenerationMode, setAiGenerationMode] = useState<"replace" | "append" | "prepend">("replace");
  const [aiGeneratedExplanation, setAiGeneratedExplanation] = useState<string | null>(null);

  // User-specific Gemini settings states
  const [showGeminiSettings, setShowGeminiSettings] = useState<boolean>(false);
  const [showGeminiModal, setShowGeminiModal] = useState<boolean>(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState<boolean>(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [geminiModel, setGeminiModel] = useState<string>("gemini-2.5-flash");
  const [geminiCaptchaCount, setGeminiCaptchaCount] = useState<number>(0);
  const [savingGeminiSettings, setSavingGeminiSettings] = useState<boolean>(false);
  const [geminiSettingsMessage, setGeminiSettingsMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  // System Diagnostics state variables
  const [diagnosticResult, setDiagnosticResult] = useState<{
    browserInstalled: boolean;
    executablePath: string;
    missingLibraries: string[];
    allCheckedLibraries: { name: string; found: boolean }[];
    isCompatible: boolean;
    error?: string;
  } | null>(null);
  const [checkingDiagnostics, setCheckingDiagnostics] = useState<boolean>(false);
  const [installingSysDeps, setInstallingSysDeps] = useState<boolean>(false);

  // New States: Console log filtering
  const [consoleFilterText, setConsoleFilterText] = useState<string>("");
  const [consoleSeverityFilter, setConsoleSeverityFilter] = useState<"all" | "info" | "error" | "success" | "warning" | "log">("all");
  const [consoleUseRegex, setConsoleUseRegex] = useState<boolean>(false);

  // Derived state: check if regex filter is invalid
  const isConsoleRegexInvalid = (() => {
    if (!consoleUseRegex || !consoleFilterText.trim()) return false;
    try {
      new RegExp(consoleFilterText.trim(), "i");
      return false;
    } catch {
      return true;
    }
  })();

  // New States: Version code comparison
  const [compareSnapshot, setCompareSnapshot] = useState<ScriptVersion | null>(null);
  const [diffActiveFileName, setDiffActiveFileName] = useState<string>("");

  // Sync diff active file with currently active file when a snapshot comparison opens
  useEffect(() => {
    if (compareSnapshot) {
      setDiffActiveFileName(activeFileName || "main.js");
    }
  }, [compareSnapshot, activeFileName]);

  // New States: Share & Download Project Modal Dialogs
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showDownloadModal, setShowDownloadModal] = useState<boolean>(false);
  const [isPackagingZip, setIsPackagingZip] = useState<boolean>(false);
  const [shareEmail, setShareEmail] = useState<string>("");
  const [sharingEmailStatus, setSharingEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [shareEmailMsg, setShareEmailMsg] = useState<string>("");

  // Resizable panel widths/heights (desktop configurations)
  const [sidebarWidth, setSidebarWidth] = useState<number>(192); // default w-48
  const [previewWidth, setPreviewWidth] = useState<number>(380); // default px width
  const [consoleHeight, setConsoleHeight] = useState<number>(176); // default console h

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("playwright_sidebar_collapsed") === "true";
  });
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("playwright_preview_collapsed") === "true";
  });
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("playwright_console_collapsed") === "true";
  });
  const [isDebuggerMode, setIsDebuggerMode] = useState<boolean>(() => {
    return localStorage.getItem("playwright_debugger_mode") === "true";
  });
  const [isPausedOnBackend, setIsPausedOnBackend] = useState<boolean>(false);
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);

  // Viewport states for device simulation
  const [viewportWidth, setViewportWidth] = useState<number>(1280);
  const [viewportHeight, setViewportHeight] = useState<number>(720);

  // Breakpoints states
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>(() => {
    try {
      const stored = localStorage.getItem("playwright_breakpoints_map");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [activeBreakpointLine, setActiveBreakpointLine] = useState<number | null>(null);

  // Schedules states
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState<boolean>(false);
  const [scheduleType, setScheduleType] = useState<"once" | "repeat">("once");
  const [scheduleDatetime, setScheduleDatetime] = useState<string>("");
  const [scheduleInterval, setScheduleInterval] = useState<string>("daily");
  const [scheduleScriptId, setScheduleScriptId] = useState<string>("");
  const [scheduleTargetFile, setScheduleTargetFile] = useState<string>("main.js");
  const [scheduleViewportWidth, setScheduleViewportWidth] = useState<number>(1280);
  const [scheduleViewportHeight, setScheduleViewportHeight] = useState<number>(720);
  
  // Project creation modal states
  const [showCreateProjectModal, setShowCreateProjectModal] = useState<boolean>(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState<string>("");
  
  const imageRef = useRef<HTMLImageElement>(null);

  // Breakpoints Monaco integration
  const toggleBreakpointRef = useRef<(lineNum: number) => void>(() => {});
  const breakpointDecorationsRef = useRef<string[]>([]);
  const activeLineDecorationRef = useRef<string[]>([]);

  const toggleBreakpoint = (lineNum: number, fileName: string = activeFileName) => {
    setBreakpoints(prev => {
      const fileBreakpoints = prev[fileName] || [];
      const exists = fileBreakpoints.includes(lineNum);
      let updatedFileBreakpoints: number[];
      if (exists) {
        addTerminalLine(`Debugger: Removed breakpoint at ${fileName}:${lineNum}`, "info");
        updatedFileBreakpoints = fileBreakpoints.filter(l => l !== lineNum);
      } else {
        addTerminalLine(`Debugger: Added breakpoint at ${fileName}:${lineNum}`, "success");
        updatedFileBreakpoints = [...fileBreakpoints, lineNum];
      }
      const updated = {
        ...prev,
        [fileName]: updatedFileBreakpoints
      };
      localStorage.setItem("playwright_breakpoints_map", JSON.stringify(updated));
      return updated;
    });
  };

  const jumpToLine = (line: number, column?: number, matchLength?: number) => {
    if (editorRef.current) {
      const col = column || 1;
      editorRef.current.revealLineInCenter(line);
      editorRef.current.setPosition({ lineNumber: line, column: col });
      if (column && matchLength && monacoRef.current) {
        editorRef.current.setSelection(
          new monacoRef.current.Range(line, column, line, column + matchLength)
        );
      }
      editorRef.current.focus();
      addTerminalLine(`Editor: Jumped to Line ${line}${column ? `, Col ${column}` : ''}`, "info");
    }
  };

  useEffect(() => {
    if (activeFileName.endsWith(".js") || activeFileName.endsWith(".ts")) {
      setScheduleTargetFile(activeFileName);
    }
  }, [activeFileName]);

  useEffect(() => {
    toggleBreakpointRef.current = (lineNum: number) => toggleBreakpoint(lineNum, activeFileName);
  }, [breakpoints, activeFileName]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const activeFileBreakpoints = breakpoints[activeFileName] || [];

    const newDecorations = activeFileBreakpoints.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: "breakpoint-glyph-marker",
        glyphMarginHoverMessage: { value: "Breakpoint line (will auto-pause if debugger active)" }
      }
    }));

    breakpointDecorationsRef.current = editor.deltaDecorations(
      breakpointDecorationsRef.current,
      newDecorations
    );
  }, [breakpoints, activeFileName, currentCode]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    let newDecorations: any[] = [];
    if (activeBreakpointLine !== null) {
      newDecorations = [{
        range: new monaco.Range(activeBreakpointLine, 1, activeBreakpointLine, 1),
        options: {
          isWholeLine: true,
          className: "active-breakpoint-line-highlight",
          glyphMarginClassName: "active-breakpoint-glyph-marker"
        }
      }];
    }

    activeLineDecorationRef.current = editor.deltaDecorations(
      activeLineDecorationRef.current,
      newDecorations
    );
  }, [activeBreakpointLine, currentCode]);

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed(prev => {
      const draft = !prev;
      localStorage.setItem("playwright_sidebar_collapsed", draft.toString());
      return draft;
    });
  };

  const togglePreviewCollapsed = () => {
    setIsPreviewCollapsed(prev => {
      const draft = !prev;
      localStorage.setItem("playwright_preview_collapsed", draft.toString());
      return draft;
    });
  };

  const toggleConsoleCollapsed = () => {
    setIsConsoleCollapsed(prev => {
      const draft = !prev;
      localStorage.setItem("playwright_console_collapsed", draft.toString());
      return draft;
    });
  };

  const [isResizingSidebar, setIsResizingSidebar] = useState<boolean>(false);
  const [isResizingPreview, setIsResizingPreview] = useState<boolean>(false);
  const [isResizingConsole, setIsResizingConsole] = useState<boolean>(false);

  // Playwright initialization, right-click context menu & editor local caret tracking
  const [initializingPlaywright, setInitializingPlaywright] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; script: any; isTemplate?: boolean } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("contextmenu", closeContextMenu);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("contextmenu", closeContextMenu);
    };
  }, []);

  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  const startResizePreview = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPreview(true);
  };

  const startResizeConsole = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingConsole(true);
  };

  // Shortcut action references
  const runScriptRef = useRef<() => void>(undefined);
  const saveScriptRef = useRef<() => void>(undefined);

  const hasUnsavedChanges = currentCode !== originalCode || scriptName !== originalName;
  const isBusy = uploading || initializingPlaywright || savingScript;

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const collaborationDecorationsRef = useRef<string[]>([]);

  // New States: Environment variables and multi-workspace environments
  interface EnvWorkspace {
    id: string;
    name: string;
    vars: { id: string; key: string; value: string; isSecret: boolean }[];
  }

  const [envWorkspaces, setEnvWorkspaces] = useState<EnvWorkspace[]>(() => {
    try {
      const saved = localStorage.getItem("playwright_env_workspaces");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      
      // Migrate legacy variable storage
      const legacyVarsSaved = localStorage.getItem("playwright_env_vars");
      const legacyVars = legacyVarsSaved ? JSON.parse(legacyVarsSaved) : [];
      return [
        {
          id: "default-ws",
          name: "Default Workspace",
          vars: legacyVars
        },
        {
          id: "testing-ws",
          name: "Testing Environment",
          vars: []
        }
      ];
    } catch {
      return [
        { id: "default-ws", name: "Default Workspace", vars: [] }
      ];
    }
  });

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("default-ws");

  // Shared Env Import Modal States
  const [sharedEnvToImport, setSharedEnvToImport] = useState<any | null>(null);
  const [importOption, setImportOption] = useState<"new" | "merge">("new");
  const [importNewName, setImportNewName] = useState<string>("");
  const [importTargetWorkspaceId, setImportTargetWorkspaceId] = useState<string>("default-ws");
  const hasLoadedEnvFromServerRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("playwright_env_workspaces", JSON.stringify(envWorkspaces));
    if (idToken && hasLoadedEnvFromServerRef.current) {
      saveEnvWorkspacesToServer(envWorkspaces);
    }
  }, [envWorkspaces, idToken]);

  // Synchronize active env workspace directly with active project
  useEffect(() => {
    const wsId = activeScriptId || "default-ws";
    const wsName = activeScriptId ? `${scriptName}` : "Default Project";
    setActiveWorkspaceId(wsId);
    localStorage.setItem("playwright_active_env_workspace", wsId);

    setEnvWorkspaces(prev => {
      const exists = prev.some(ws => ws.id === wsId);
      if (exists) {
        return prev.map(ws => ws.id === wsId ? { ...ws, name: wsName } : ws);
      } else {
        // Pre-populate variables from default-ws for new script workspaces so user variables are preserved
        const defaultWS = prev.find(ws => ws.id === "default-ws");
        const initialVars = defaultWS ? defaultWS.vars.map(v => ({ ...v })) : [];
        return [
          ...prev,
          {
            id: wsId,
            name: wsName,
            vars: initialVars
          }
        ];
      }
    });
  }, [activeScriptId, scriptName]);

  const activeWorkspace = envWorkspaces.find(ws => ws.id === activeWorkspaceId) || envWorkspaces[0] || { id: "default-ws", name: "Default Workspace", vars: [] };
  const envVars = activeWorkspace.vars;

  const setEnvVars = (modifier: any) => {
    setEnvWorkspaces(prevWorkspaces => {
      return prevWorkspaces.map(ws => {
        if (ws.id === (activeWorkspaceId || "default-ws")) {
          const newVars = typeof modifier === "function" ? modifier(ws.vars) : modifier;
          return { ...ws, vars: newVars };
        }
        return ws;
      });
    });
  };

  const executeRevokeEnv = (id: string, key: string) => {
    setEnvVars((prev: any) => prev.filter((item: any) => item.id !== id));
    addTerminalLine(`Revoked secret environment variable "${key}"`, "warning");
  };

  const executeDeleteWorkspace = (workspaceId: string) => {
    const wsToDel = envWorkspaces.find(ws => ws.id === workspaceId);
    if (!wsToDel) return;
    const remaining = envWorkspaces.filter(ws => ws.id !== workspaceId);
    setEnvWorkspaces(remaining);
    setActiveWorkspaceId(remaining[0].id);
    addTerminalLine(`Deleted Env Workspace: "${wsToDel.name}"`, "warning");
  };

  // Mobile responsiveness states
  const [showMobileSidebar, setShowMobileSidebar] = useState<boolean>(false);
  const [mobileActiveView, setMobileActiveView] = useState<"editor" | "preview" | "console">("editor");
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Full-screen image viewer modal states
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string>("");
  const [viewerPdf, setViewerPdf] = useState<string | null>(null);
  const [viewerExcel, setViewerExcel] = useState<{ name: string; sheets: { name: string; rows: any[][] }[] } | null>(null);
  const [viewerExcelLoading, setViewerExcelLoading] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Expanded states
  const [isFullscreenEditor, setIsFullscreenEditor] = useState<boolean>(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState<boolean>(false);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [showVersionsDropdown, setShowVersionsDropdown] = useState<boolean>(false);

  const sidebarActualWidth = (isFullscreenEditor || isFullscreenPreview) ? 0 : (isSidebarCollapsed ? 44 : sidebarWidth);
  const previewActualWidth = (isFullscreenEditor || isMobile) ? 0 : (isFullscreenPreview ? (windowWidth - sidebarActualWidth) : (isPreviewCollapsed ? 42 : previewWidth));
  const estimatedEditorWidth = isMobile ? windowWidth : (isFullscreenPreview ? 0 : (windowWidth - sidebarActualWidth - previewActualWidth));

  // Collaborative edit references
  const wsRef = useRef<WebSocket | null>(null);
  const ignoreNextChangeRef = useRef<boolean>(false);
  const myClientIdRef = useRef<string | null>(null);
  const [collaborators, setCollaborators] = useState<any[]>([]);

  // Automatic dropdown click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const clickTarget = e.target as HTMLElement;
      if (!clickTarget.closest("#versions-dropdown-trigger") && !clickTarget.closest("#versions-dropdown-menu")) {
        setShowVersionsDropdown(false);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Helper to ensure we always have a fresh idToken
  const getFreshToken = async (): Promise<string | null> => {
    if (!user) return null;
    try {
      const token = await user.getIdToken();
      setIdToken(token);
      return token;
    } catch (e) {
      console.error("Error refreshing Firebase token:", e);
      return idToken;
    }
  };

  // Keep references to the latest values to avoid stale closures in WebSocket event listeners without reconnecting
  const workspaceFilesRef = useRef(workspaceFiles);
  const activeFileNameRef = useRef(activeFileName);
  const currentCodeRef = useRef(currentCode);

  useEffect(() => {
    workspaceFilesRef.current = workspaceFiles;
  }, [workspaceFiles]);

  useEffect(() => {
    activeFileNameRef.current = activeFileName;
  }, [activeFileName]);

  useEffect(() => {
    currentCodeRef.current = currentCode;
  }, [currentCode]);

  // WebSockets collaboration system
  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected. Joining collaboration stream...");
      const roomId = activeScriptId || "playground";
      const name = user ? user.displayName || user.email?.split("@")[0] : `Guest_${Math.floor(Math.random() * 900 + 100)}`;
      const colors = ["#10b981", "#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      ws.send(JSON.stringify({
        type: "join",
        roomId,
        name,
        color: randomColor
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "welcome") {
          myClientIdRef.current = data.clientId;
        } else if (data.type === "workspace:request") {
          // Send current workspace files back so the new user gets synced
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "workspace:update",
              files: workspaceFilesRef.current,
              activeFileName: activeFileNameRef.current,
              currentCode: currentCodeRef.current
            }));
          }
        } else if (data.type === "workspace:update") {
          ignoreNextChangeRef.current = true;
          setWorkspaceFiles(data.files || []);
          if (data.activeFileName) {
            setActiveFileName(data.activeFileName);
          }
          if (data.currentCode !== undefined) {
            setCurrentCode(data.currentCode);
          }
        } else if (data.type === "code:update") {
          const updatedFileName = data.fileName || "main.js";
          ignoreNextChangeRef.current = true;
          
          // Always update the specific file's code in workspaceFiles
          setWorkspaceFiles(prev =>
            prev.map(f => f.name === updatedFileName ? { ...f, code: data.code } : f)
          );
          
          // Only update editor if it is currently active
          if (updatedFileName === activeFileNameRef.current) {
            setCurrentCode(data.code);
          }
        } else if (data.type === "presence:update") {
          // Filter out self so we only list others as collaborators
          const otherCollaborators = (data.presences || []).filter((p: any) => p.id !== myClientIdRef.current);
          setCollaborators(otherCollaborators);
        }
      } catch (e) {
        console.error("Collab websocket decode error:", e);
      }
    };

    ws.onclose = () => {
      console.log("Collab WebSocket connection closed.");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [activeScriptId, user]);

  // Close active previewer modals with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewerImage(null);
        setViewerPdf(null);
        setViewerExcel(null);
        setViewerVideo(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    let currentTok = idToken;
    if (!currentTok && user) {
      try {
        currentTok = await user.getIdToken();
        if (currentTok) setIdToken(currentTok);
      } catch (e) {
        console.error("Failed to get idToken in authenticatedFetch:", e);
      }
    }

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {})
    };
    if (currentTok) {
      headers["Authorization"] = `Bearer ${currentTok}`;
    }

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && user) {
      try {
        console.warn("API returned 401 Unauthorized. Attempting Google token refresh...");
        const freshToken = await user.getIdToken(true);
        if (freshToken) {
          setIdToken(freshToken);
          headers["Authorization"] = `Bearer ${freshToken}`;
          response = await fetch(url, { ...options, headers });
        }
      } catch (err) {
        console.error("Failed to auto-refresh token after 401:", err);
      }
    }

    return response;
  };

  // Periodically check and auto-refresh Google Auth Token before expiration
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const freshToken = await user.getIdToken();
        if (freshToken && freshToken !== idToken) {
          setIdToken(freshToken);
          console.log("Auto-refreshed Google Auth token successfully.");
        }
      } catch (e) {
        console.error("Error auto-checking token expiration:", e);
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [user, idToken]);

  // Listen to Google Auth Status Shifts and Token Changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          setIdToken(token);
          loadSavedScripts(token);
          loadRunHistory(token);
          loadSchedules(token);
          loadEnvWorkspaces(token);
          loadGeminiSettings(token);
          loadArtifacts();
        } catch (e) {
          console.error("Error getting idToken:", e);
        }
      } else {
        setIdToken(null);
        setScripts([]);
        setRunHistory([]);
        setSchedules([]);
        loadSavedScripts(""); // Load shared scripts only
        loadArtifacts();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadPackages();
    loadArtifacts();
  }, []);

  // Render real-time collaborator cursor positions in editor
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Generate brand-new cursor decorations for all active collaborators
    const newDecorations = collaborators
      .filter((c) => c.cursor && c.cursor.line && c.cursor.column)
      .flatMap((c) => {
        const lineCount = editor.getModel()?.getLineCount() || 1;
        const line = Math.max(1, Math.min(lineCount, c.cursor.line));
        const maxCol = editor.getModel()?.getLineMaxColumn(line) || 1;
        const column = Math.max(1, Math.min(maxCol, c.cursor.column));

        return [
          {
            range: new monaco.Range(line, column, line, column),
            options: {
              className: `collaborator-cursor-${c.id}`,
              after: {
                content: ` 👤 ${c.name}`,
                inlineClassName: `collaborator-label-${c.id}`,
              },
            },
          },
        ];
      });

    // Create or locate a styling tag to render dynamic CSS for collaborator colors
    let styleTag = document.getElementById("collaborator-cursor-styles") as HTMLStyleElement;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "collaborator-cursor-styles";
      document.head.appendChild(styleTag);
    }

    const cssRules = collaborators
      .map((c) => `
        .collaborator-cursor-${c.id} {
          border-left: 2px solid ${c.color || "#3b82f6"} !important;
          margin-left: -1px;
        }
        .collaborator-label-${c.id} {
          background-color: ${c.color || "#3b82f6"} !important;
          color: #ffffff !important;
          font-family: inherit;
          font-size: 8px;
          font-weight: 500;
          padding: 1px 3px;
          border-radius: 2px;
          margin-left: 4px;
          opacity: 0.9;
          vertical-align: middle;
        }
      `)
      .join("\n");
    styleTag.textContent = cssRules;

    // Update the live decorations
    collaborationDecorationsRef.current = editor.deltaDecorations(
      collaborationDecorationsRef.current,
      newDecorations
    );
  }, [collaborators]);

  // Trigger Monaco Editor layout recalculation on panel resize
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.layout();
    }
  }, [sidebarWidth, previewWidth, consoleHeight, isFullscreenEditor]);

  // Handle terminal scrolling
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines]);

  // Auto-Save background updates:
  useEffect(() => {
    if (autoSaveEnabled) {
      localStorage.setItem("playwright_autosave_code", currentCode);
    }
  }, [currentCode, autoSaveEnabled]);

  useEffect(() => {
    localStorage.setItem("playwright_autosave_enabled", String(autoSaveEnabled));
  }, [autoSaveEnabled]);

  // Restore auto-saved project on initial mount if applicable
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("projectId") || params.get("scriptId");
    if (!sharedId) {
      const isAutoSaveOn = localStorage.getItem("playwright_autosave_enabled") === "true";
      const autosaved = localStorage.getItem("playwright_autosave_code");
      if (isAutoSaveOn && autosaved) {
        setCurrentCode(autosaved);
        setTimeout(() => {
          addTerminalLine("Auto-Save: Restored your latest auto-saved project state from local storage.", "info");
        }, 1000);
      }
    }
  }, []);



  // Global window keyboard shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSidebarTab("search");
        if (isSidebarCollapsed) toggleSidebarCollapsed();
      } else if (isCmdOrCtrl && e.key === "Enter") {
        e.preventDefault();
        if (runScriptRef.current) runScriptRef.current();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveScriptRef.current) saveScriptRef.current();
      }
    };
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, []);

  // Global window mouse hook for resizable tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(120, Math.min(450, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isResizingPreview) {
        const newWidth = Math.max(180, Math.min(805, window.innerWidth - e.clientX));
        setPreviewWidth(newWidth);
      } else if (isResizingConsole) {
        const newHeight = Math.max(80, Math.min(600, window.innerHeight - e.clientY));
        setConsoleHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingPreview(false);
      setIsResizingConsole(false);
    };

    if (isResizingSidebar || isResizingPreview || isResizingConsole) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar, isResizingPreview, isResizingConsole]);

  // Load shared project if projectId or scriptId is provided in URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("projectId") || params.get("scriptId");
    if (sharedId) {
      addTerminalLine(`Shared: Requesting project [${sharedId}] details from repository...`, "info");
      fetch(`/api/scripts/${sharedId}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            handleLoadScript(data);
            addTerminalLine(`Shared: Successfully fetched project "${data.name}" into your workspace!`, "success");
            if (user && data.ownerId !== user.uid) {
              addTerminalLine("Notice: You are viewing a shared project. Click 'Copy' to copy to your own workspace.", "warning");
            }
          } else {
            const err = await res.json().catch(() => ({}));
            addTerminalLine(`Shared: Failed loading project: ${err.error || res.statusText}`, "error");
          }
        })
        .catch((err) => {
          addTerminalLine(`Shared: Connection failure during project retrieve: ${err.message}`, "error");
        });
    }
  }, [user]); // re-evaluate when user authentication loads to print correct ownership copy advice

  // Load shared environment workspace if env_share is provided in URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const envShareId = params.get("env_share");
    if (envShareId) {
      addTerminalLine(`Shared Env: Requesting shared environment workspace details...`, "info");
      fetch(`/api/env/share/${envShareId}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setSharedEnvToImport(data);
            setImportNewName(`${data.name} (Shared)`);
            setImportTargetWorkspaceId(activeWorkspaceId || "default-ws");
            addTerminalLine(`Shared Env: Successfully fetched "${data.name}". Review and select project destination in the popup!`, "success");
            
            // Clean up the URL parameter gracefully
            const newUrl = window.location.pathname + window.location.search.replace(/[\?&]env_share=[^&]+/, '').replace(/^&/, '?');
            window.history.replaceState({}, '', newUrl);
          } else {
            const err = await res.json().catch(() => ({}));
            addTerminalLine(`Shared Env: Failed loading environment: ${err.error || res.statusText}`, "error");
          }
        })
        .catch((err) => {
          addTerminalLine(`Shared Env: Connection failure during retrieve: ${err.message}`, "error");
        });
    }
  }, []);

  const fetchDiagnostics = async () => {
    setCheckingDiagnostics(true);
    try {
      const res = await fetch("/api/diagnostics/system-libraries");
      if (res.ok) {
        const data = await res.json();
        setDiagnosticResult(data);
      }
    } catch (err: any) {
      console.error("Failed to fetch diagnostics:", err);
    } finally {
      setCheckingDiagnostics(false);
    }
  };

  const handleInstallSysDeps = async () => {
    setInstallingSysDeps(true);
    addTerminalLine("Playwright Diagnostics: Launching system package installer (playwright install-deps)...", "info");
    try {
      const res = await fetch("/api/diagnostics/install-deps", {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        addTerminalLine(`Playwright Diagnostics: ${data.message}`, "success");
        // Re-check after 15 seconds to see if dependencies resolved
        setTimeout(() => {
          fetchDiagnostics();
        }, 15000);
      } else {
        const err = await res.json();
        addTerminalLine(`Playwright Diagnostics Error: ${err.error || "Failed to trigger installer"}`, "error");
      }
    } catch (e: any) {
      addTerminalLine(`Playwright Diagnostics Error: ${e.message}`, "error");
    } finally {
      setInstallingSysDeps(false);
    }
  };

  const loadPackages = async () => {
    try {
      const res = await fetch("/api/packages");
      if (res.ok) {
        const data = await res.json();
        setInstalledDeps(data.dependencies || {});
      }
    } catch (e) {
      console.error("Could not load packages info from backend:", e);
    }
    await fetchDiagnostics();
  };

  const loadSavedScripts = async (token?: string) => {
    try {
      const activeToken = token !== undefined ? token : idToken;
      const headers: any = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }
      const res = await authenticatedFetch("/api/scripts", { headers });
      if (res.ok) {
        const data = await res.json();
        setScripts(data);
      }
    } catch (e) {
      addTerminalLine("Failed to contact backend script repository", "error");
    }
  };

  const loadRunHistory = async (token?: string) => {
    const activeToken = token !== undefined ? token : idToken;
    if (!activeToken) {
      setRunHistory([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await authenticatedFetch("/api/runs", {
        headers: { "Authorization": `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRunHistory(data);
      }
    } catch (err) {
      console.error("Failed to load run history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadSchedules = async (token?: string) => {
    const activeToken = token !== undefined ? token : idToken;
    if (!activeToken) {
      setSchedules([]);
      return;
    }
    setLoadingSchedules(true);
    try {
      const res = await authenticatedFetch("/api/schedules", {
        headers: { "Authorization": `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!activeScriptId) {
      addTerminalLine("Scheduler Error: No active saved Project to schedule.", "error");
      return;
    }

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": idToken ? `Bearer ${idToken}` : "",
        },
        body: JSON.stringify({
          scriptId: activeScriptId,
          scriptName: scriptName,
          targetFile: scheduleTargetFile,
          type: scheduleType,
          datetime: scheduleType === "once" ? scheduleDatetime : undefined,
          repeatInterval: scheduleType === "repeat" ? scheduleInterval : undefined,
          status: "active",
          viewportWidth: scheduleViewportWidth,
          viewportHeight: scheduleViewportHeight
        })
      });
      if (res.ok) {
        addTerminalLine(`Scheduler: Created trigger schedule for "${scriptName} -> ${scheduleTargetFile}" successfully!`, "success");
        // Reset form
        setScheduleDatetime("");
        loadSchedules();
      } else {
        const data = await res.json();
        addTerminalLine(`Scheduler Error: ${data.error || "Failed to save schedule"}`, "error");
      }
    } catch (err: any) {
      addTerminalLine(`Scheduler Error: ${err.message}`, "error");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": idToken ? `Bearer ${idToken}` : "",
        }
      });
      if (res.ok) {
        addTerminalLine("Scheduler: Deleted registered trigger schedule.", "info");
        loadSchedules();
      }
    } catch (err: any) {
      addTerminalLine(`Scheduler delete error: ${err.message}`, "error");
    }
  };

  const handleToggleSchedule = async (item: any) => {
    const newStatus = item.status === "active" ? "paused" : "active";
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": idToken ? `Bearer ${idToken}` : "",
        },
        body: JSON.stringify({
          ...item,
          status: newStatus
        })
      });
      if (res.ok) {
        addTerminalLine(`Scheduler: Toggled trigger schedule to ${newStatus}`, "info");
        loadSchedules();
      }
    } catch (err: any) {
      addTerminalLine(`Scheduler status change error: ${err.message}`, "error");
    }
  };

  const loadEnvWorkspaces = async (token?: string) => {
    const activeToken = token !== undefined ? token : idToken;
    if (!activeToken) return;
    try {
      const res = await authenticatedFetch("/api/env/workspaces", {
        headers: { "Authorization": `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        hasLoadedEnvFromServerRef.current = true;
        if (data && Array.isArray(data) && data.length > 0) {
          setEnvWorkspaces(prevLocal => {
            const mergedMap = new Map<string, EnvWorkspace>();

            // 1. Add server workspaces
            data.forEach((serverWS: EnvWorkspace) => {
              mergedMap.set(serverWS.id, serverWS);
            });

            // 2. Merge local workspaces so local changes/new vars aren't lost
            prevLocal.forEach((localWS: EnvWorkspace) => {
              if (!mergedMap.has(localWS.id)) {
                mergedMap.set(localWS.id, localWS);
              } else {
                const existingServerWS = mergedMap.get(localWS.id)!;
                const varMap = new Map<string, any>();
                existingServerWS.vars.forEach((v: any) => varMap.set(v.id || v.key, v));

                localWS.vars.forEach((v: any) => {
                  const keyOrId = v.id || v.key;
                  if (!varMap.has(keyOrId)) {
                    varMap.set(keyOrId, v);
                  } else {
                    const serverVar = varMap.get(keyOrId)!;
                    if (!serverVar.isSaved && v.value) {
                      varMap.set(keyOrId, v);
                    }
                  }
                });

                mergedMap.set(localWS.id, {
                  ...existingServerWS,
                  name: localWS.name || existingServerWS.name,
                  vars: Array.from(varMap.values())
                });
              }
            });

            return Array.from(mergedMap.values());
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch environment workspaces from backend:", e);
    }
  };

  const loadGeminiSettings = async (token?: string) => {
    const activeToken = token !== undefined ? token : idToken;
    if (!activeToken) return;
    try {
      const res = await authenticatedFetch("/api/user/gemini-settings", {
        headers: { "Authorization": `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setGeminiApiKey(data.apiKey || "");
          setGeminiModel(data.model || "gemini-2.5-flash");
          setGeminiCaptchaCount(data.captchaCount || 0);
        }
      }
    } catch (e) {
      console.error("Failed to fetch Gemini settings:", e);
    }
  };

  const saveGeminiSettings = async () => {
    if (!idToken) return;
    setSavingGeminiSettings(true);
    setGeminiSettingsMessage(null);
    try {
      const res = await authenticatedFetch("/api/user/gemini-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ apiKey: geminiApiKey, model: geminiModel })
      });
      if (res.ok) {
        setGeminiSettingsMessage({ text: "Gemini API Settings saved successfully!", type: "success" });
        addTerminalLine("Success: User Gemini API Settings updated successfully on backend database.", "info");
        await loadGeminiSettings(idToken);
      } else {
        const errData = await res.json();
        setGeminiSettingsMessage({ text: errData.error || "Failed to save settings", type: "error" });
      }
    } catch (e: any) {
      setGeminiSettingsMessage({ text: e.message || "Network error", type: "error" });
    } finally {
      setSavingGeminiSettings(false);
    }
  };

  const saveEnvWorkspacesToServer = async (latestWorkspaces: EnvWorkspace[], token?: string) => {
    const activeToken = token !== undefined ? token : idToken;
    if (!activeToken) return;
    try {
      hasLoadedEnvFromServerRef.current = true;
      const res = await authenticatedFetch("/api/env/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeToken}`
        },
        body: JSON.stringify({ workspaces: latestWorkspaces })
      });
      if (!res.ok) {
        console.error("Failed to save environment workspaces to backend");
      }
    } catch (e) {
      console.error("Failed to save environment workspaces to backend:", e);
    }
  };

  const handleSaveVariable = async (envId: string) => {
    const currentWS = envWorkspaces.find(ws => ws.id === activeWorkspaceId);
    if (!currentWS) return;
    const item = currentWS.vars.find(v => v.id === envId);
    if (!item) return;

    if (!String(item.key || "").trim()) {
      alert("Please enter a valid Variable Key (e.g. TARGET_API_KEY).");
      return;
    }

    const targetVarsFirst = currentWS.vars.map(v => v.id === envId ? { ...v, isSaved: true, wasSaved: false, backupKey: undefined, backupValue: undefined } : v);
    const targetWSListFirst = envWorkspaces.map(ws => ws.id === activeWorkspaceId ? { ...ws, vars: targetVarsFirst } : ws);

    if (idToken) {
      await saveEnvWorkspacesToServer(targetWSListFirst);
    }

    setEnvVars((prev: any) => prev.map((v: any) => v.id === envId ? { ...v, value: "••••••••••••", isSaved: true, wasSaved: false, backupKey: undefined, backupValue: undefined } : v));
    addTerminalLine(`Successfully locked and saved environment variable: "${item.key}"`, "success");
  };

  const loadArtifacts = async () => {
    try {
      const url = activeScriptId ? `/api/artifacts?scriptId=${encodeURIComponent(activeScriptId)}` : "/api/artifacts";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data);

        // Record artifacts version history in localStorage
        setArtifactVersionHistory((prevHistory: any) => {
          const nextHistory = { ...prevHistory };
          let updated = false;

          data.forEach((art: any) => {
            const versions = nextHistory[art.name] || [];
            
            // Validate if we have a version matching this combination of size and timestamp
            const exists = versions.some((v: any) => 
              v.size === art.size && v.timestamp === art.timestamp
            );

            if (!exists) {
              const newVersion = {
                url: art.url,
                timestamp: art.timestamp || new Date().toISOString(),
                size: art.size || 0,
                note: versions.length === 0 ? "Initial Capture" : `Automated Capture #${versions.length + 1}`
              };
              nextHistory[art.name] = [newVersion, ...versions];
              updated = true;
            }
          });

          if (updated) {
            localStorage.setItem("playwright_artifact_version_history", JSON.stringify(nextHistory));
          }
          return nextHistory;
        });
      }
    } catch (e) {
      console.error("Failed to load artifacts:", e);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!user) {
      addTerminalLine("Please sign in first to upload script assets.", "error");
      return;
    }
    setUploading(true);
    addTerminalLine(`Assets: Reading file "${file.name}"...`, "info");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (typeof reader.result !== "string") {
            throw new Error("Failed to read file.");
          }
          const base64Content = reader.result.split(",")[1];
          const headers: HeadersInit = {
            "Content-Type": "application/json"
          };
          if (idToken) {
            headers["Authorization"] = `Bearer ${idToken}`;
          }
          const res = await fetch("/api/uploads", {
            method: "POST",
            headers,
            body: JSON.stringify({
              name: file.name,
              content: base64Content,
              scriptId: activeScriptId || undefined
            })
          });
          if (res.ok) {
            addTerminalLine(`Assets: Successfully uploaded "${file.name}" into uploads folder. You can use it in your script as: path.join(process.cwd(), "uploads", "${file.name}") or "uploads/${file.name}"`, "success");
            loadArtifacts();
          } else {
            const errData = await res.json().catch(() => ({}));
            addTerminalLine(`Upload Failed: ${errData.error || "Server error"}`, "error");
          }
        } catch (innerErr: any) {
          addTerminalLine(`Upload Error: ${innerErr.message}`, "error");
        } finally {
          setUploading(false);
        }
      };
      reader.onerror = () => {
        addTerminalLine("Error reading file on client.", "error");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      addTerminalLine(`Upload Error: ${err.message}`, "error");
      setUploading(false);
    }
  };

  const handleDeleteUpload = async (filename: string, e?: React.MouseEvent, type: string = "upload") => {
    if (e) e.stopPropagation();
    if (!user) {
      addTerminalLine("Please sign in first to delete script assets.", "error");
      return;
    }
    setFileToDelete(filename);
    setFileToDeleteType(type);
  };

  const executeDeleteUpload = async (filename: string, type: string = "upload") => {
    try {
      const headers: HeadersInit = {};
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }
      const res = await fetch(`/api/artifacts/${type}/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers
      });
      if (res.ok) {
        addTerminalLine(`Assets: Successfully deleted asset "${filename}"`, "success");
        loadArtifacts();
      } else {
        // Fallback to the uploads specific delete if route is not resolved
        const fallbackRes = await fetch(`/api/uploads/${encodeURIComponent(filename)}`, {
          method: "DELETE",
          headers
        });
        if (fallbackRes.ok) {
          addTerminalLine(`Assets: Successfully deleted asset "${filename}"`, "success");
          loadArtifacts();
        } else {
          const data = await fallbackRes.json().catch(() => ({}));
          addTerminalLine(`Delete Failed: ${data.error || "Server error"}`, "error");
        }
      }
    } catch (err: any) {
      addTerminalLine(`Delete Error: ${err.message}`, "error");
    }
  };

  const handleDownloadScript = () => {
    try {
      const element = document.createElement("a");
      const file = new Blob([currentCode], { type: "text/javascript" });
      element.href = URL.createObjectURL(file);
      const currentScript = scripts.find(s => s.id === activeScriptId);
      let filename = currentScript ? `${currentScript.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}` : "script";
      if (!filename.endsWith(".js") && !filename.endsWith(".ts")) {
        filename += ".js";
      }
      element.download = filename;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      addTerminalLine(`Download: Initiated local download for file "${filename}"`, "success");
    } catch (err: any) {
      console.error("Failed to download script:", err);
      addTerminalLine(`Download Error: ${err.message}`, "error");
    }
  };

  const handleDownloadProjectZip = async () => {
    setIsPackagingZip(true);
    try {
      addTerminalLine("Download: Packaging displayed project files into ZIP archive...", "info");
      const zip = new JSZip();

      // Gather displayed project files, syncing active editor code
      const currentWorkspaceFiles = (workspaceFiles && workspaceFiles.length > 0)
        ? workspaceFiles.map(f => f.name === activeFileName ? { ...f, code: currentCode } : f)
        : [];

      // If active file is not in workspaceFiles array yet, add it
      if (activeFileName && !currentWorkspaceFiles.some(f => f.name === activeFileName)) {
        currentWorkspaceFiles.push({ name: activeFileName, code: currentCode });
      }

      // Fallback if no files exist
      if (currentWorkspaceFiles.length === 0) {
        const safeName = (scriptName || "main").replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const mainFileName = safeName.endsWith(".js") || safeName.endsWith(".ts") ? safeName : `${safeName}.js`;
        currentWorkspaceFiles.push({ name: mainFileName, code: currentCode || "// Empty script" });
      }

      // Add ONLY displayed project files to the root of the ZIP
      currentWorkspaceFiles.forEach(file => {
        zip.file(file.name, file.code);
      });

      // Generate & trigger browser download
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      const zipFilename = `${(scriptName || "project").replace(/[^a-zA-Z0-9.\-_]/g, "_")}-project.zip`;
      link.href = zipUrl;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(zipUrl);

      addTerminalLine(`Download: Displayed project files successfully packaged and downloaded as "${zipFilename}"!`, "success");
    } catch (err: any) {
      console.error("Failed to package project files:", err);
      addTerminalLine(`Download Error: ${err.message || err}`, "error");
    } finally {
      setIsPackagingZip(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      setIdToken(token);
      setUser(result.user);
      addTerminalLine(`Auth: Signed in as ${result.user.email} (Google)`, "success");
      loadSavedScripts(token);
      loadRunHistory(token);
      loadEnvWorkspaces(token);
    } catch (error: any) {
      addTerminalLine(`Auth Error: ${error.message || error}`, "error");
    }
  };

  const handleManualSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      if (!loginEmail || !loginPassword) {
        throw new Error("Please fill in all manual login fields.");
      }
      const result = await signInWithEmailAndPassword(loginEmail, loginPassword);
      const token = await result.user.getIdToken();
      setIdToken(token);
      setUser(result.user);
      addTerminalLine(`Auth: Signed in manually as ${result.user.email} (Admin)`, "success");
      
      // clear credentials on success
      setLoginEmail("");
      setLoginPassword("");
      setShowLoginModal(false);
      
      loadSavedScripts(token);
      loadRunHistory(token);
      loadEnvWorkspaces(token);
    } catch (error: any) {
      setLoginError(error.message || "Invalid email or password");
      addTerminalLine(`Auth Error: ${error.message || error}`, "error");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setIdToken(null);
      setUser(null);
      setScripts([]);
      setRunHistory([]);
      addTerminalLine("Auth: Successfully signed out", "info");
      loadSavedScripts("");
    } catch (error: any) {
      addTerminalLine(`Auth Error: ${error.message}`, "error");
    }
  };

  const handleInitializePlaywright = async () => {
    setInitializingPlaywright(true);
    addTerminalLine("Playwright: Starting browser installation (npx playwright install chromium)... This might take 1 - 2 minutes.", "info");
    try {
      const response = await fetch("/api/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": idToken ? `Bearer ${idToken}` : "",
        },
      });
      if (response.ok) {
        const data = await response.json();
        addTerminalLine(`Playwright: Browsers successfully initialized! ${data.message || ""}`, "success");
      } else {
        const data = await response.json().catch(() => ({}));
        addTerminalLine(`Playwright Initialization Error: ${data.error || "Server error"} ${data.details || ""}`, "error");
      }
    } catch (err: any) {
      addTerminalLine(`Playwright Network Error: ${err.message}`, "error");
    } finally {
      setInitializingPlaywright(false);
    }
  };

  const handleFormatScript = async () => {
    if (!currentCode.trim()) return;
    setFormatting(true);
    addTerminalLine("Prettier: Formatting document script...", "info");
    try {
      const res = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentCode })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentCode(data.formatted);
        addTerminalLine("Prettier: Code formatted successfully!", "success");
      } else {
        const data = await res.json();
        addTerminalLine(`Prettier format failed: ${data.error}`, "error");
      }
    } catch (err: any) {
      addTerminalLine(`Prettier format error: ${err.message}`, "error");
    } finally {
      setFormatting(false);
    }
  };

  const performInstallPackageByName = async (pkgName: string) => {
    const pkg = pkgName.trim();
    if (!pkg) return;
    setInstallingPkg(pkg);
    addTerminalLine(`NPM: Bootstrapping installer command for package: "${pkg}"...`, "info");
    try {
      const res = await fetch("/api/packages/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pkg })
      });
      if (res.ok) {
        addTerminalLine(`NPM: Package "${pkg}" successfully installed to node_modules/!`, "success");
        loadPackages();
      } else {
        const data = await res.json();
        addTerminalLine(`NPM Error installing "${pkg}": ${data.error || "failed"}`, "error");
      }
    } catch (err: any) {
      addTerminalLine(`NPM network issue: ${err.message}`, "error");
    } finally {
      setInstallingPkg(null);
    }
  };

  const handleInstallPackage = async () => {
    const pkg = newPkgName.trim();
    if (!pkg) return;
    await performInstallPackageByName(pkg);
    setNewPkgName("");
  };

  const addTerminalLine = (message: string, type: TerminalLine["type"] = "log") => {
    const newLine: TerminalLine = {
      id: Math.random().toString(36).substring(2, 9),
      message,
      timestamp: new Date().toLocaleTimeString(),
      type
    };
    setTerminalLines(prev => [...prev, newLine]);
  };

  const handleEditorChange = (val: string | undefined) => {
    const newVal = val || "";
    setCurrentCode(newVal);
    setWorkspaceFiles(prev =>
      prev.map(f => f.name === activeFileName ? { ...f, code: newVal } : f)
    );

    if (ignoreNextChangeRef.current) {
      ignoreNextChangeRef.current = false;
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "code:update",
        code: newVal
      }));
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.updateOptions({
      glyphMargin: true
    });

    editor.onMouseDown((e: any) => {
      if (!monacoRef.current) return;
      const target = e.target;
      if (
        target.type === monacoRef.current.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        target.type === monacoRef.current.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        if (target.position && target.position.lineNumber) {
          const line = target.position.lineNumber;
          toggleBreakpointRef.current(line);
        }
      }
    });

    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPos({
        line: e.position.lineNumber,
        column: e.position.column
      });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "cursor:moved",
          cursor: {
            line: e.position.lineNumber,
            column: e.position.column
          }
        }));
      }
    });

    // Intercept inside-editor Ctrl+Enter and Ctrl+S
    if (monaco) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (runScriptRef.current) runScriptRef.current();
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (saveScriptRef.current) saveScriptRef.current();
      });
    }
  };

  const handleSelectTemplate = (template: ScriptTemplate) => {
    setSelectedTemplateId(template.id);
    setWorkspaceFiles([
      { name: "main.js", code: template.code }
    ]);
    setActiveFileName("main.js");
    setCurrentCode(template.code);
    setScriptName("");
    setActiveScriptId(null);
    setIsPrivate(true);
    setOriginalCode(template.code);
    setOriginalName("");
    setVersions([]); // Reset versions back to empty when loaded from template
    addTerminalLine(`Loaded pre-built template: ${template.name}`, "info");
  };

  const handleDownloadExtensionZip = async () => {
    try {
      const zip = new JSZip();
      EXTENSION_FILES.forEach((file) => {
        zip.file(file.name, file.code);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "playwright-recorder-extension.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addTerminalLine("Success: Playwright Recorder Chrome Extension ZIP bundle generated & downloaded successfully!", "info");
    } catch (err: any) {
      console.error("Failed to generate ZIP:", err);
      addTerminalLine(`Error: Failed to package extension: ${err.message || err}`, "error");
    }
  };

  const handleGenerateAIScript = async () => {
    const promptText = aiPrompt.trim();
    if (!promptText) {
      setAiError("Please type a description of what you want the script to do first.");
      return;
    }

    if (!user) {
      setAiError("Please sign in with Google to utilize Gemini AI generation.");
      return;
    }

    setGeneratingScript(true);
    setAiError(null);
    setAiSuccessMessage(null);
    setAiGeneratedExplanation(null);

    addTerminalLine(`AI: Generating script from prompt: "${promptText.length > 50 ? promptText.substring(0, 50) + "..." : promptText}"`, "info");

    try {
      const headers: any = { "Content-Type": "application/json" };
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: promptText,
          currentCode: currentCode,
          mode: aiGenerationMode
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate script");
      }

      const generatedCode = data.code;
      const suggestedName = data.suggestedName;
      const explanation = data.explanation;

      let newCode = currentCode;
      if (aiGenerationMode === "replace") {
        newCode = generatedCode;
        if (!scriptName || scriptName === "Untitled Script" || scriptName.startsWith("v-") || scriptName === "Custom Playground") {
          setScriptName(suggestedName);
        }
      } else if (aiGenerationMode === "append") {
        newCode = currentCode ? `${currentCode}\n\n${generatedCode}` : generatedCode;
      } else if (aiGenerationMode === "prepend") {
        newCode = currentCode ? `${generatedCode}\n\n${currentCode}` : generatedCode;
      }

      setCurrentCode(newCode);
      setAiGeneratedExplanation(explanation);
      setAiSuccessMessage(`Successfully integrated automation code: "${suggestedName}"`);
      addTerminalLine(`AI Success: Generated Playwright automation script section. Name suggestion: "${suggestedName}"`, "success");
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "An unexpected error occurred during AI code generation.");
      addTerminalLine(`AI Error: ${err.message || "Failed to compile generated script code."}`, "error");
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleLoadScript = (script: SavedScript) => {
    const files = script.files && script.files.length > 0 
      ? script.files 
      : [{ name: "main.js", code: script.code }];
    setWorkspaceFiles(files);
    
    const mainFile = files.find(f => f.name === "main.js") || files[0];
    setActiveFileName(mainFile.name);
    setCurrentCode(mainFile.code);

    setScriptName(script.name);
    setSelectedTemplateId("");
    setActiveScriptId(script.id || null);
    setIsPrivate(script.isPrivate !== false);
    setOriginalCode(script.code);
    setOriginalName(script.name);
    setVersions(script.versions || []); // Extract previous snapshots
    addTerminalLine(`Loaded custom script workspace: "${script.name}" (${files.length} file${files.length !== 1 ? 's' : ''})`, "info");
  };

  const handleSwitchFile = (newFileName: string) => {
    const file = workspaceFiles.find(f => f.name === newFileName);
    if (file) {
      setActiveFileName(newFileName);
      setCurrentCode(file.code);
    }
  };

  const handleSwitchFileAndJump = (fileName: string, line: number, column?: number, matchLength?: number) => {
    handleSwitchFile(fileName);
    setTimeout(() => {
      jumpToLine(line, column, matchLength);
    }, 100);
  };

  const handleCreateFile = (fileName: string) => {
    const trimmed = fileName.trim();
    if (!trimmed) return;
    if (workspaceFiles.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
      alert("A file with this name already exists in the workspace.");
      return;
    }
    const newFile = {
      name: trimmed,
      code: `// ${trimmed}\n\nmodule.exports = {\n  // export helper functions here\n};\n`
    };
    setWorkspaceFiles(prev => [...prev, newFile]);
    setActiveFileName(trimmed);
    setCurrentCode(newFile.code);
    addTerminalLine(`Created file: "${trimmed}"`, "success");
  };

  const handleRenameFile = (oldName: string, newName: string) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedOld === trimmedNew) return;
    if (workspaceFiles.some(f => f.name.toLowerCase() === trimmedNew.toLowerCase())) {
      alert("A file with this name already exists in the workspace.");
      return;
    }
    if (trimmedOld === "main.js") {
      alert("The entry point 'main.js' cannot be renamed.");
      return;
    }
    setWorkspaceFiles(prev =>
      prev.map(f => f.name === trimmedOld ? { ...f, name: trimmedNew } : f)
    );
    if (activeFileName === trimmedOld) {
      setActiveFileName(trimmedNew);
    }
    addTerminalLine(`Renamed file "${trimmedOld}" to "${trimmedNew}"`, "info");
  };

  const handleDeleteFile = (fileName: string) => {
    const trimmed = fileName.trim();
    if (trimmed === "main.js") {
      alert("The entry point 'main.js' cannot be deleted.");
      return;
    }
    setWorkspaceFileToDelete(trimmed);
  };

  const executeDeleteFile = (fileName: string) => {
    const trimmed = fileName.trim();
    setWorkspaceFiles(prev => prev.filter(f => f.name !== trimmed));
    if (activeFileName === trimmed) {
      const fallback = workspaceFiles.find(f => f.name === "main.js") || workspaceFiles[0];
      if (fallback) {
        setActiveFileName(fallback.name);
        setCurrentCode(fallback.code);
      }
    }
    addTerminalLine(`Deleted script file: "${trimmed}"`, "warning");
  };

  const handleSaveScript = async (
    customName?: any, 
    customCode?: string, 
    customFiles?: { name: string, code: string }[],
    overrideScriptId?: string | null
  ) => {
    const nameToSave = String(
      (customName !== undefined && typeof customName === "string") 
        ? customName 
        : (scriptName || "")
    ).trim();
    if (!nameToSave) {
      alert("Please provide a valid script name to save.");
      return;
    }
    if (!user) {
      alert("Please sign in with Google to save scripts securely.");
      return;
    }

    const activeToken = await getFreshToken();
    setSavingScript(true);
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }
      const filesToSave = customFiles !== undefined ? customFiles : workspaceFiles;
      const entryCode = filesToSave.find(f => f.name === "main.js")?.code || (customCode !== undefined ? customCode : currentCode);
      const scriptIdToSave = overrideScriptId !== undefined ? overrideScriptId : activeScriptId;
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: scriptIdToSave || undefined,
          name: nameToSave,
          code: entryCode,
          files: filesToSave,
          isPrivate: isPrivate
        })
      });

      if (res.ok) {
        const saved = await res.json();
        setScriptSavedMsg("Project saved successfully!");
        setTimeout(() => setScriptSavedMsg(null), 3500);
        addTerminalLine(`Project "${nameToSave}" saved successfully (Encrypted in Cloud DB)`, "success");
        setActiveScriptId(saved.id);
        setVersions(saved.versions || []); // Populate versions list immediately
        setOriginalCode(customCode !== undefined ? customCode : currentCode);
        setOriginalName(nameToSave);
        loadSavedScripts(activeToken || undefined);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || "Could not save project"}`);
      }
    } catch (e) {
      alert("Network error: Could not contact storage server.");
    } finally {
      setSavingScript(false);
    }
  };

  const handleMakeCopy = async (script: SavedScript) => {
    if (!user) {
      alert("Please sign in with Google to copy this script to your workspace.");
      return;
    }
    const activeToken = await getFreshToken();
    try {
      const copyName = `Copy of ${script.name}`;
      const headers: any = { "Content-Type": "application/json" };
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: copyName,
          code: script.code,
          files: script.files || [{ name: "main.js", code: script.code }],
          isPrivate: true
        })
      });

      if (res.ok) {
        const saved = await res.json();
        addTerminalLine(`Copied "${script.name}" as "${copyName}" into your workspace`, "success");
        handleLoadScript(saved);
        loadSavedScripts(activeToken || undefined);
      } else {
        const err = await res.json();
        alert(`Error making a copy: ${err.error || "failed"}`);
      }
    } catch (e) {
      alert("Network error: Could not contact storage server.");
    }
  };

  const handleDeleteScript = async (script: SavedScript, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!script.id) {
      addTerminalLine("Cannot delete an unsaved script representation.", "error");
      return;
    }
    setScriptToDelete(script);
  };

  const executeDeleteScript = async (script: SavedScript) => {
    const activeToken = await getFreshToken();
    try {
      const headers: any = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }
      const res = await fetch(`/api/scripts/${encodeURIComponent(script.id!)}`, {
        method: "DELETE",
        headers
      });

      if (res.ok) {
        addTerminalLine(`Script "${script.name}" deleted from database`, "warning");
        if (activeScriptId === script.id) {
          setScriptName("");
          setOriginalName("");
          setActiveScriptId(null);
        }
        loadSavedScripts(activeToken || undefined);
      } else {
        const err = await res.json().catch(() => ({}));
        addTerminalLine(`Error deleting script: ${err.error || "Forbidden"}`, "error");
      }
    } catch (e: any) {
      addTerminalLine(`Could not delete script from storage: ${e.message}`, "error");
    }
  };

  const performPreRunValidation = (code: string, envs: { key: string; value: string }[]): { type: "error" | "warning"; message: string; line?: number }[] => {
    const issues: { type: "error" | "warning"; message: string; line?: number }[] = [];

    // 1. Syntax parser check
    try {
      new Function("async () => {\n" + code + "\n}");
    } catch (err: any) {
      issues.push({
        type: "error",
        message: `JavaScript Syntax Error: ${err.message}. Please check for mismatched brackets, unclosed parentheses, or invalid code syntax.`
      });
    }

    // 2. Missing environment variables check
    const envRegex = /process\.env(?:(?:\.([A-Za-z0-9_]+))|(?:\[['"]([A-Za-z0-9_]+)['"]\]))/g;
    let match;
    const foundEnvVars = new Set<string>();
    while ((match = envRegex.exec(code)) !== null) {
      const varName = match[1] || match[2];
      if (varName) {
        foundEnvVars.add(varName);
      }
    }

    const definedKeys = new Set(envs.map(ev => String(ev?.key || "").trim()).filter(Boolean));
    for (const requiredVar of foundEnvVars) {
      const isDefined = definedKeys.has(requiredVar);
      const envItem = envs.find(ev => String(ev?.key || "").trim() === requiredVar);
      const isEmpty = envItem ? !envItem.value : true;

      if (!isDefined || isEmpty) {
        issues.push({
          type: "warning",
          message: `Missing/Empty Env Var: "${requiredVar}" is referenced in the script but is missing or has an empty value in your workspace.`
        });
      }
    }

    // 3. Playwright Async missing 'await' check
    const asyncMethods = [
      "goto", "click", "fill", "type", "press", "waitForTimeout", "waitForSelector", 
      "waitForLoadState", "waitForNavigation", "screenshot", "pdf", "evaluate", 
      "evalOnSelector", "$eval", "$$eval", "focus", "hover", "check", "uncheck", 
      "dblclick", "setInputFiles", "selectOption", "setContent", "addScriptTag", 
      "addStyleTag", "title", "content", "innerText", "textContent", "getAttribute", 
      "inputValue", "close"
    ];

    const lines = code.split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return;
      }

      const methodMatch = trimmed.match(/\b(page|locator|browser|context)\.([a-zA-Z0-9_$]+)\b/);
      if (methodMatch) {
        const prefix = methodMatch[1];
        const method = methodMatch[2];

        if (asyncMethods.includes(method)) {
          if (!trimmed.includes("await") && !trimmed.includes("return ")) {
            issues.push({
              type: "warning",
              line: index + 1,
              message: `Potential missing "await" on line ${index + 1}: Playwright call "${prefix}.${method}(...)" is called without an "await" prefix.`
            });
          }
        }
      }
    });

    return issues;
  };

  const handleRunScript = async (
    bypassValidation: any = false,
    overrideCode?: string,
    overrideFiles?: { name: string; code: string }[],
    overrideScriptId?: string | null,
    overrideScriptName?: string
  ) => {
    if (status === "running" || status === "connecting") return;

    const codeToRun = overrideCode !== undefined ? overrideCode : currentCode;
    const filesToRun = overrideFiles !== undefined ? overrideFiles : workspaceFiles;
    const scriptIdToRun = overrideScriptId !== undefined ? overrideScriptId : activeScriptId;
    const scriptNameToRun = overrideScriptName !== undefined ? overrideScriptName : scriptName;

    const shouldBypass = typeof bypassValidation === "boolean" ? bypassValidation : false;

    if (!shouldBypass) {
      const issues = performPreRunValidation(codeToRun, envVars);
      if (issues.length > 0) {
        setValidationIssues(issues);
        setShowValidationModal(true);
        return;
      }
    }

    // Reset runtime states
    setTerminalLines([]);
    setNetworkLogs([]);
    setSelectedNetworkLog(null);
    setBrowserCookies([]);
    setPreviewImage(null);
    setPendingChoice(null);
    setSelectedIndexes([]);
    setSubmittingChoice(false);
    setStatus("connecting");
    addTerminalLine("Engine: Queueing run request in Playwright backend...", "info");

    const activeToken = await getFreshToken();
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }
      // Build a clean dictionary/key-value record of env variables
      const envDict = envVars.reduce((acc, curr) => {
        const k = String(curr?.key || "").trim();
        if (k) {
          acc[k] = curr.value;
        }
        return acc;
      }, {} as Record<string, string>);

      const res = await fetch("/api/run", {
        method: "POST",
        headers,
        body: JSON.stringify({
          code: codeToRun,
          files: filesToRun,
          scriptId: scriptIdToRun || "playground",
          scriptName: scriptNameToRun || "Playground Run",
          env: envDict,
          activeWorkspaceId: activeWorkspaceId,
          timeout: scriptTimeout,
          skipCaptcha,
          binarizeCaptcha,
          useGeminiCaptcha,
          recordSession,
          isDebuggerMode,
          viewportWidth,
          viewportHeight,
          breakpoints: breakpointsMuted ? [] : (breakpoints[activeFileName] || [])
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to launch runner");
      }

      const { runId } = await res.json();
      setRunId(runId);
      setStatus("running");

      // Establish Server-Sent Events (SSE) Stream
      const streamUrl = `/api/stream-run/${runId}`;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.addEventListener("log", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          // Auto route terminal style types
          let type: TerminalLine["type"] = "log";
          if (data.message.startsWith("Launch:")) type = "info";
          else if (data.message.startsWith("Execution:")) type = "info";
          else if (data.message.startsWith("Stop:")) type = "warning";
          else if (data.message.startsWith("ERROR:")) type = "error";
          else if (data.message.startsWith("Page Console")) type = "log";
          
          if (data.message.startsWith("Break: Execution paused by user breakpoint")) {
            const match = data.message.match(/Line (\d+)/);
            if (match) {
              const lineNum = parseInt(match[1], 10);
              setActiveBreakpointLine(lineNum);
              setIsPausedOnBackend(true);
            }
          }
          
          addTerminalLine(data.message, type);
        } catch (err) {}
      });

      es.addEventListener("preview", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          setPreviewImage(data.image);
        } catch (err) {}
      });

      es.addEventListener("choice_prompt", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          setPendingChoice(data);
          setSelectedIndexes(data.options.map((o: any) => o.index));
          addTerminalLine(`Choice Prompt: Detected ${data.options.length} elements for selector "${data.options[0]?.selector}". Please select items to continue.`, "info");
        } catch (err) {}
      });

      es.addEventListener("artifact", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          const artifact: Artifact = {
            ...data.artifact,
            timestamp: new Date().toLocaleTimeString()
          };
          setArtifacts(prev => {
            // Replace existing matching url with the updated artifact, otherwise append
            const filtered = prev.filter(a => a.url !== artifact.url);
            return [...filtered, artifact];
          });
          addTerminalLine(`Artifact detected: ${artifact.name} (${artifact.type.toUpperCase()})`, "success");
          
          // Auto switch tab content based on artifact type
          if (artifact.type === "screenshot" || artifact.type === "pdf" || artifact.type === "excel") {
            setActiveTab("assets");
          }
        } catch (err) {}
      });

      es.addEventListener("network", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          setNetworkLogs(prev => {
            if (data.type === "request") {
              const exists = prev.some(item => item.id === data.id);
              if (exists) return prev;
              return [...prev, {
                id: data.id,
                method: data.method,
                url: data.url,
                resourceType: data.resourceType,
                timestamp: data.timestamp,
                status: undefined,
                statusText: undefined,
                duration: undefined
              }];
            } else if (data.type === "response") {
              return prev.map(item => {
                if (item.id === data.id) {
                  return {
                    ...item,
                    status: data.status,
                    statusText: data.statusText,
                    duration: data.duration,
                    headers: data.headers,
                    body: data.body
                  };
                }
                return item;
              });
            }
            return prev;
          });
        } catch (err) {}
      });

      es.addEventListener("cookies", (event: any) => {
        try {
          const cookiesList = JSON.parse(event.data);
          setBrowserCookies(cookiesList);
        } catch (err) {}
      });

      es.addEventListener("done", (event: any) => {
        try {
          const data = JSON.parse(event.data);
          if (data.success) {
            addTerminalLine("=============================================", "success");
            addTerminalLine("Execution Completed successfully!", "success");
            if (data.result !== undefined) {
              addTerminalLine(`Returned Value: ${JSON.stringify(data.result, null, 2)}`, "success");
            }
            setStatus("completed");
          } else {
            addTerminalLine("=============================================", "error");
            addTerminalLine(`Execution Stopped with Error: ${data.error}`, "error");
            setStatus("error");
          }
        } catch (err) {}
        es.close();
        loadRunHistory();
        loadArtifacts();
      });

      es.addEventListener("error", (event: any) => {
        addTerminalLine("Connection dropped or script timed out.", "error");
        setStatus("error");
        es.close();
        loadArtifacts();
      });

    } catch (err: any) {
      addTerminalLine(`Failed to initialize: ${err.message}`, "error");
      setStatus("error");
    }
  };

  const handleStopScript = async () => {
    if (!runId || (status !== "running" && status !== "connecting")) return;
    
    addTerminalLine("Sending cancel request to Playwright session...", "warning");
    try {
      await fetch(`/api/run/${runId}/stop`, { method: "POST" });
      setStatus("stopped");
      setActiveBreakpointLine(null);
      setIsPausedOnBackend(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    } catch (e) {
      addTerminalLine("Error sending stop instruction.", "error");
    }
  };

  const handleSubmitChoice = async () => {
    if (!runId) return;
    setSubmittingChoice(true);
    try {
      const res = await fetch(`/api/run/${runId}/submit-choice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIndexes })
      });
      if (res.ok) {
        setPendingChoice(null);
        setSelectedIndexes([]);
      } else {
        const data = await res.json();
        addTerminalLine(`ERROR submitting element choices: ${data.error}`, "error");
      }
    } catch (err: any) {
      addTerminalLine(`ERROR submitting element choices: ${err.message}`, "error");
    } finally {
      setSubmittingChoice(false);
    }
  };

  const handleSendText = async (text: string) => {
    if (!runId || status !== "running") return;
    try {
      await fetch(`/api/run/${runId}/type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      addTerminalLine(`Virtual Input: Sent text "${text}"`, "info");
    } catch (e) {
      addTerminalLine("Failed to transmit text input", "error");
    }
  };

  const handleSendKey = async (key: string) => {
    if (!runId || status !== "running") return;
    try {
      await fetch(`/api/run/${runId}/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      addTerminalLine(`Virtual Input: Sent key press [${key}]`, "info");
    } catch (e) {
      addTerminalLine("Failed to transmit key press", "error");
    }
  };

  const handlePauseScript = async () => {
    if (!runId || status !== "running") return;
    addTerminalLine("Sending suspension pause instruction to runner...", "warning");
    try {
      await fetch(`/api/run/${runId}/pause`, { method: "POST" });
      setIsPausedOnBackend(true);
    } catch (e) {
      addTerminalLine("Failed to pause execution.", "error");
    }
  };

  const handleResumeScript = async () => {
    if (!runId || status !== "running") return;
    addTerminalLine("Sending resume instruction to runner...", "info");
    try {
      await fetch(`/api/run/${runId}/resume`, { method: "POST" });
      setIsPausedOnBackend(false);
      setActiveBreakpointLine(null);
    } catch (e) {
      addTerminalLine("Failed to resume execution.", "error");
    }
  };

  const handleViewportClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (status !== "running" || !runId || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const relativeX = clickX / rect.width;
    const relativeY = clickY / rect.height;

    const absoluteX = Math.round(relativeX * viewportWidth);
    const absoluteY = Math.round(relativeY * viewportHeight);

    addTerminalLine(`Virtual Input: Scaled click at coordinate X: ${absoluteX}, Y: ${absoluteY}`, "info");

    const xPct = relativeX * 100;
    const yPct = relativeY * 100;
    setClickIndicator({ x: xPct, y: yPct });
    setTimeout(() => setClickIndicator(null), 800);

    try {
      await fetch(`/api/run/${runId}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: absoluteX, y: absoluteY })
      });
    } catch (err) {
      addTerminalLine("Failed to transmit virtual human click input", "error");
    }
  };

  // Poll backend pause status during script execution runs
  useEffect(() => {
    if (!runId || status !== "running") {
      setIsPausedOnBackend(false);
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/run/${runId}/pause-status`);
        if (res.ok) {
          const data = await res.json();
          setIsPausedOnBackend(!!data.isPaused);
        }
      } catch (err) {}
    }, 1000);
    return () => clearInterval(interval);
  }, [runId, status]);

  // Assign the ref handlers so the global keydown listeners access the latest closure context
  runScriptRef.current = handleRunScript;
  saveScriptRef.current = handleSaveScript;

  const handleRunSpecificScript = async (script: SavedScript) => {
    // 1. Load the script in the editor first
    handleLoadScript(script);

    // 2. Extract code and files to run immediately
    const files = script.files && script.files.length > 0
      ? script.files
      : [{ name: "main.js", code: script.code }];
    const mainFile = files.find(f => f.name === "main.js") || files[0];

    // 3. Trigger the run immediately with parameter overrides
    await handleRunScript(true, mainFile.code, files, script.id || null, script.name);
  };

  const handleRunSpecificTemplate = async (tpl: ScriptTemplate) => {
    // 1. Load/select the template
    handleSelectTemplate(tpl);

    // 2. Templates only contain a single main.js file
    const files = [{ name: "main.js", code: tpl.code }];

    // 3. Trigger the run immediately with parameter overrides
    await handleRunScript(true, tpl.code, files, tpl.id || null, tpl.name);
  };

  const handleRunSpecificFile = async (fileName: string) => {
    // 1. Find the file in workspace files
    const file = workspaceFiles.find(f => f.name === fileName);
    if (!file) return;

    // 2. Switch to that file in the editor so editor/UI updates
    handleSwitchFile(fileName);

    // 3. Run the specific file with its code as override code, while passing current workspaceFiles
    await handleRunScript(true, file.code, workspaceFiles, activeScriptId, `${scriptName || "Project"} - ${fileName}`);
  };

  const handleClearArtifacts = async (type: string = "all") => {
    setClearType(type);
    setShowClearConfirm(true);
  };

  const executeClearArtifacts = async () => {
    setClearing(true);
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }
      const res = await fetch("/api/artifacts/clear", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: clearType,
          scriptId: activeScriptId || undefined
        }),
      });
      if (res.ok) {
        if (clearType === "outputs" || clearType === "screenshot") {
          setPreviewImage(null);
        }
        await loadArtifacts();
        
        const label = clearType === "outputs" ? "Output Files (Screenshots, PDFs, Excel, Videos)"
          : clearType === "inputs" || clearType === "upload" ? "Input Files (Uploads)"
          : clearType === "screenshot" ? "Screenshots"
          : clearType === "pdf" ? "PDFs"
          : clearType === "excel" ? "Excel sheets"
          : clearType === "video" ? "Recordings"
          : "All Workspace Assets";
        addTerminalLine(`Disk Cleanup: ${label} cleared successfully for current workspace.`, "info");
      } else {
        addTerminalLine(`Failed to clear assets: server returned ${res.status}`, "error");
      }
    } catch (e) {
      addTerminalLine("Failed to clear disk files.", "error");
    } finally {
      setClearing(false);
    }
  };

  const handleSaveAllAssets = async (subTab: string = "all") => {
    const targetArtifacts = subTab === "all" 
      ? artifacts 
      : artifacts.filter(art => art.type === subTab);

    if (targetArtifacts.length === 0) {
      const typeLabel = subTab === "all" ? "workspace" : `${subTab}s`;
      addTerminalLine(`Assets: No ${typeLabel} are available to save.`, "warning");
      return;
    }
    setIsSavingAll(true);
    try {
      const typeLabel = subTab === "all" ? "all" : `${subTab}s`;
      addTerminalLine(`Assets: Generating single ZIP collection containing all ${targetArtifacts.length} ${typeLabel} file assets...`, "info");
      const zip = new JSZip();
      
      for (let i = 0; i < targetArtifacts.length; i++) {
        const art = targetArtifacts[i];
        try {
          // Append ?download=true to force correct decrypted files response from server
          const downloadUrl = `${art.url}?download=true`;
          const res = await fetch(downloadUrl);
          if (!res.ok) {
            throw new Error(`Server returned HTTP code ${res.status}`);
          }
          const blob = await res.blob();
          // Keep flat based on art.name
          zip.file(art.name, blob);
        } catch (fileErr: any) {
          addTerminalLine(`Assets: Failed to package "${art.name}": ${fileErr.message}`, "error");
        }
      }
      
      addTerminalLine("Assets: Compressing files into zip structure on client...", "info");
      const content = await zip.generateAsync({ type: "blob" });
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      const filename = subTab === "all" ? "all-assets.zip" : `${subTab}-assets.zip`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      addTerminalLine(`Assets: Successfully compressed and downloaded ${filename}!`, "success");
    } catch (e: any) {
      addTerminalLine(`Assets: Error packaging files to ZIP: ${e.message}`, "error");
    } finally {
      setIsSavingAll(false);
    }
  };

  const handlePreviewExcel = async (artName: string) => {
    setViewerExcelLoading(true);
    setViewerTitle(artName);
    try {
      const res = await fetch(`/api/excel/parse/${encodeURIComponent(artName)}`);
      if (res.ok) {
        const data = await res.json();
        setViewerExcel({ name: artName, sheets: data.sheets });
      } else {
        addTerminalLine(`Failed to parse Excel/CSV preview: ${artName}`, "error");
      }
    } catch (err) {
      console.error("Failed to parse Excel", err);
      addTerminalLine(`Error previewing Excel/CSV file: ${artName}`, "error");
    } finally {
      setViewerExcelLoading(false);
    }
  };

  // Determine current logs & status color
  const getStatusColor = () => {
    switch (status) {
      case "connecting": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "running": return "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse";
      case "completed": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "error": return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      case "stopped": return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
      default: return "bg-zinc-800 text-zinc-400 border-zinc-700/50";
    }
  };

  const activeSettingsCount = (skipCaptcha ? 1 : 0) + (binarizeCaptcha ? 1 : 0) + (useGeminiCaptcha ? 1 : 0) + (recordSession ? 1 : 0) + (isDebuggerMode ? 1 : 0);

  return (
    <div className={`h-screen flex flex-col bg-[#0d1117] text-[#c9d1d9] font-sans overflow-hidden ${(isFullscreenEditor || isFullscreenPreview) ? "p-0 gap-0" : "pt-1.5 sm:pt-2 px-1.5 sm:px-2 pb-1.5 sm:pb-2 gap-1.5 sm:gap-2"}`} id="app-root">
      
      {/* Top Header Navigation */}
      {!isFullscreenEditor && !isFullscreenPreview && (
      <header className="flex flex-col md:flex-row h-auto md:h-12 border border-[#30363d] rounded-lg items-stretch md:items-center justify-between px-3 sm:px-4 bg-[#161b22] shrink-0 py-2.5 md:py-0 gap-2.5 md:gap-0" id="header-nav">
        <div className="flex items-center justify-between md:justify-start gap-1.5 sm:gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Mobile sidebar trigger */}
            <button 
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              className="md:hidden p-1.5 bg-[#21262d] border border-[#30363d] rounded text-[#8b949e] hover:text-white"
              title="Toggle Sidebar Menu"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            
            <div className="w-5 h-5 sm:w-6 sm:h-6 bg-[#0c0c0e] border border-zinc-800 rounded flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 128 128">
                <defs>
                  <linearGradient id="app-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                </defs>
                <circle cx="64" cy="64" r="32" fill="none" stroke="url(#app-grad)" strokeWidth="8" opacity="0.8"/>
                <circle cx="64" cy="64" r="16" fill="#ef4444" />
                <path d="M 44 64 L 54 64" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round"/>
                <path d="M 74 64 L 84 64" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-sm font-semibold tracking-tight text-white shrink-0">
                ScriptBench
              </h1>
              
              <div className="relative flex items-center">
                <span className="hidden xs:inline text-xs text-[#30363d] mx-1 sm:mx-1.5">/</span>
                
                {/* Active Workspace / Project Selector Trigger Button */}
                <button
                  onClick={() => setShowProjectDropdown(prev => !prev)}
                  className="px-2.5 py-1 bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] rounded text-xs text-white flex items-center gap-1.5 transition-all cursor-pointer font-medium max-w-[150px] sm:max-w-[200px]"
                  title="Switch between project workspaces"
                >
                  <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{scriptName || "untitled"}</span>
                  <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
                </button>

                <AnimatePresence>
                  {showProjectDropdown && (
                    <motion.div
                      key="project-dropdown-container"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {/* Click outside backdrop */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowProjectDropdown(false)} />
                      
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-1.5 w-64 sm:w-72 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl z-50 overflow-hidden font-sans flex flex-col max-h-[420px]"
                      >
                        {/* Dropdown Header & New Project Button */}
                        <div className="p-2.5 border-b border-[#30363d] bg-[#0d1117] flex items-center justify-between shrink-0">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                            <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
                            Projects ({scripts.length})
                          </span>
                          <button
                            onClick={() => {
                              setNewProjectNameInput("");
                              setShowCreateProjectModal(true);
                              setShowProjectDropdown(false);
                            }}
                            className="text-[10.5px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer flex items-center gap-1 hover:bg-blue-500/10 px-2 py-1 rounded transition"
                          >
                            <Plus className="h-3 w-3" /> New
                          </button>
                        </div>

                        {/* Search project input inside dropdown */}
                        <div className="p-2 border-b border-[#30363d] bg-[#161b22] shrink-0">
                          <input
                            type="text"
                            placeholder="Filter projects..."
                            value={scriptSearchQuery}
                            onChange={(e) => setScriptSearchQuery(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        {/* List of Projects (Scrollable) */}
                        <div className="flex-grow overflow-y-auto p-2 space-y-3.5 bg-[#0d1117]">
                          
                          {/* My Projects */}
                          <div>
                            {(() => {
                              const myScripts = scripts.filter(s => s.ownerId === user?.uid && s.name.toLowerCase().includes(scriptSearchQuery.toLowerCase()));
                              const totalMine = scripts.filter(s => s.ownerId === user?.uid).length;
                              return (
                                <>
                                  <div className="text-[9px] font-bold text-zinc-500 uppercase px-1.5 mb-1.5 flex justify-between">
                                    <span>My Projects ({myScripts.length})</span>
                                    {!user && <span className="text-amber-500 normal-case font-normal">Sign in to save</span>}
                                  </div>
                                  {myScripts.length === 0 ? (
                                    <p className="text-[10px] text-zinc-500 italic px-1.5 py-1 text-center">No projects saved yet</p>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {myScripts.map((s, idx) => {
                                        const isCurrent = activeScriptId === s.id;
                                        return (
                                          <div
                                            key={`workspace-mine-${s.id}-${idx}`}
                                            onClick={() => {
                                              handleLoadScript(s);
                                              setShowProjectDropdown(false);
                                            }}
                                            className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs transition cursor-pointer ${
                                              isCurrent 
                                                ? "bg-blue-500/15 text-blue-400 font-medium" 
                                                : "text-zinc-400 hover:bg-[#161b22] hover:text-white"
                                            }`}
                                          >
                                            <span className="truncate pr-2 flex-grow">{s.name}</span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleRunSpecificScript(s);
                                                  setShowProjectDropdown(false);
                                                }}
                                                title="Run project script immediately"
                                                className="text-zinc-500 hover:text-blue-400 p-0.5 opacity-0 group-hover:opacity-100 transition"
                                              >
                                                <Play className="h-3.5 w-3.5 fill-current" />
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteScript(s, e);
                                                }}
                                                title="Delete project"
                                                className="text-zinc-500 hover:text-rose-400 p-0.5 opacity-0 group-hover:opacity-100 transition"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          {/* Shared Projects */}
                          <div>
                            {(() => {
                              const sharedScripts = scripts.filter(s => s.ownerId !== user?.uid && s.name.toLowerCase().includes(scriptSearchQuery.toLowerCase()));
                              return (
                                <>
                                  <div className="text-[9px] font-bold text-zinc-500 uppercase px-1.5 mb-1.5">
                                    Shared Projects ({sharedScripts.length})
                                  </div>
                                  {sharedScripts.length === 0 ? (
                                    <p className="text-[10px] text-zinc-500 italic px-1.5 py-1 text-center">No shared projects</p>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {sharedScripts.map((s, idx) => {
                                        const isCurrent = activeScriptId === s.id;
                                        return (
                                          <div
                                            key={`workspace-shared-${s.id}-${idx}`}
                                            onClick={() => {
                                              handleLoadScript(s);
                                              setShowProjectDropdown(false);
                                            }}
                                            className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs transition cursor-pointer ${
                                              isCurrent 
                                                ? "bg-emerald-500/15 text-emerald-400 font-medium" 
                                                : "text-zinc-400 hover:bg-[#161b22] hover:text-white"
                                            }`}
                                          >
                                            <div className="flex flex-col min-w-0 flex-1">
                                              <span className="truncate font-medium">{s.name}</span>
                                              <span className="text-[8.5px] text-zinc-500 truncate mt-0.5">{s.ownerEmail?.split("@")[0]}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleRunSpecificScript(s);
                                                  setShowProjectDropdown(false);
                                                }}
                                                title="Run project script immediately"
                                                className="text-zinc-500 hover:text-emerald-400 p-0.5 opacity-0 group-hover:opacity-100 transition"
                                              >
                                                <Play className="h-3.5 w-3.5 fill-current" />
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleMakeCopy(s);
                                                }}
                                                title="Clone project"
                                                className="text-zinc-500 hover:text-blue-400 p-0.5 opacity-0 group-hover:opacity-100 transition shrink-0"
                                              >
                                                <Copy className="h-3 w-3" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>

                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* User Sign-In/Profile controls (visible ONLY on mobile in Row 1) */}
          <div className="md:hidden flex items-center gap-1.5 shrink-0">
            {!user ? (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  className="px-2 py-1 bg-[#1f2937] hover:bg-[#374151] text-[10px] font-semibold rounded border border-[#4b5563] text-white flex items-center gap-1 transition-colors cursor-pointer h-7 whitespace-nowrap"
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.75 12.27c0-.83-.07-1.63-.2-2.4H12v4.51h6.6c-.29 1.48-1.11 2.73-2.34 3.56v2.9h3.77c2.2-2.03 3.48-5.02 3.48-8.57z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.77-2.9c-1.05.7-2.4 1.1-4.16 1.1-3.2 0-5.9-2.16-6.87-5.07H1.36v3c2 3.97 6.11 6.78 10.64 6.78z"/>
                    <path fill="#FBBC05" d="M5.13 14.22c-.25-.7-.38-1.46-.38-2.22s.13-1.51.38-2.22V6.78H1.36C.5 8.5.01 10.2.01 12s.49 3.5 1.35 5.22l3.77-3z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.46 0 3.35 2.81 1.36 6.78l3.77 3c.97-2.91 3.67-5.03 6.87-5.03z"/>
                  </svg>
                  <span>Google</span>
                </button>
                <button
                  onClick={() => {
                    setLoginError(null);
                    setShowLoginModal(true);
                  }}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-[10px] font-semibold rounded border border-blue-500 text-white flex items-center gap-1 transition-colors cursor-pointer h-7 whitespace-nowrap"
                >
                  <Users className="h-3 w-3 shrink-0" />
                  <span>Admin Login</span>
                </button>
              </>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="flex items-center gap-1.5 p-1 hover:bg-[#21262d] rounded-lg transition-colors cursor-pointer select-none text-left"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "Avatar"}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full border border-blue-500 shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0">
                      {(user.displayName || user.email || "?").charAt(0)}
                    </div>
                  )}
                  <span className="text-[10px] text-[#c9d1d9] font-medium truncate max-w-[60px] xs:max-w-[80px]">
                    {user.displayName || user.email?.split("@")[0]}
                  </span>
                  <span className="text-[8px] text-[#8b949e]">▼</span>
                </button>

                {showProfileDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                    <div className="absolute right-0 mt-1.5 w-48 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl py-1 z-50 font-sans text-xs">
                      <div className="px-3 py-2 border-b border-[#30363d] text-zinc-400 select-none">
                        <p className="font-semibold text-white text-[10.5px] truncate">{user.displayName || "Akun Saya"}</p>
                        <p className="text-[9.5px] text-[#8b949e] truncate mt-0.5">{user.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileDropdown(false);
                          setShowGeminiModal(true);
                        }}
                        className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-[#21262d] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Settings className="h-3.5 w-3.5 text-amber-400" />
                        <span>Gemini API Settings</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowProfileDropdown(false);
                          handleSignOut();
                        }}
                        className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-[#21262d] hover:text-rose-300 flex items-center gap-2 transition-colors border-t border-[#30363d]/50 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-1.5 sm:gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 md:flex-initial">
            {status === "running" || status === "connecting" ? (
              <button
                onClick={handleStopScript}
                className="flex-initial shrink-0 px-2 sm:px-3 py-1 bg-[#da3633] hover:bg-[#f85149] text-white text-xs font-semibold rounded flex items-center justify-center gap-1 transition-colors cursor-pointer h-7"
              >
                <Square className="h-3 w-3 fill-current" />
                <span className="hidden sm:inline">Stop Script</span>
                <span className="sm:hidden">Stop</span>
              </button>
            ) : (
              <button
                onClick={() => handleRunScript()}
                className="flex-initial shrink-0 px-2 sm:px-3 py-1 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold rounded flex items-center justify-center gap-1 transition-colors cursor-pointer h-7"
              >
                <Play className="h-3 w-3 fill-current" strokeWidth={3} />
                <span className="hidden sm:inline">Run Script</span>
                <span className="sm:hidden">Run</span>
              </button>
            )}

            {/* Quick Search Button */}
            <button
              onClick={() => {
                setSidebarTab("search");
                if (isSidebarCollapsed) toggleSidebarCollapsed();
              }}
              className="h-7 px-2 sm:px-2.5 border border-[#30363d] rounded text-[10.5px] font-semibold flex items-center gap-1.5 bg-[#161b22] text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9] transition-all cursor-pointer select-none shrink-0"
              title="Search text across project files (Ctrl+Shift+F)"
            >
              <Search className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Search</span>
            </button>

            {/* Elegant Execution Settings Dropdown */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowConfigDropdown(!showConfigDropdown)}
                className={`h-7 px-2.5 border rounded text-[10.5px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                  showConfigDropdown
                    ? "bg-[#21262d] border-[#58a6ff] text-white"
                    : activeSettingsCount > 0
                      ? "bg-blue-950/20 border-blue-500/50 text-blue-400 hover:bg-blue-950/35 hover:border-blue-400 animate-pulse"
                      : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]"
                }`}
                title="Configure advanced Playwright execution & stealth options"
              >
                <Settings className={`w-3.5 h-3.5 transition-transform ${showConfigDropdown ? "rotate-45 text-blue-400" : "text-zinc-400"}`} />
                <span>Options</span>
                {activeSettingsCount > 0 && (
                  <span className="flex items-center justify-center h-4 min-w-[16px] px-1 text-[9px] font-bold bg-blue-500 text-white rounded-full">
                    {activeSettingsCount}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${showConfigDropdown ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showConfigDropdown && (
                  <motion.div
                    key="config-dropdown-container"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="fixed inset-0 z-40" onClick={() => setShowConfigDropdown(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1.5 w-72 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl p-4 z-50 font-sans space-y-3.5 text-left"
                    >
                      <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
                        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                          <Sliders className="h-3.5 w-3.5 text-blue-400" />
                          Execution Settings
                        </span>
                        {activeSettingsCount > 0 && (
                          <button
                            onClick={() => {
                              setSkipCaptcha(false);
                              setBinarizeCaptcha(false);
                              setUseGeminiCaptcha(false);
                              setRecordSession(false);
                              setIsDebuggerMode(false);
                              setScriptTimeout(60);
                              localStorage.setItem("playwright_skip_captcha", "false");
                              localStorage.setItem("playwright_binarize_captcha", "false");
                              localStorage.setItem("playwright_use_gemini_captcha", "false");
                              localStorage.setItem("playwright_record_session", "false");
                              localStorage.setItem("playwright_debugger_mode", "false");
                              localStorage.setItem("playwright_script_timeout", "60");
                              addTerminalLine("Execution: All script parameters reset to defaults.", "info");
                            }}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 font-medium cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      {/* Script Limit (Timeout Selector) inside dropdown */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                            Execution Limit
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">{scriptTimeout}s</span>
                        </div>
                        <select
                          value={scriptTimeout}
                          onChange={(e) => {
                            const sec = parseInt(e.target.value, 10);
                            setScriptTimeout(sec);
                            localStorage.setItem("playwright_script_timeout", sec.toString());
                            addTerminalLine(`Execution: Script limit updated to ${sec}s`, "info");
                          }}
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        >
                          <option value="15">15 seconds (Fast Test)</option>
                          <option value="30">30 seconds (Standard)</option>
                          <option value="60">60 seconds (Recommended)</option>
                          <option value="120">2 minutes (Long Run)</option>
                          <option value="300">5 minutes (Extended)</option>
                          <option value="600">10 minutes (Maximum)</option>
                        </select>
                      </div>

                      {/* Separator */}
                      <div className="border-t border-[#30363d]/50 my-1" />

                      {/* Advanced options with descriptions */}
                      <div className="space-y-3">
                        {/* Stealth Toggle */}
                        <div 
                          onClick={() => {
                            const newVal = !skipCaptcha;
                            setSkipCaptcha(newVal);
                            localStorage.setItem("playwright_skip_captcha", newVal.toString());
                            addTerminalLine(`Execution: Captcha-bypass stealth mode ${newVal ? "enabled" : "disabled"}`, "info");
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors ${
                            skipCaptcha 
                              ? "bg-amber-950/15 border-amber-500/30 hover:bg-amber-950/25" 
                              : "bg-black/20 border-[#30363d]/50 hover:bg-[#21262d]/50"
                          }`}
                        >
                          <Zap className={`w-4 h-4 mt-0.5 shrink-0 ${skipCaptcha ? "text-amber-400 fill-amber-400/20" : "text-zinc-500"}`} />
                          <div className="flex-1 space-y-0.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${skipCaptcha ? "text-amber-400" : "text-zinc-300"}`}>Stealth Mode</span>
                              <span className={`w-1.5 h-1.5 rounded-full ${skipCaptcha ? "bg-amber-500 animate-pulse" : "bg-zinc-600"}`} />
                            </div>
                            <p className="text-[9.5px] text-[#8b949e] leading-relaxed">Emulate real Chromium fingerprints & headers.</p>
                          </div>
                        </div>

                        {/* Binarize Toggle */}
                        <div 
                          onClick={() => {
                            const newVal = !binarizeCaptcha;
                            setBinarizeCaptcha(newVal);
                            localStorage.setItem("playwright_binarize_captcha", newVal.toString());
                            addTerminalLine(`Execution: Captcha-bypass high-contrast OCR binarization ${newVal ? "enabled" : "disabled"}`, "info");
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors ${
                            binarizeCaptcha 
                              ? "bg-blue-950/15 border-blue-500/30 hover:bg-blue-950/25" 
                              : "bg-black/20 border-[#30363d]/50 hover:bg-[#21262d]/50"
                          }`}
                        >
                          <Contrast className={`w-4 h-4 mt-0.5 shrink-0 ${binarizeCaptcha ? "text-blue-400" : "text-zinc-500"}`} />
                          <div className="flex-1 space-y-0.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${binarizeCaptcha ? "text-blue-400" : "text-zinc-300"}`}>Binarize CAPTCHA</span>
                              <span className={`w-1.5 h-1.5 rounded-full ${binarizeCaptcha ? "bg-blue-500 animate-pulse" : "bg-zinc-600"}`} />
                            </div>
                            <p className="text-[9.5px] text-[#8b949e] leading-relaxed">Convert target CAPTCHAs to high-contrast black & white.</p>
                          </div>
                        </div>

                        {/* Gemini CAPTCHA Toggle */}
                        <div 
                          onClick={() => {
                            const newVal = !useGeminiCaptcha;
                            setUseGeminiCaptcha(newVal);
                            localStorage.setItem("playwright_use_gemini_captcha", newVal.toString());
                            addTerminalLine(`Execution: Gemini API CAPTCHA solver ${newVal ? "enabled" : "disabled"}`, "info");
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors ${
                            useGeminiCaptcha 
                              ? "bg-[#2d1b4e]/30 border-purple-500/30 hover:bg-[#2d1b4e]/45" 
                              : "bg-black/20 border-[#30363d]/50 hover:bg-[#21262d]/50"
                          }`}
                        >
                          <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${useGeminiCaptcha ? "text-purple-400" : "text-zinc-500"}`} />
                          <div className="flex-1 space-y-0.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${useGeminiCaptcha ? "text-purple-300" : "text-zinc-300"}`}>Gemini Solver</span>
                              <span className={`w-1.5 h-1.5 rounded-full ${useGeminiCaptcha ? "bg-purple-500 animate-pulse" : "bg-zinc-600"}`} />
                            </div>
                            <p className="text-[9.5px] text-[#8b949e] leading-relaxed">Use multimodal Gemini 3.5 Flash for image solutions.</p>
                          </div>
                        </div>

                        {/* Record Toggle */}
                        <div 
                          onClick={() => {
                            const newVal = !recordSession;
                            setRecordSession(newVal);
                            localStorage.setItem("playwright_record_session", newVal.toString());
                            addTerminalLine(`Execution: Session video recording ${newVal ? "enabled" : "disabled"}`, "info");
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors ${
                            recordSession 
                              ? "bg-purple-950/15 border-purple-500/30 hover:bg-purple-950/25" 
                              : "bg-black/20 border-[#30363d]/50 hover:bg-[#21262d]/50"
                          }`}
                        >
                          <Video className={`w-4 h-4 mt-0.5 shrink-0 ${recordSession ? "text-purple-400" : "text-zinc-500"}`} />
                          <div className="flex-1 space-y-0.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${recordSession ? "text-purple-400" : "text-zinc-300"}`}>Record Video</span>
                              <span className={`w-1.5 h-1.5 rounded-full ${recordSession ? "bg-purple-500 animate-pulse" : "bg-zinc-600"}`} />
                            </div>
                            <p className="text-[9.5px] text-[#8b949e] leading-relaxed">Capture full WebM video recordings of execution.</p>
                          </div>
                        </div>

                        {/* Debugger Toggle */}
                        <div 
                          onClick={() => {
                            const newVal = !isDebuggerMode;
                            setIsDebuggerMode(newVal);
                            localStorage.setItem("playwright_debugger_mode", newVal.toString());
                            addTerminalLine(`Execution: Debugger mode ${newVal ? "enabled" : "disabled"}. Slow-motion and breakpoints initialized.`, "info");
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors ${
                            isDebuggerMode 
                              ? "bg-amber-950/15 border-amber-500/30 hover:bg-amber-950/25" 
                              : "bg-black/20 border-[#30363d]/50 hover:bg-[#21262d]/50"
                          }`}
                        >
                          <HeartPulse className={`w-4 h-4 mt-0.5 shrink-0 ${isDebuggerMode ? "text-amber-400" : "text-zinc-500"}`} />
                          <div className="flex-1 space-y-0.5 text-left">
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-bold ${isDebuggerMode ? "text-amber-400" : "text-zinc-300"}`}>Debugger Mode</span>
                              <span className={`w-1.5 h-1.5 rounded-full ${isDebuggerMode ? "bg-amber-500 animate-pulse" : "bg-zinc-600"}`} />
                            </div>
                            <p className="text-[9.5px] text-[#8b949e] leading-relaxed">Slow-motion execution with breakpoint support.</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden sm:block w-px h-4 bg-[#30363d] mx-0.5 sm:mx-1 shrink-0" />

            <div className="relative flex items-center shrink-0">
              {/* Save Button */}
              <button
                onClick={() => handleSaveScript()}
                disabled={savingScript}
                className={`px-2 sm:px-3 py-1 text-xs font-semibold rounded-l border text-[#c9d1d9] flex items-center gap-1.5 transition-colors cursor-pointer border-r-0 h-7 shrink-0 disabled:opacity-50 select-none relative ${
                  hasUnsavedChanges 
                    ? "bg-[#85530b]/20 hover:bg-[#85530b]/30 border-amber-500/50 text-amber-300 hover:text-amber-200" 
                    : "bg-[#21262d] hover:bg-[#30363d] border-[#30363d] hover:text-white"
                }`}
                title={hasUnsavedChanges ? "Contains unsaved modifications - Click to save to Cloud DB" : "Saved & synchronized to cloud database"}
              >
                {savingScript ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />
                ) : (
                  <Save className={`h-3.5 w-3.5 shrink-0 transition-colors ${hasUnsavedChanges ? "text-amber-450" : "text-zinc-400 opacity-80"}`} />
                )}
                <span className="hidden xs:inline">{savingScript ? "Saving..." : "Save"}</span>
                {hasUnsavedChanges && !savingScript && (
                  <span className="absolute top-1 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                )}
              </button>
              
              {/* Snapshots Dropdown Trigger */}
              <button
                onClick={() => setShowVersionsDropdown(prev => !prev)}
                className="px-1.5 py-1 bg-[#21262d] hover:bg-[#30363d] rounded-r border border-[#30363d] text-[#c9d1d9] flex items-center justify-center transition-colors cursor-pointer h-7 shrink-0 hover:text-white"
                title="View & restore previous script version snapshots"
                id="versions-dropdown-trigger"
              >
                <ChevronDown className="h-4 w-4 shrink-0" />
              </button>

              {/* Snapshots / Versions Dropdown Menu */}
              <AnimatePresence>
                {showVersionsDropdown && (
                  <motion.div
                    key="versions-dropdown-menu"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-64 max-h-80 bg-[#161b22] border border-[#30363d] rounded-md shadow-2xl p-2.5 overflow-y-auto z-40 space-y-1.5 font-sans"
                    id="versions-dropdown-menu"
                  >
                    {/* Auto-Save option inside the Save layout dropdown */}
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className="flex items-center justify-between bg-black/40 border border-[#30363d] rounded-lg p-2 select-none"
                    >
                      <span className="text-[10.5px] text-zinc-300 font-semibold flex items-center gap-1.5">
                        <Zap className={`h-3.5 w-3.5 ${autoSaveEnabled ? "text-emerald-400 fill-emerald-400/15" : "text-zinc-500"}`} />
                        Auto-Save updates
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoSaveEnabled}
                          onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-zinc-750 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500" />
                      </label>
                    </div>

                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold px-1 select-none flex items-center justify-between pt-1 pb-1 border-b border-[#30363d]">
                      <span>Script Snapshots</span>
                      <span className="text-[9px] text-zinc-650 font-normal">{versions.length} versions</span>
                    </div>

                    {versions.length === 0 ? (
                      <div className="text-[10px] text-zinc-500 italic p-4 text-center select-none">
                        No snapshots available. Snapshots are created automatically when you save.
                      </div>
                    ) : (
                      <div className="space-y-1 pt-1.5">
                        {versions.map((ver, idx) => (
                          <div
                            key={`snapshot-ver-${ver.versionId || 'no-id'}-${idx}`}
                            className="w-full text-left p-2 rounded bg-black/20 hover:bg-zinc-800/60 border border-transparent hover:border-[#30363d] transition space-y-1 block select-none"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10.5px] font-mono text-blue-400 font-semibold truncate max-w-[100px]">
                                v-{ver.versionId}
                              </span>
                              <span className="text-[9px] text-zinc-550 font-mono">
                                {new Date(ver.updatedAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-zinc-300 font-medium truncate">
                              {ver.name}
                            </div>
                            <div className="text-[9px] text-zinc-550 font-mono truncate">
                              {ver.code.substring(0, 32).trim()}...
                            </div>
                            <div className="flex items-center gap-1.5 pt-1.5 border-t border-zinc-800/40 mt-1 justify-end">
                              <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setCompareSnapshot(ver);
                                   setShowVersionsDropdown(false);
                                 }}
                                 className="text-[9px] px-1.5 py-0.5 bg-blue-950 hover:bg-blue-900 border border-blue-800 hover:border-blue-700 text-blue-300 rounded font-semibold transition cursor-pointer"
                                 title="Compare code differences side-by-side"
                              >
                                Compare ⇄
                              </button>
                              <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setCurrentCode(ver.code);
                                   addTerminalLine(`Restored from snapshot version [v-${ver.versionId}] saved at ${new Date(ver.updatedAt).toLocaleString()}`, "warning");
                                   setShowVersionsDropdown(false);
                                 }}
                                 className="text-[9px] px-1.5 py-0.5 bg-amber-950 hover:bg-amber-900 border border-amber-800 hover:border-amber-700 text-amber-300 rounded font-semibold transition cursor-pointer"
                                 title="Restore code to active workspace"
                              >
                                Restore ↩
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Share Button (Active universally) */}
            <button
              onClick={() => {
                if (!activeScriptId) {
                  addTerminalLine("Notice: You can draft emails immediately, but to get a stable URL link, please save the project first.", "warning");
                }
                setShowShareModal(true);
              }}
              className="px-2 sm:px-3 py-1 bg-[#1f6feb] text-white text-xs font-semibold rounded flex items-center justify-center gap-1 transition-all outline-none cursor-pointer hover:bg-[#2ea043] h-7 shrink-0"
              title="Share this project via link or email"
            >
              <Share2 className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">Share</span>
            </button>

            {/* Download Project Button */}
            <button
              onClick={() => setShowDownloadModal(true)}
              className="px-2 sm:px-3 py-1 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold rounded flex items-center justify-center gap-1 transition-all outline-none cursor-pointer h-7 shrink-0"
              title="Download project files as ZIP archive"
            >
              <Download className="h-3.5 w-3.5 shrink-0 text-white" />
              <span className="hidden xs:inline">Download Project</span>
            </button>
          </div>

          {/* User Sign-In/Profile controls (visible ONLY on desktop in header-right) */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {!user ? (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  className="px-2.5 py-1 bg-[#1f2937] hover:bg-[#374151] text-xs font-medium rounded border border-[#4b5563] text-white flex items-center gap-1.5 transition-colors cursor-pointer h-7 whitespace-nowrap"
                >
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.75 12.27c0-.83-.07-1.63-.2-2.4H12v4.51h6.6c-.29 1.48-1.11 2.73-2.34 3.56v2.9h3.77c2.2-2.03 3.48-5.02 3.48-8.57z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.77-2.9c-1.05.7-2.4 1.1-4.16 1.1-3.2 0-5.9-2.16-6.87-5.07H1.36v3c2 3.97 6.11 6.78 10.64 6.78z"/>
                    <path fill="#FBBC05" d="M5.13 14.22c-.25-.7-.38-1.46-.38-2.22s.13-1.51.38-2.22V6.78H1.36C.5 8.5.01 10.2.01 12s.49 3.5 1.35 5.22l3.77-3z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.46 0 3.35 2.81 1.36 6.78l3.77 3c.97-2.91 3.67-5.03 6.87-5.03z"/>
                  </svg>
                  <span className="hidden sm:inline">Google Sign In</span>
                  <span className="inline sm:hidden">Sign In</span>
                </button>
                <button
                  onClick={() => {
                    setLoginError(null);
                    setShowLoginModal(true);
                  }}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-xs font-semibold rounded border border-blue-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer h-7 whitespace-nowrap"
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>Admin Login</span>
                </button>
              </>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="flex items-center gap-1.5 p-1 hover:bg-[#21262d] rounded-lg transition-colors cursor-pointer select-none text-left"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "Avatar"}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full border border-blue-500 shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0">
                      {(user.displayName || user.email || "?").charAt(0)}
                    </div>
                  )}
                  <span className="text-[10px] text-[#c9d1d9] font-medium hidden sm:inline truncate max-w-[80px]" title={user.email || ""}>
                    {user.displayName || user.email?.split("@")[0]}
                  </span>
                  <span className="text-[8px] text-[#8b949e]">▼</span>
                </button>

                {showProfileDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
                    <div className="absolute right-0 mt-1.5 w-48 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl py-1 z-50 font-sans text-xs">
                      <div className="px-3 py-2 border-b border-[#30363d] text-zinc-400 select-none">
                        <p className="font-semibold text-white text-[10.5px] truncate">{user.displayName || "Akun Saya"}</p>
                        <p className="text-[9.5px] text-[#8b949e] truncate mt-0.5">{user.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileDropdown(false);
                          setShowGeminiModal(true);
                        }}
                        className="w-full text-left px-3 py-1.5 text-zinc-200 hover:bg-[#21262d] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Settings className="h-3.5 w-3.5 text-amber-400" />
                        <span>Gemini API Settings</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowProfileDropdown(false);
                          handleSignOut();
                        }}
                        className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-[#21262d] hover:text-rose-300 flex items-center gap-2 transition-colors border-t border-[#30363d]/50 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      {/* Mobile view selector tabs (hidden on desktop) */}
      {!isFullscreenEditor && !isFullscreenPreview && (
      <div className="md:hidden flex h-10 border border-[#30363d] rounded-lg bg-[#161b22] shrink-0 text-xs font-medium overflow-x-auto whitespace-nowrap scrollbar-none" id="mobile-tabs-bar">
        <button 
          onClick={() => setMobileActiveView("editor")}
          className={`flex-grow min-w-[100px] shrink-0 flex items-center justify-center gap-1.5 border-r border-[#30363d] transition-all ${mobileActiveView === "editor" ? "bg-[#0d1117] text-white border-b-2 border-b-blue-500 font-semibold" : "text-[#8b949e]"}`}
        >
          <FileCode className="h-3.5 w-3.5" />
          Editor
        </button>
        <button 
          onClick={() => setMobileActiveView("preview")}
          className={`flex-grow min-w-[140px] shrink-0 flex items-center justify-center gap-1.5 border-r border-[#30363d] transition-all ${mobileActiveView === "preview" ? "bg-[#0d1117] text-white border-b-2 border-b-blue-500 font-semibold" : "text-[#8b949e]"}`}
        >
          <Eye className="h-3.5 w-3.5" />
          Browser ({activeTab === "preview" ? "Live" : "Assets"})
        </button>
        <button 
          onClick={() => setMobileActiveView("console")}
          className={`flex-grow min-w-[100px] shrink-0 flex items-center justify-center gap-1.5 transition-all ${mobileActiveView === "console" ? "bg-[#0d1117] text-white border-b-2 border-b-blue-500 font-semibold" : "text-[#8b949e]"}`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Console
        </button>
      </div>
      )}

      {/* Main Content Area */}
      <div 
        className={`flex-grow flex overflow-hidden relative ${
          isResizingSidebar || isResizingPreview ? "select-none cursor-col-resize" : 
          isResizingConsole ? "select-none cursor-row-resize" : ""
        }`} 
        id="workspace-layout"
      >
        {/* Mobile Sidebar Backdrop Overlay */}
        {showMobileSidebar && (
          <div 
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity" 
            onClick={() => setShowMobileSidebar(false)} 
          />
        )}
        
        {/* Sidebar: Script Library & Templates & Packages */}
        <aside 
          className={`bg-[#0d1117] flex shrink-0 md:relative md:top-0 md:bottom-0 overflow-hidden ${
            (isFullscreenEditor || isFullscreenPreview) ? "hidden" : "md:flex"
          } ${
            showMobileSidebar 
               ? "fixed inset-y-0 left-0 z-50 w-72 shadow-2xl border-r border-[#30363d] bg-[#0d1117] h-full" 
               : "hidden"
          } ${!showMobileSidebar ? "" : "w-72"}`} 
          style={!showMobileSidebar && !isFullscreenEditor && !isFullscreenPreview ? { 
            width: isSidebarCollapsed ? "44px" : `${sidebarWidth}px`, 
            minWidth: isSidebarCollapsed ? "44px" : `${sidebarWidth}px` 
          } : undefined}
          id="left-sidebar"
        >
          {/* 1. Unified Vertical Activity Bar */}
          <div className="w-[44px] shrink-0 flex flex-col items-center justify-between border-r border-[#30363d] bg-[#161b22] text-[#8b949e] h-full">
            <div className="flex flex-col items-center gap-1.5 py-3 w-full">
              {/* Tab: Scripts */}
              <button
                onClick={() => { setSidebarTab("scripts"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "scripts" && !isSidebarCollapsed ? "text-blue-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Script Library & Files"
              >
                <FileCode className="h-4.5 w-4.5" />
              </button>

              {/* Tab: Global Search */}
              <button
                onClick={() => { setSidebarTab("search"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "search" && !isSidebarCollapsed ? "text-blue-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Global Search in Project Files (Ctrl+Shift+F)"
              >
                <Search className="h-4.5 w-4.5" />
              </button>

              {/* Tab: Packages */}
              <button
                onClick={() => { setSidebarTab("packages"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "packages" && !isSidebarCollapsed ? "text-blue-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="NPM Packages"
              >
                <FolderOpen className="h-4.5 w-4.5" />
              </button>

              {/* Tab: Variables */}
              <button
                onClick={() => { setSidebarTab("variables"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "variables" && !isSidebarCollapsed ? "text-blue-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Environment Variables"
              >
                <Sliders className="h-4.5 w-4.5" />
              </button>

              {/* Tab: History */}
              <button
                onClick={() => { setSidebarTab("history"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "history" && !isSidebarCollapsed ? "text-blue-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Execution Runs History"
              >
                <Clock className="h-4.5 w-4.5" />
              </button>

              {/* Tab: AI Generator */}
              <button
                onClick={() => { setSidebarTab("ai"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-amber-400 hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "ai" && !isSidebarCollapsed ? "text-amber-400 bg-[#0d1117] border border-amber-500/20" : "text-zinc-400"
                }`}
                title="AI Generator"
              >
                <Sparkles className="h-4.5 w-4.5" />
              </button>

              {/* Tab: Schedules */}
              <button
                onClick={() => { setSidebarTab("schedules"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "schedules" && !isSidebarCollapsed ? "text-blue-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Schedules"
              >
                <Calendar className="h-4.5 w-4.5" />
              </button>

              {/* Tab: Breakpoints */}
              <button
                onClick={() => { setSidebarTab("breakpoints"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "breakpoints" && !isSidebarCollapsed ? "text-red-400 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Breakpoint Manager"
              >
                <Bug className="h-4.5 w-4.5" />
                {breakpoints.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                  </span>
                )}
              </button>

              {/* Tab: Extension */}
              <button
                onClick={() => { setSidebarTab("extension"); if (isSidebarCollapsed) toggleSidebarCollapsed(); }}
                className={`p-2 rounded-md hover:text-white hover:bg-[#30363d]/50 transition-colors cursor-pointer relative ${
                  sidebarTab === "extension" && !isSidebarCollapsed ? "text-purple-450 bg-[#0d1117] border border-[#30363d]" : "text-zinc-400"
                }`}
                title="Chrome Extension Recorder"
              >
                <Puzzle className="h-4.5 w-4.5" />
                <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-500 animate-pulse"></span>
                </span>
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 pb-3 w-full">
              {/* Close sidebar button on mobile */}
              {showMobileSidebar && (
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 hover:text-white text-zinc-400 transition-colors cursor-pointer"
                  title="Close menu drawer"
                >
                  ✕
                </button>
              )}

              {/* Toggle Sidebar Collapse */}
              {!showMobileSidebar && (
                <button
                  onClick={toggleSidebarCollapsed}
                  className="p-2 hover:text-white text-zinc-400 transition-colors cursor-pointer"
                  title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                  <ChevronRight className={`h-4.5 w-4.5 transition-transform duration-200 ${isSidebarCollapsed ? "" : "rotate-180"}`} />
                </button>
              )}
            </div>
          </div>

          {/* 2. Main Content Area of the active Tab (Visible only when NOT collapsed, or when on mobile) */}
          {(!isSidebarCollapsed || showMobileSidebar) && (
            <div className="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
              {sidebarTab === "search" ? (
                <SearchPanel
                  workspaceFiles={workspaceFiles}
                  activeFileName={activeFileName}
                  currentCode={currentCode}
                  handleSwitchFileAndJump={handleSwitchFileAndJump}
                  setWorkspaceFiles={setWorkspaceFiles}
                  setCurrentCode={setCurrentCode}
                  addTerminalLine={addTerminalLine}
                />
              ) : sidebarTab === "scripts" ? (
                <ScriptsPanel
                  scripts={scripts}
                  user={user}
                  activeScriptId={activeScriptId}
                  selectedTemplateId={selectedTemplateId}
                  scriptSearchQuery={scriptSearchQuery}
                  setScriptSearchQuery={setScriptSearchQuery}
                  handleSelectTemplate={handleSelectTemplate}
                  handleLoadScript={handleLoadScript}
                  handleDeleteScript={handleDeleteScript}
                  handleMakeCopy={handleMakeCopy}
                  setContextMenu={setContextMenu}
                  setScriptName={setScriptName}
                  setCurrentCode={setCurrentCode}
                  setOriginalName={setOriginalName}
                  setOriginalCode={setOriginalCode}
                  setSelectedTemplateId={setSelectedTemplateId}
                  setActiveScriptId={setActiveScriptId}
                  setIsPrivate={setIsPrivate}
                  addTerminalLine={addTerminalLine}
                  setShowMobileSidebar={setShowMobileSidebar}
                  workspaceFiles={workspaceFiles}
                  setWorkspaceFiles={setWorkspaceFiles}
                  activeFileName={activeFileName}
                  setActiveFileName={setActiveFileName}
                  handleSwitchFile={handleSwitchFile}
                  handleCreateFile={handleCreateFile}
                  handleRenameFile={handleRenameFile}
                  handleDeleteFile={handleDeleteFile}
                  handleRunSpecificTemplate={handleRunSpecificTemplate}
                  handleRunSpecificFile={handleRunSpecificFile}
                  onDownloadProject={() => setShowDownloadModal(true)}
                />
              ) : sidebarTab === "history" ? (
                <HistoryPanel
                  user={user}
                  loadingHistory={loadingHistory}
                  runHistory={runHistory}
                  setTerminalLines={setTerminalLines}
                  setArtifacts={setArtifacts}
                  addTerminalLine={addTerminalLine}
                />
              ) : sidebarTab === "variables" ? (
                <VariablesPanel
                  envWorkspaces={envWorkspaces}
                  activeWorkspaceId={activeWorkspaceId}
                  setActiveWorkspaceId={setActiveWorkspaceId}
                  setWorkspaceModalName={setWorkspaceModalName}
                  setWorkspaceModalMode={setWorkspaceModalMode}
                  setWorkspaceToDelete={setWorkspaceToDelete}
                  envVars={envVars}
                  setEnvVars={setEnvVars}
                  addTerminalLine={addTerminalLine}
                  handleSaveVariable={handleSaveVariable}
                  setEnvToRevoke={setEnvToRevoke}
                />
              ) : sidebarTab === "packages" ? (
                <PackagesPanel
                  diagnosticResult={diagnosticResult}
                  checkingDiagnostics={checkingDiagnostics}
                  fetchDiagnostics={fetchDiagnostics}
                  installingSysDeps={installingSysDeps}
                  handleInstallSysDeps={handleInstallSysDeps}
                  newPkgName={newPkgName}
                  setNewPkgName={setNewPkgName}
                  handleInstallPackage={handleInstallPackage}
                  installingPkg={installingPkg}
                  currentCode={currentCode}
                  installedDeps={installedDeps}
                  performInstallPackageByName={performInstallPackageByName}
                />
              ) : sidebarTab === "schedules" ? (
                <SchedulesPanel
                  user={user}
                  activeScriptId={activeScriptId}
                  activeScriptName={scriptName || "Playground"}
                  workspaceFiles={workspaceFiles}
                  scheduleTargetFile={scheduleTargetFile}
                  setScheduleTargetFile={setScheduleTargetFile}
                  schedules={schedules}
                  loadingSchedules={loadingSchedules}
                  scheduleType={scheduleType}
                  setScheduleType={setScheduleType}
                  scheduleDatetime={scheduleDatetime}
                  setScheduleDatetime={setScheduleDatetime}
                  scheduleInterval={scheduleInterval}
                  setScheduleInterval={setScheduleInterval}
                  scheduleViewportWidth={scheduleViewportWidth}
                  setScheduleViewportWidth={setScheduleViewportWidth}
                  scheduleViewportHeight={scheduleViewportHeight}
                  setScheduleViewportHeight={setScheduleViewportHeight}
                  handleCreateSchedule={handleCreateSchedule}
                  handleToggleSchedule={handleToggleSchedule}
                  handleDeleteSchedule={handleDeleteSchedule}
                />
              ) : sidebarTab === "breakpoints" ? (
                <BreakpointsPanel
                  breakpoints={breakpoints}
                  activeFileName={activeFileName}
                  isDebuggerMode={isDebuggerMode}
                  setIsDebuggerMode={setIsDebuggerMode}
                  breakpointsMuted={breakpointsMuted}
                  setBreakpointsMuted={setBreakpointsMuted}
                  activeBreakpointLine={activeBreakpointLine}
                  handleResumeScript={handleResumeScript}
                  cursorPos={cursorPos}
                  toggleBreakpoint={toggleBreakpoint}
                  handleSwitchFileAndJump={handleSwitchFileAndJump}
                  jumpToLine={jumpToLine}
                  setBreakpoints={setBreakpoints}
                  addTerminalLine={addTerminalLine}
                />
              ) : sidebarTab === "extension" ? (
                <ExtensionPanel
                  selectedExtensionFileIndex={selectedExtensionFileIndex}
                  setSelectedExtensionFileIndex={setSelectedExtensionFileIndex}
                  handleDownloadExtensionZip={handleDownloadExtensionZip}
                  addTerminalLine={addTerminalLine}
                />
              ) : (
                <AIPanel
                  user={user}
                  aiPrompt={aiPrompt}
                  setAiPrompt={setAiPrompt}
                  generatingScript={generatingScript}
                  setAiGenerationMode={setAiGenerationMode}
                  aiGenerationMode={aiGenerationMode}
                  aiError={aiError}
                  aiSuccessMessage={aiSuccessMessage}
                  aiGeneratedExplanation={aiGeneratedExplanation}
                  handleGenerateAIScript={handleGenerateAIScript}
                />
              )}
            </div>
          )}
              </aside>

        {/* Sidebar Resize Handle (Desktop only) */}
        {!showMobileSidebar && !isFullscreenEditor && !isFullscreenPreview && (
          <div
            onMouseDown={startResizeSidebar}
            className={`hidden md:block w-1.5 hover:w-2 hover:bg-blue-500/80 transition-all cursor-col-resize select-none h-full z-10 shrink-0 bg-transparent border-r border-[#30363d] relative`}
            title="Drag to resize sidebar"
          >
            {isResizingSidebar && (
              <div className="absolute inset-0 bg-blue-500 pointer-events-none" />
            )}
          </div>
        )}

        {/* Central Workspace Split Panel: Code Editor & Preview/Console */}
        <section className="flex-1 flex flex-col bg-[#0d1117] min-w-0" id="primary-workspace">
          
          {/* Real-time Task Progress Center across Workspace */}
          {isBusy && (
            <div className="bg-[#1c1d21] border-b border-[#31363c] px-4 py-1.5 flex items-center justify-between gap-3 text-[10px] font-mono select-none" id="workspace-progress-panel">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3 animate-spin text-blue-400 shrink-0" />
                <span className="text-[#8b949e]">
                  {uploading && "Saving assets: Running background file encryption and storage..."}
                  {initializingPlaywright && "Initializing missing libraries: Installing chromium, firefox and webkit browser binaries..."}
                  {savingScript && "Saving scripts: Cataloguing system variables and encrypting database snapshots..."}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-[#8b949e]">
                <span className="text-[9px] text-zinc-500 animate-pulse">Running Background Task</span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                </span>
              </div>
            </div>
          )}
          {isBusy && (
            <div className="w-full h-[2px] bg-[#161b22] relative overflow-hidden shrink-0" id="global-action-progress-bar">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 w-1/3 h-full rounded-full animate-progress" />
            </div>
          )}
          
          {/* Top Panel: Monaco Editor & Live Browser Frame View */}
          <div className="flex-grow flex min-h-0" id="editors-split">
            
            {/* Playwright Script Code Editor on Left */}
            <div 
              className={`flex-1 flex flex-col min-w-0 min-h-0 ${
                isFullscreenPreview ? "hidden" : "md:flex"
              } ${
                isFullscreenEditor ? "border-r-0" : "border-r border-[#30363d]"
              } ${
                mobileActiveView === "editor" ? "flex" : "hidden"
              }`} 
              id="editor-side"
            >
              
              {/* Script name inputs & run controls bar */}
              <div 
                className={`flex shrink-0 px-4 border-b border-[#30363d] bg-[#161b22] ${
                  estimatedEditorWidth < 620 
                    ? "flex-col items-stretch py-1.5 gap-1.5 h-auto" 
                    : "flex-row items-center justify-between h-10 gap-2.5"
                }`}
                id="editor-toolbar"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                  <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" title="Active Project Workspace" />
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider hidden md:inline select-none">Project:</span>
                  <span className="text-zinc-500 font-semibold select-none text-xs">{scriptName || "Untitled"}</span>
                  <span className="text-zinc-600 select-none text-xs">/</span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#0d1117] border border-[#30363d] rounded text-xs text-blue-400 font-mono select-none" title="Active editing file">
                    <FileCode className="h-3.5 w-3.5 text-blue-400" />
                    <span className="truncate max-w-[110px] xs:max-w-[140px] font-semibold">{activeFileName}</span>
                  </div>
                  {hasUnsavedChanges ? (
                    <span className="text-[10px] bg-amber-95/10 border border-amber-800/40 text-amber-500 px-1.5 py-0.5 rounded font-mono font-medium flex items-center gap-1 shrink-0" title="Contains local edits that need to be saved to cloud database">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                      </span>
                      <span className="hidden xs:inline sm:hidden md:inline-block">Unsaved</span>
                      <span className="hidden md:inline">Changes</span>
                    </span>
                  ) : scriptSavedMsg ? (
                    <span className="text-[10px] text-emerald-450 font-medium flex items-center gap-1 shrink-0">
                      <span className="text-emerald-500 font-bold">✓</span> <span className="hidden xs:inline">Saved</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#8b949e] font-mono hidden sm:inline shrink-0" title="Stored safely in cloud database">
                      ✓ Sync
                    </span>
                  )}

                  {/* Realtime collaboration presence badges */}
                  {collaborators.length > 0 && (
                    <div className="hidden xs:flex items-center -space-x-1.5 ml-1.5 border-l border-[#30363d] pl-1.5 py-1 overflow-hidden select-none shrink-0">
                      {collaborators.slice(0, 3).map((c, idx) => (
                        <div
                          key={`collaborator-${c.id || 'no-id'}-${idx}`}
                          className="w-5 h-5 rounded-full border border-[#0d1117] flex items-center justify-center text-[8px] font-bold text-white uppercase relative group hover:z-10 transition-all cursor-pointer shadow-lg shrink-0"
                          style={{ backgroundColor: c.color }}
                          title={`${c.name} ${c.cursor ? `(Line ${c.cursor.line}, Col ${c.cursor.column})` : ""}`}
                        >
                          {c.name.substring(0, 2)}
                          
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[#161b22] border border-[#30363d] text-[9px] text-[#c9d1d9] font-mono px-2 py-0.5 rounded whitespace-nowrap shadow-2xl z-55">
                            <span className="text-white font-semibold">{c.name}</span>
                            {c.cursor ? ` (Line ${c.cursor.line} : Col ${c.cursor.column})` : " (Viewing)"}
                          </span>
                        </div>
                      ))}
                      {collaborators.length > 3 && (
                        <div className="w-5 h-5 rounded-full border border-[#0d1117] bg-[#21262d] flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0 select-none">
                          +{collaborators.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className={`flex items-center shrink-0 ${
                  estimatedEditorWidth < 620 
                    ? "justify-between border-t border-[#30363d]/50 pt-1.5" 
                    : "justify-end gap-1.5 sm:gap-2"
                }`}>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Make a copy button in editor toolbar if viewed from shared list */}
                    {activeScriptId && scripts.find(s => s.id === activeScriptId)?.ownerId !== user?.uid && (
                      <button
                        onClick={() => {
                          const loadedScript = scripts.find(s => s.id === activeScriptId);
                          if (loadedScript) handleMakeCopy(loadedScript);
                        }}
                        className="px-2 py-1 bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-300 rounded text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                        title="Make a Copy to your Workspace"
                      >
                        <Copy className="h-3 w-3 shrink-0" />
                        {estimatedEditorWidth >= 460 && <span className="ml-1">Copy</span>}
                      </button>
                    )}

                    <button
                      onClick={handleFormatScript}
                      disabled={formatting}
                      className="px-2 py-1 sm:px-2.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-xs font-semibold text-[#c9d1d9] flex items-center gap-1 sm:gap-1.5 transition-all hover:text-white cursor-pointer shrink-0"
                      title="Format Code with Prettier"
                    >
                      <Wand2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      {estimatedEditorWidth >= 460 && <span className="ml-1">Format</span>}
                    </button>

                    <button
                      onClick={() => setShowDownloadModal(true)}
                      className="px-2 py-1 sm:px-2.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-xs font-semibold text-[#c9d1d9] flex items-center gap-1 sm:gap-1.5 transition-all hover:text-white cursor-pointer shrink-0"
                      title="Download project files (ZIP or .js)"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      {estimatedEditorWidth >= 460 && <span className="ml-1">Download</span>}
                    </button>

                    {/* Fullscreen Button */}
                    <button
                      onClick={() => setIsFullscreenEditor(prev => !prev)}
                      className="px-2 py-1 sm:px-2.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-xs font-semibold text-[#c9d1d9] flex items-center gap-1 sm:gap-1.5 transition-all hover:text-white cursor-pointer shrink-0"
                      title={isFullscreenEditor ? "Exit Fullscreen Editor" : "Fullscreen Editor"}
                    >
                      {isFullscreenEditor ? (
                        <>
                          <Minimize2 className="h-3.5 w-3.5 text-blue-450 shrink-0" />
                          {estimatedEditorWidth >= 460 && <span className="ml-1">Exit Full</span>}
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          {estimatedEditorWidth >= 460 && <span className="ml-1">Fullscreen</span>}
                        </>
                      )}
                    </button>
                  </div>

                  {estimatedEditorWidth >= 340 && (
                    <div className="flex items-center gap-1.5">
                      <div className="hidden sm:inline-block w-px h-3.5 bg-[#30363d] mx-1 shrink-0" />
                      <div className="text-[10px] text-[#8b949e] bg-black/40 px-2 py-0.5 rounded font-mono shrink-0">
                        Ln {cursorPos.line}, Col {cursorPos.column}
                      </div>
                    </div>
                  )}
                </div>
              </div>
 
              {/* Monaco Editor Canvas */}
              <div className="flex-grow rel-min-h relative bg-[#0d1117] min-h-0" id="editor-wrapper">
                <Editor
                  height="100%"
                  language="javascript"
                  theme="vs-dark"
                  value={currentCode}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  options={{
                    fontSize: 13,
                    fontFamily: "JetBrains Mono, Menlo, monospace",
                    lineNumbers: "on",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 12, bottom: 12 },
                    wordWrap: "on",
                    cursorStyle: "line",
                    cursorWidth: 3,
                    cursorBlinking: "blink",
                    renderLineHighlight: "all",
                    fontLigatures: true,
                    backgroundColor: "#0d1117"
                  }}
                />
              </div>
            </div>

            {/* Preview Panel Resize Handle (Desktop only) */}
            {!isFullscreenEditor && !isFullscreenPreview && !isPreviewCollapsed && (
              <div
                onMouseDown={startResizePreview}
                className={`hidden md:block w-1.5 hover:w-2 hover:bg-blue-500/80 transition-all cursor-col-resize select-none h-full z-10 shrink-0 bg-transparent border-l border-[#30363d] relative`}
                title="Drag to resize preview panel"
              >
                {isResizingPreview && (
                  <div className="absolute inset-0 bg-blue-500 pointer-events-none" />
                )}
              </div>
            )}

            {/* Browser Preview + Artifacts Section on Right */}
            <section 
              className={`w-full flex flex-col bg-[#010409] min-h-0 ${
                isFullscreenPreview ? "flex-1" : "shrink-0"
              } ${
                isFullscreenEditor ? "hidden" : "md:flex"
              } ${
                mobileActiveView === "preview" ? "flex" : "hidden"
              }`} 
              style={(!isFullscreenEditor && !isFullscreenPreview && !isMobile) ? { 
                width: isPreviewCollapsed ? "42px" : `${previewWidth}px`, 
                minWidth: isPreviewCollapsed ? "42px" : `${previewWidth}px` 
              } : undefined}
              id="preview-side"
            >
              {isPreviewCollapsed && !isMobile ? (
                <div className="flex flex-col items-center h-full w-full bg-[#161b22] text-[#8b949e]">
                  <button
                    onClick={togglePreviewCollapsed}
                    className="h-10 w-full flex items-center justify-center hover:text-white border-b border-[#30363d] cursor-pointer shrink-0"
                    title="Expand Preview Pane"
                  >
                    <ChevronRight className="h-4 w-4 text-[#8b949e] rotate-180" />
                  </button>
                  <div className="flex flex-col items-center gap-4 py-4 w-full">
                    <button
                      onClick={() => { setActiveTab("preview"); togglePreviewCollapsed(); }}
                      className={`p-1.5 rounded hover:text-white transition-colors cursor-pointer ${activeTab === "preview" ? "text-blue-400 bg-[#0d1117]" : "text-zinc-550"}`}
                      title="Live Browser View"
                    >
                      <Eye className="h-4.5 w-4.5" />
                    </button>
                    <button
                      onClick={() => { setActiveTab("assets"); togglePreviewCollapsed(); }}
                      className={`p-1.5 rounded hover:text-white transition-colors cursor-pointer ${activeTab === "assets" ? "text-blue-400 bg-[#0d1117]" : "text-zinc-550"}`}
                      title="Workspace Assets & Outputs"
                    >
                      <FolderOpen className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Live Preview Header */}
                  {(() => {
                    const isNarrowPreview = (isMobile ? windowWidth : previewWidth) < 420;
                    return (
                      <div 
                        className={`flex border-b border-[#30363d] bg-[#161b22] px-3 shrink-0 ${
                          (isNarrowPreview && activeTab === "preview")
                            ? "flex-col items-stretch py-1.5 gap-1.5 h-auto" 
                            : "flex-row items-center justify-between h-10 gap-2"
                        }`} 
                        id="tabs-toolbar"
                      >
                        {/* Left: Tab selectors & Main Controls */}
                        <div className={`flex items-center justify-between gap-1.5 ${isNarrowPreview ? "w-full" : "w-auto"}`}>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setActiveTab("preview")}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition font-medium cursor-pointer shrink-0 ${
                                activeTab === "preview"
                                  ? "bg-[#30363d] text-white"
                                  : "text-[#8b949e] hover:text-white"
                              }`}
                            >
                              <Eye className="h-3 w-3" />
                              <span>{isNarrowPreview ? "Live" : "Live Browser"}</span>
                            </button>
                            <button
                              onClick={() => setActiveTab("assets")}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition font-medium relative cursor-pointer shrink-0 ${
                                activeTab === "assets"
                                  ? "bg-[#30363d] text-white"
                                  : "text-[#8b949e] hover:text-white"
                              }`}
                            >
                              <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
                              <span>{isNarrowPreview ? "Assets" : "Workspace Assets"}</span>
                              {artifacts.length > 0 && (
                                <span className="ml-1 bg-blue-500/35 text-blue-400 text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                                  {artifacts.length}
                                </span>
                              )}
                            </button>

                            <span className="h-4 w-[1px] bg-[#30363d] mx-1 shrink-0" />

                            {/* Fullscreen Live Browser & Assets Toggle Button */}
                            <button
                              onClick={() => setIsFullscreenPreview(prev => !prev)}
                              className="p-1 text-[#8b949e] hover:text-white cursor-pointer select-none rounded hover:bg-[#30363d] shrink-0"
                              title={isFullscreenPreview ? "Exit Fullscreen Preview" : "Fullscreen Preview"}
                            >
                              {isFullscreenPreview ? (
                                <Minimize2 className="h-4 w-4 text-blue-400" />
                              ) : (
                                <Maximize2 className="h-4 w-4" />
                              )}
                            </button>

                            {!isMobile && !isFullscreenPreview && (
                              <button
                                onClick={togglePreviewCollapsed}
                                className="hidden sm:inline-flex p-1 px-1.5 text-[#8b949e] hover:text-white cursor-pointer select-none rounded hover:bg-[#30363d] shrink-0"
                                title="Collapse Preview Panel"
                              >
                                <ChevronRight className="h-4 w-4 text-zinc-400" />
                              </button>
                            )}
                          </div>

                          {/* On mobile/tablet, show collapse button here next to tabs */}
                          {!isMobile && (
                            <button
                              onClick={togglePreviewCollapsed}
                              className="sm:hidden p-1 px-1.5 text-[#8b949e] hover:text-white cursor-pointer select-none rounded hover:bg-[#30363d] shrink-0"
                              title="Collapse Preview Panel"
                            >
                              <ChevronRight className="h-4 w-4 text-zinc-400 animate-pulse" />
                            </button>
                          )}
                        </div>

                        {/* Right: Presets & info (Only for Live Browser tab) */}
                        {activeTab === "preview" && (
                          <div className={`flex items-center justify-between gap-2 shrink-0 ${
                            isNarrowPreview 
                              ? "border-t border-[#30363d]/50 pt-1.5 w-full" 
                              : "w-auto border-t-0 pt-0"
                          }`}>
                            <div className="flex items-center gap-1 bg-black/40 border border-[#30363d] rounded-md p-0.5 shrink-0">
                              {(["Desktop", "Tablet", "Mobile"] as const).map((preset) => {
                                const isSelected = 
                                  (preset === "Desktop" && viewportWidth === 1280) ||
                                  (preset === "Tablet" && viewportWidth === 768) ||
                                  (preset === "Mobile" && viewportWidth === 375);
                                return (
                                  <button
                                    key={`viewport-preset-${preset}`}
                                    onClick={() => {
                                      if (preset === "Desktop") {
                                        setViewportWidth(1280);
                                        setViewportHeight(720);
                                      } else if (preset === "Tablet") {
                                        setViewportWidth(768);
                                        setViewportHeight(1024);
                                      } else if (preset === "Mobile") {
                                        setViewportWidth(375);
                                        setViewportHeight(812);
                                      }
                                    }}
                                    className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded transition cursor-pointer ${
                                      isSelected
                                        ? "bg-amber-600/35 border border-amber-500/30 text-amber-400 font-bold"
                                        : "text-zinc-400 hover:text-white hover:bg-[#30363d]/50"
                                    }`}
                                    title={`Set viewport to ${preset === "Desktop" ? "1280x720" : preset === "Tablet" ? "768x1024" : "375x812"}`}
                                  >
                                    {preset}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[#8b949e] font-mono shrink-0">
                                {viewportWidth}x{viewportHeight}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Dynamic Tab Body Viewer */}
                  <div className="flex-grow overflow-y-auto p-3 bg-[#0d1117] flex flex-col min-h-0" id="tabs-viewports">
                    <AnimatePresence mode="wait">
                      
                      {/* TAB 1: Live Browser Preview */}
                      {activeTab === "preview" && (
                        <motion.div
                          key="live-preview"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="flex-grow flex flex-col w-full aspect-video bg-white rounded border border-[#30363d] shadow-2xl relative overflow-hidden"
                        >
                          {/* Fake Browser Navigation bar */}
                          <div className="h-6 bg-[#f1f3f4] border-b border-gray-300 px-2.5 flex items-center gap-1.5 select-none shrink-0 text-gray-500">
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            </div>
                            <div className="flex-grow mx-2 bg-white rounded text-[8px] border border-gray-200 py-0.5 text-[#8b949e] truncate flex items-center px-2">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 mr-1.5 shrink-0" />
                              localhost:3000 // stream_chromium_client
                            </div>
                          </div>

                          {/* Video-screen canvas of screenshots representation */}
                          <div className="flex-grow flex-1 bg-[#0d1117] flex items-center justify-center p-1.5 min-h-[160px] relative">
                            {previewImage ? (
                              <div className="relative max-h-full max-w-full">
                                <img
                                  ref={imageRef}
                                  src={previewImage}
                                  alt="Live Playwright Viewport"
                                  referrerPolicy="no-referrer"
                                  className={`max-h-full max-w-full object-contain rounded border border-[#30363d] shadow ${status === "running" ? "cursor-crosshair hover:border-amber-500/50" : ""}`}
                                  onClick={handleViewportClick}
                                />
                                {clickIndicator && (
                                  <div 
                                    className="absolute pointer-events-none rounded-full border-2 border-amber-500 bg-amber-400/25 animate-ping"
                                    style={{
                                      left: `${clickIndicator.x}%`,
                                      top: `${clickIndicator.y}%`,
                                      width: "24px",
                                      height: "24px",
                                      marginLeft: "-12px",
                                      marginTop: "-12px"
                                    }}
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="text-center text-[#8b949e] select-none p-4 w-full">
                                <div className="relative inline-block mb-2">
                                  <Eye className="h-8 w-8 text-[#484f58] mx-auto" />
                                  {status === "running" && (
                                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-xs font-semibold text-white mb-0.5">
                                  {status === "running" ? "Initial Session Frame..." : "No Active Browser"}
                                </h3>
                                <p className="text-[9.5px] leading-relaxed text-[#8b949e]">
                                  {status === "running" 
                                    ? "Browser loaded! Navigating target pages..."
                                    : "Click 'Run Script' above to initiate stream stream."
                                  }
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Active Interference & Pause Control Bar */}
                          {status === "running" && (
                            <div className="bg-[#161b22] px-3 py-2 border-t border-[#30363d] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 select-none font-sans">
                              <div className="flex items-center gap-1.5 flex-grow sm:flex-initial min-w-[140px]">
                                <input
                                  type="text"
                                  placeholder="Type input text..."
                                  className="bg-[#0d1117] text-white border border-[#30363d] rounded px-2.5 py-1 text-xs w-full placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const input = e.currentTarget;
                                      if (input.value) {
                                        handleSendText(input.value);
                                        input.value = "";
                                      }
                                    }
                                  }}
                                />
                                <button
                                  onClick={(e) => {
                                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                    if (input && input.value) {
                                      handleSendText(input.value);
                                      input.value = "";
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition font-medium cursor-pointer shrink-0 text-[10.5px]"
                                >
                                  Type
                                </button>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleSendKey("Enter")}
                                  className="px-1.5 py-0.5 bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] rounded text-[#c9d1d9] text-[9.5px] uppercase font-mono cursor-pointer"
                                  title="Press Enter Key"
                                >
                                  ↵ Enter
                                </button>
                                <button
                                  onClick={() => handleSendKey("Tab")}
                                  className="px-1.5 py-0.5 bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] rounded text-[#c9d1d9] text-[9.5px] uppercase font-mono cursor-pointer"
                                  title="Press Tab Key"
                                >
                                  ⇥ Tab
                                </button>
                                <button
                                  onClick={() => handleSendKey("Backspace")}
                                  className="px-1.5 py-0.5 bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] rounded text-[#c9d1d9] text-[9.5px] uppercase font-mono cursor-pointer"
                                  title="Press Backspace"
                                >
                                  ⌫ Del
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5 pl-1 shrink-0">
                                {isPausedOnBackend ? (
                                  <button
                                    onClick={handleResumeScript}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-[11px] flex items-center gap-0.5 cursor-pointer animate-pulse"
                                  >
                                    <Play className="h-3 w-3 fill-white" />
                                    Resume
                                  </button>
                                ) : (
                                  <button
                                    onClick={handlePauseScript}
                                    className="px-2.5 py-1 bg-[#da3633] hover:bg-[#f85149] text-white font-medium rounded text-[11px] flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Square className="h-3 w-3 fill-white" />
                                    Pause
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                  {/* TAB 2: Combined Workspace Assets */}
                  {activeTab === "assets" && (() => {
                    // Helper to get folder of an artifact
                    const getArtifactFolder = (art: any) => {
                      if (fileFolderMap[art.name]) return fileFolderMap[art.name];
                      if (art.name.includes("/")) return art.name.split("/")[0];
                      return "Default";
                    };

                    // Helper to list all available folders
                    const allAvailableFolders = ["All", "Default"];
                    customFolders.forEach(f => {
                      if (!allAvailableFolders.includes(f)) allAvailableFolders.push(f);
                    });
                    artifacts.forEach(art => {
                      if (art.name.includes("/")) {
                        const autoFolder = art.name.split("/")[0];
                        if (!allAvailableFolders.includes(autoFolder)) {
                          allAvailableFolders.push(autoFolder);
                        }
                      }
                      if (fileFolderMap[art.name]) {
                        const mappedFolder = fileFolderMap[art.name];
                        if (!allAvailableFolders.includes(mappedFolder)) {
                          allAvailableFolders.push(mappedFolder);
                        }
                      }
                    });

                    // Filter artifacts strictly based on current workspace and selected folder
                    const workspaceArtifacts = artifacts.filter(art => {
                      if (activeScriptId) {
                        if (art.scriptId) {
                          return art.scriptId === activeScriptId;
                        }
                      }
                      return true;
                    });

                    const filteredArtifacts = workspaceArtifacts.filter(art => {
                      if (activeFolder === "All") return true;
                      return getArtifactFolder(art) === activeFolder;
                    });

                    return (
                      <motion.div
                        key="assets-tab"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-grow flex flex-col space-y-4"
                      >
                        {/* Global Folder Info Banner */}
                        <div className="p-3 bg-blue-950/15 border border-blue-900/35 rounded-lg flex items-start gap-2 text-blue-300">
                          <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                          <div className="text-[11px] leading-relaxed">
                            <span className="font-semibold text-white">System Directories & Folders</span>
                            <p className="text-zinc-400 mt-0.5">
                              Files are processed in real-time. Organize items into sub-folders dynamically or view automatically structured folders from your script paths.
                            </p>
                          </div>
                        </div>

                        {/* Interactive Folder Organizer Section */}
                        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-3">
                          <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
                            <div className="flex items-center gap-1.5">
                              <Folder className="h-4 w-4 text-blue-400" />
                              <span className="text-xs font-semibold text-white">Group Files into Sub-Folders</span>
                            </div>
                            <button
                              onClick={() => setShowNewFolderModal(true)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold cursor-pointer transition-colors"
                            >
                              <FolderPlus className="h-3.5 w-3.5" />
                              <span>+ Create Folder</span>
                            </button>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-0.5 whitespace-nowrap scrollbar-none">
                            {allAvailableFolders.map((folder, idx) => {
                              const isCurrent = activeFolder === folder;
                              const count = folder === "All" 
                                ? artifacts.length 
                                : artifacts.filter(art => getArtifactFolder(art) === folder).length;

                              return (
                                <button
                                  key={`folder-tab-${folder}-${idx}`}
                                  onClick={() => {
                                    setActiveFolder(folder);
                                    setActiveCarouselIndex(0);
                                  }}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10.5px] transition-all font-medium cursor-pointer shrink-0 select-none ${
                                    isCurrent 
                                      ? "bg-blue-600 text-white font-semibold shadow" 
                                      : "bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#21262d]/55"
                                  }`}
                                >
                                  <Folder className={`h-3 w-3 ${isCurrent ? "text-white" : "text-blue-500"}`} />
                                  <span>{folder}</span>
                                  {count > 0 && (
                                    <span className={`text-[8.5px] font-bold px-1.5 py-0.1 rounded-full ${isCurrent ? "bg-white/20 text-white" : "bg-black/35 text-zinc-400"}`}>
                                      {count}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Sub Tabs Navigation */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10 shrink-0 bg-[#0d1117] py-1">
                          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-1 bg-[#161b22] border border-[#30363d] rounded-lg overflow-x-auto whitespace-nowrap scrollbar-none w-full sm:w-auto">
                            {(["all", "screenshot", "pdf", "excel", "upload", "video"] as const).map((subTab) => {
                              const count = subTab === "all" 
                                ? filteredArtifacts.length 
                                : filteredArtifacts.filter(a => a.type === subTab).length;
                              
                              const label = subTab === "all" ? "All Files"
                                : subTab === "screenshot" ? "Screenshots"
                                : subTab === "pdf" ? "PDFs"
                                : subTab === "excel" ? "Excel/CSVs"
                                : subTab === "upload" ? "Uploads"
                                : "Recordings";

                              const Icon = subTab === "all" ? FolderOpen
                                : subTab === "screenshot" ? ImageIcon
                                : subTab === "pdf" ? FileText
                                : subTab === "excel" ? FileSpreadsheet
                                : subTab === "upload" ? Upload
                                : Video;

                              const colors = subTab === "screenshot" ? "text-amber-400"
                                : subTab === "pdf" ? "text-red-400"
                                : subTab === "excel" ? "text-emerald-400"
                                : subTab === "upload" ? "text-blue-400"
                                : subTab === "video" ? "text-purple-400"
                                : "text-[#8b949e]";

                              const isActive = activeAssetSubTab === subTab;

                              return (
                                <button
                                  key={`asset-subtab-${subTab}`}
                                  onClick={() => {
                                    setActiveAssetSubTab(subTab);
                                    setActiveCarouselIndex(0);
                                  }}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] transition-all font-medium cursor-pointer shrink-0 select-none ${
                                    isActive 
                                      ? "bg-[#30363d] text-white font-semibold" 
                                      : "text-[#8b949e] hover:text-white hover:bg-[#21262d]/55"
                                  }`}
                                >
                                  <Icon className={`h-3 w-3 ${isActive ? colors : "text-[#8b949e]"}`} />
                                  <span>{label}</span>
                                  {count > 0 && (
                                    <span className={`ml-1 text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                                      isActive ? "bg-blue-500/25 text-blue-400" : "bg-black/35 text-[#8b949e]"
                                    }`}>
                                      {count}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {(() => {
                            const subCount = activeAssetSubTab === "all" 
                              ? filteredArtifacts.length 
                              : filteredArtifacts.filter(a => a.type === activeAssetSubTab).length;
                            
                            if (subCount === 0) return null;

                            const tabLabel = activeAssetSubTab === "all" ? "Files"
                              : activeAssetSubTab === "screenshot" ? "Screenshots"
                              : activeAssetSubTab === "pdf" ? "PDFs"
                              : activeAssetSubTab === "excel" ? "Excel/CSVs"
                              : activeAssetSubTab === "upload" ? "Uploads"
                              : "Recordings";

                            return (
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto select-none">
                                {/* Save All button */}
                                <button
                                  onClick={() => handleSaveAllAssets(activeAssetSubTab)}
                                  disabled={isSavingAll}
                                  className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 font-semibold text-xs border border-emerald-500 hover:border-emerald-400 text-white shadow-md transition-all cursor-pointer whitespace-nowrap"
                                  title={`Download all assets in ${tabLabel} ZIP`}
                                >
                                  <Download className={`h-3.5 w-3.5 ${isSavingAll ? "animate-pulse" : ""}`} />
                                  <span>Save All {tabLabel} ({subCount})</span>
                                </button>

                                {/* Delete buttons - separated for Output files vs Input files */}
                                {activeAssetSubTab === "all" ? (
                                  <>
                                    <button
                                      onClick={() => handleClearArtifacts("outputs")}
                                      disabled={clearing}
                                      className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 border border-rose-900/45 text-rose-350 hover:text-white disabled:bg-[#161b22] disabled:opacity-50 font-semibold text-xs transition-all cursor-pointer whitespace-nowrap"
                                      title="Delete all generated output files (screenshots, PDFs, Excel sheets, recordings)"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>Delete Output Files</span>
                                    </button>
                                    <button
                                      onClick={() => handleClearArtifacts("inputs")}
                                      disabled={clearing}
                                      className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900 border border-amber-900/45 text-amber-300 hover:text-white disabled:bg-[#161b22] disabled:opacity-50 font-semibold text-xs transition-all cursor-pointer whitespace-nowrap"
                                      title="Delete all uploaded input files"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>Delete Input Files</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleClearArtifacts(activeAssetSubTab === "upload" ? "inputs" : activeAssetSubTab)}
                                    disabled={clearing}
                                    className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 border border-rose-900/45 text-rose-350 hover:text-white disabled:bg-[#161b22] disabled:opacity-50 font-semibold text-xs transition-all cursor-pointer whitespace-nowrap"
                                    title={`Delete all assets in ${tabLabel}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete {activeAssetSubTab === "upload" ? "Input Files" : `All ${tabLabel}`}</span>
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* 1. Screenshots Section */}
                        {(activeAssetSubTab === "all" || activeAssetSubTab === "screenshot") && (() => {
                          const screenshots = filteredArtifacts.filter(a => a.type === "screenshot");
                          const hasScreenshots = screenshots.length > 0;

                          return (
                            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-3 text-left">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#30363d] pb-2">
                                <div className="flex items-center gap-1.5 animate-none">
                                  <ImageIcon className="h-4 w-4 text-amber-400" />
                                  <span className="text-xs font-semibold text-white">Screenshots</span>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-auto">
                                  {screenshots.length >= 2 && (
                                    <div className="flex items-center gap-1 p-0.5 bg-black/40 border border-[#30363d] rounded-lg">
                                      <button
                                        onClick={() => setScreenshotViewMode("grid")}
                                        className={`p-1 rounded transition text-xs flex items-center gap-1 cursor-pointer ${
                                          screenshotViewMode === "grid" ? "bg-[#30363d] text-white" : "text-zinc-500 hover:text-zinc-300"
                                        }`}
                                        title="Grid view"
                                      >
                                        <LayoutGrid className="h-3 w-3" />
                                      </button>
                                      <button
                                        onClick={() => setScreenshotViewMode("carousel")}
                                        className={`p-1 rounded transition text-xs flex items-center gap-1 cursor-pointer ${
                                          screenshotViewMode === "carousel" ? "bg-[#30363d] text-white" : "text-zinc-500 hover:text-zinc-300"
                                        }`}
                                        title="Carousel view"
                                      >
                                        <Columns className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                  <span className="text-[10px] font-mono text-zinc-400 bg-black/45 px-2 py-0.5 rounded border border-[#30363d]">
                                    Folder output: <code className="text-amber-400 font-bold font-mono">screenshots/</code>
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-[#8b949e]">
                                Save screenshots into screenshots folder: <code className="font-mono bg-black/35 px-1 py-0.5 rounded text-zinc-350 select-all">{'await page.screenshot({ path: "screenshots/shot.png" });'}</code>
                              </p>
                              
                              {!hasScreenshots ? (
                                <div className="border border-dashed border-[#30363d] rounded-lg p-5 text-center flex flex-col items-center justify-center text-[#8b949e]">
                                  <ImageIcon className="h-5 w-5 mb-1 text-[#484f58]" />
                                  <p className="text-[10px] italic">No screenshots found in {activeFolder === "All" ? "any folders" : `folder "${activeFolder}"`}.</p>
                                </div>
                              ) : (screenshotViewMode === "carousel" && screenshots.length >= 2) ? (
                                <div className="space-y-3">
                                  {(() => {
                                    const cIndex = Math.min(activeCarouselIndex, screenshots.length - 1);
                                    const art = screenshots[cIndex];
                                    const versions = artifactVersionHistory[art.name] || [];

                                    return (
                                      <div className="border border-[#30363d] bg-[#0d1117] rounded-xl overflow-hidden flex flex-col shadow-lg p-3 space-y-3 relative">
                                        
                                        {/* Carousel Image Panel */}
                                        <div className="relative w-full aspect-[16/10] bg-black/55 rounded-lg overflow-hidden flex items-center justify-center group/panel">
                                          <img
                                            src={art.url}
                                            alt={art.name}
                                            referrerPolicy="no-referrer"
                                            className="max-h-full max-w-full object-contain select-none"
                                          />

                                          {/* Left chevron button */}
                                          <button
                                            onClick={() => setActiveCarouselIndex(prev => (prev - 1 + screenshots.length) % screenshots.length)}
                                            className="absolute left-3 w-8 h-8 rounded-full bg-black/60 border border-zinc-800 text-white flex items-center justify-center hover:bg-zinc-900 cursor-pointer transition opacity-0 group-hover/panel:opacity-100"
                                            title="Previous Screenshot"
                                          >
                                            <ChevronLeft className="h-5 w-5" />
                                          </button>

                                          {/* Right chevron button */}
                                          <button
                                            onClick={() => setActiveCarouselIndex(prev => (prev + 1) % screenshots.length)}
                                            className="absolute right-3 w-8 h-8 rounded-full bg-black/60 border border-zinc-800 text-white flex items-center justify-center hover:bg-zinc-900 cursor-pointer transition opacity-0 group-hover/panel:opacity-100"
                                            title="Next Screenshot"
                                          >
                                            <ChevronRight className="h-5 w-5" />
                                          </button>

                                          {/* Image Index Overlay Indicator */}
                                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/75 border border-[#30363d] rounded-full text-[9px] font-mono text-zinc-300 shadow">
                                            {cIndex + 1} of {screenshots.length}
                                          </div>
                                        </div>

                                        {/* Metadata & Actions section */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-[#30363d] pt-3">
                                          <div className="text-left space-y-0.5">
                                            <code className="text-blue-400 font-bold font-mono text-[11px] block truncate max-w-sm" title={art.name}>
                                              {art.name}
                                            </code>
                                            <div className="flex items-center gap-2 text-[9px] text-zinc-500 font-mono">
                                              <span>Size: {formatFileSize(art.size)}</span>
                                              <span>•</span>
                                              <span>Captured: {art.timestamp ? formatAssetTimestamp(art.timestamp) : "Just Now"}</span>
                                            </div>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2">
                                            {/* Folder Selector */}
                                            <div className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] px-2 py-1 rounded text-[10px] text-zinc-300">
                                              <Folder className="h-3 w-3 text-blue-400 shrink-0" />
                                              <select
                                                value={getArtifactFolder(art)}
                                                onChange={(e) => {
                                                  const newFolder = e.target.value;
                                                  setFileFolderMap(prev => {
                                                    const updated = { ...prev, [art.name]: newFolder };
                                                    localStorage.setItem("assets_file_folder_map", JSON.stringify(updated));
                                                    return updated;
                                                  });
                                                  addTerminalLine(`Moved "${art.name}" to folder "${newFolder}"`, "success");
                                                }}
                                                className="bg-transparent text-[10px] text-zinc-300 focus:outline-none cursor-pointer pr-1 border-none font-medium"
                                              >
                                                {allAvailableFolders.filter(f => f !== "All").map((f, fIdx) => (
                                                  <option key={`f-opt-s-${f}-${fIdx}`} value={f} className="bg-[#161b22] text-zinc-300">{f}</option>
                                                ))}
                                              </select>
                                            </div>

                                            {/* Version history button */}
                                            <button
                                              onClick={() => setExpandedHistoryFile(expandedHistoryFile === art.name ? null : art.name)}
                                              className={`px-2.5 py-1 text-[10px] rounded border transition-all font-semibold cursor-pointer flex items-center gap-1 ${
                                                expandedHistoryFile === art.name 
                                                  ? "bg-blue-600 border-blue-500 text-white" 
                                                  : "bg-[#161b22] border-[#30363d] text-zinc-300 hover:bg-[#30363d] hover:text-white"
                                              }`}
                                            >
                                              <History className="h-3.5 w-3.5" />
                                              <span>History ({versions.length})</span>
                                            </button>

                                            <button
                                              onClick={() => {
                                                setViewerImage(art.url);
                                                setViewerTitle(art.name);
                                              }}
                                              className="px-2.5 py-1 text-[10px] rounded bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 font-semibold cursor-pointer transition"
                                            >
                                              Zoom
                                            </button>

                                            <a
                                              href={`${art.url}?download=true`}
                                              download={art.name}
                                              className="px-2.5 py-1 text-[10px] rounded bg-[#161b22] border border-[#30363d] text-white hover:bg-[#30363d] font-semibold transition flex items-center gap-1"
                                            >
                                              <Download className="h-3 w-3" />
                                              <span>PNG</span>
                                            </a>
                                          </div>
                                        </div>

                                        {/* Versions Accordion panel */}
                                        {expandedHistoryFile === art.name && (
                                          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 space-y-2 mt-2">
                                            <div className="flex items-center gap-1.5 border-b border-[#30363d] pb-1.5">
                                              <History className="h-3.5 w-3.5 text-blue-400" />
                                              <span className="text-[11px] font-bold text-white">Historical Capture Log</span>
                                            </div>
                                            {versions.length === 0 ? (
                                              <p className="text-[10px] italic text-[#8b949e]">No previous versions saved.</p>
                                            ) : (
                                              <div className="space-y-1.5 divide-y divide-[#30363d]/45">
                                                {versions.map((v: any, vIdx: number) => {
                                                  const isCurrent = v.size === art.size && v.timestamp === art.timestamp;
                                                  return (
                                                    <div key={`screenshot-history-${art.name}-${v.timestamp}-${vIdx}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1.5 first:pt-0">
                                                      <div className="text-left space-y-0.5 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                          <span className="text-[10px] font-bold font-mono text-zinc-400 bg-black/35 px-1 py-0.1 rounded">
                                                            Run #{versions.length - vIdx}
                                                          </span>
                                                          {isCurrent && (
                                                            <span className="text-[8px] uppercase font-mono font-extrabold text-emerald-400 bg-emerald-500/10 px-1 rounded-sm">
                                                              Active
                                                            </span>
                                                          )}
                                                          <span className="text-[10px] font-mono text-zinc-500">
                                                            {formatAssetTimestamp(v.timestamp)}
                                                          </span>
                                                        </div>
                                                        {/* Editable comment/note input */}
                                                        <div className="flex items-center gap-1">
                                                          <span className="text-[9.5px] text-zinc-500 italic">Caption:</span>
                                                          <input
                                                            type="text"
                                                            value={v.note || ""}
                                                            placeholder="Click to add note..."
                                                            onChange={(e) => {
                                                              const newNote = e.target.value;
                                                              setArtifactVersionHistory(prev => {
                                                                const next = { ...prev };
                                                                const list = [...(next[art.name] || [])];
                                                                const index = list.findIndex(item => item.timestamp === v.timestamp && item.size === v.size);
                                                                if (index !== -1) {
                                                                  list[index] = { ...list[index], note: newNote };
                                                                }
                                                                next[art.name] = list;
                                                                localStorage.setItem("playwright_artifact_version_history", JSON.stringify(next));
                                                                return next;
                                                              });
                                                            }}
                                                            className="bg-transparent hover:bg-black/30 focus:bg-[#0d1117] text-[10px] text-blue-400 focus:outline-none focus:border-zinc-700 px-1 py-0.5 rounded transition w-full max-w-[200px]"
                                                          />
                                                        </div>
                                                      </div>

                                                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                                        <span className="text-[9.5px] font-mono text-zinc-500 mr-1">
                                                          {formatFileSize(v.size)}
                                                        </span>
                                                        <button
                                                          onClick={() => {
                                                            setViewerImage(v.url);
                                                            setViewerTitle(`${art.name} (Run #${versions.length - vIdx})`);
                                                          }}
                                                          className="px-2 py-0.5 text-[9.5px] rounded bg-[#21262d] border border-[#30363d] text-zinc-300 hover:bg-[#30363d] hover:text-white"
                                                        >
                                                          Preview
                                                        </button>
                                                        {!isCurrent && (
                                                          <button
                                                            onClick={() => setComparisonModal({
                                                              isOpen: true,
                                                              fileName: art.name,
                                                              versionA: v,
                                                              versionB: { url: art.url, timestamp: art.timestamp, size: art.size }
                                                            })}
                                                            className="px-2 py-0.5 text-[9.5px] rounded bg-blue-900/40 border border-blue-800/60 text-blue-300 hover:bg-blue-850 hover:text-white font-semibold cursor-pointer"
                                                          >
                                                            Compare Slider
                                                          </button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Carousel Navigation Stripe */}
                                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 whitespace-nowrap scrollbar-none">
                                    {screenshots.map((art, idx) => {
                                      const isActive = activeCarouselIndex === idx;
                                      return (
                                        <div
                                          key={`carousel-screenshot-${art.name}-${idx}`}
                                          onClick={() => setActiveCarouselIndex(idx)}
                                          className={`relative aspect-[16/10] w-14 bg-black/60 border rounded-md overflow-hidden shrink-0 cursor-pointer transition ${
                                            isActive ? "border-blue-500 scale-105 shadow shadow-blue-500/25 ring-1 ring-blue-500" : "border-zinc-800 hover:border-zinc-500"
                                          }`}
                                        >
                                          <img
                                            src={art.url}
                                            alt={art.name}
                                            referrerPolicy="no-referrer"
                                            className="w-full h-full object-cover select-none"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {screenshots.map((art, idx) => {
                                    const versions = artifactVersionHistory[art.name] || [];
                                    return (
                                      <div key={`grid-screenshot-${art.name}-${idx}`} className="group relative bg-[#0d1117] border border-[#30363d] rounded overflow-hidden flex flex-col shadow hover:border-blue-500 transition-colors">
                                        <div 
                                          onClick={() => {
                                            setViewerImage(art.url);
                                            setViewerTitle(art.name);
                                          }}
                                          className="aspect-[16/10] bg-black/40 flex items-center justify-center overflow-hidden relative cursor-zoom-in group"
                                        >
                                          <img
                                            src={art.url}
                                            alt={art.name}
                                            referrerPolicy="no-referrer"
                                            className="max-h-full max-w-full object-cover group-hover:scale-105 transition duration-300"
                                          />
                                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setViewerImage(art.url);
                                                setViewerTitle(art.name);
                                              }}
                                              className="bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white px-2 py-0.5 text-[9px] rounded font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                                            >
                                              <Eye className="h-3 w-3" />
                                              View
                                            </button>
                                            <a
                                              href={`${art.url}?download=true`}
                                              download={art.name}
                                              onClick={(e) => e.stopPropagation()}
                                              className="bg-[#21262d] border border-[#30363d] px-2 py-0.5 text-[9px] rounded text-white flex items-center gap-1 hover:bg-[#30363d]"
                                            >
                                              <Download className="h-2.5 w-2.5" />
                                              PNG
                                            </a>
                                          </div>
                                        </div>
                                        <div className="p-2 text-[10px] border-t border-[#30363d] bg-[#161b22] space-y-1 text-left">
                                          <p className="font-mono font-medium text-zinc-350 truncate" title={art.name}>
                                            {art.name}
                                          </p>
                                          
                                          {/* Details Row: Folder map & Version list triggers */}
                                          <div className="flex flex-col gap-1.5 pt-1">
                                            <div className="flex items-center justify-between text-[8px] font-mono text-zinc-500">
                                              <span>{formatFileSize(art.size)}</span>
                                              {art.timestamp && <span>{formatAssetTimestamp(art.timestamp)}</span>}
                                            </div>

                                            <div className="flex items-center justify-between gap-2 border-t border-[#30363d]/50 pt-1.5">
                                              {/* Folder Selector */}
                                              <select
                                                value={getArtifactFolder(art)}
                                                onChange={(e) => {
                                                  const newFolder = e.target.value;
                                                  setFileFolderMap(prev => {
                                                    const updated = { ...prev, [art.name]: newFolder };
                                                    localStorage.setItem("assets_file_folder_map", JSON.stringify(updated));
                                                    return updated;
                                                  });
                                                  addTerminalLine(`Moved "${art.name}" to folder "${newFolder}"`, "success");
                                                }}
                                                className="bg-transparent text-[8.5px] text-zinc-400 focus:outline-none cursor-pointer max-w-[80px]"
                                              >
                                                {allAvailableFolders.filter(f => f !== "All").map((f, fIdx) => (
                                                  <option key={`f-opt-g-${f}-${fIdx}`} value={f} className="bg-[#161b22] text-zinc-300">{f}</option>
                                                ))}
                                              </select>

                                              {/* History accordion trigger */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setExpandedHistoryFile(expandedHistoryFile === art.name ? null : art.name);
                                                }}
                                                className="text-[9px] text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                                              >
                                                <History className="h-2.5 w-2.5" />
                                                <span>History ({versions.length})</span>
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Version History Accordion */}
                                        {expandedHistoryFile === art.name && (
                                          <div className="bg-[#161b22] border-t border-[#30363d] p-2.5 space-y-2 text-left w-full">
                                            <div className="flex items-center gap-1 border-b border-[#30363d]/55 pb-1 text-white text-[9.5px] font-bold">
                                              <History className="h-2.5 w-2.5 text-blue-400" />
                                              <span>Run Capture History</span>
                                            </div>
                                            {versions.length === 0 ? (
                                              <p className="text-[9px] text-[#8b949e] italic">No prior run snapshots.</p>
                                            ) : (
                                              <div className="space-y-1.5 divide-y divide-[#30363d]/45 max-h-[150px] overflow-y-auto pr-1 scrollbar-thin">
                                                {versions.map((v: any, vIdx: number) => {
                                                  const isCurrent = v.size === art.size && v.timestamp === art.timestamp;
                                                  return (
                                                    <div key={`screenshot-grid-history-${art.name}-${v.timestamp}-${vIdx}`} className="pt-1.5 first:pt-0 space-y-1 text-left">
                                                      <div className="flex items-center justify-between">
                                                        <span className="text-[9px] font-mono font-bold text-zinc-400">
                                                          Run #{versions.length - vIdx} {isCurrent && "⭐"}
                                                        </span>
                                                        <span className="text-[8px] text-zinc-500 font-mono">
                                                          {formatAssetTimestamp(v.timestamp)}
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center justify-between text-[9px]">
                                                        <input
                                                          type="text"
                                                          value={v.note || ""}
                                                          placeholder="Comment..."
                                                          onChange={(e) => {
                                                            const newNote = e.target.value;
                                                            setArtifactVersionHistory(prev => {
                                                              const next = { ...prev };
                                                              const list = [...(next[art.name] || [])];
                                                              const index = list.findIndex(item => item.timestamp === v.timestamp && item.size === v.size);
                                                              if (index !== -1) {
                                                                list[index] = { ...list[index], note: newNote };
                                                              }
                                                              next[art.name] = list;
                                                              localStorage.setItem("playwright_artifact_version_history", JSON.stringify(next));
                                                              return next;
                                                            });
                                                          }}
                                                          className="bg-transparent border-none text-blue-400 focus:outline-none focus:underline w-2/3 truncate"
                                                        />
                                                        <div className="flex items-center gap-1.5">
                                                          <button
                                                            onClick={() => {
                                                              setViewerImage(v.url);
                                                              setViewerTitle(`${art.name} (v${versions.length - vIdx})`);
                                                            }}
                                                            className="text-[8px] bg-black/40 px-1 py-0.2 rounded border border-zinc-700 text-zinc-300 hover:text-white"
                                                          >
                                                            Show
                                                          </button>
                                                          {!isCurrent && (
                                                            <button
                                                              onClick={() => setComparisonModal({
                                                                isOpen: true,
                                                                fileName: art.name,
                                                                versionA: v,
                                                                versionB: { url: art.url, timestamp: art.timestamp, size: art.size }
                                                              })}
                                                              className="text-[8px] bg-blue-900/40 border border-blue-800/60 px-1 py-0.2 rounded text-blue-300 font-semibold"
                                                            >
                                                              Compare
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* 2. PDFs Section */}
                        {(activeAssetSubTab === "all" || activeAssetSubTab === "pdf") && (() => {
                          const pdfs = filteredArtifacts.filter(a => a.type === "pdf");
                          const hasPdfs = pdfs.length > 0;

                          return (
                            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-3 text-left">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#30363d] pb-2">
                                <div className="flex items-center gap-1.5">
                                  <FileText className="h-4 w-4 text-red-400" />
                                  <span className="text-xs font-semibold text-white">PDF Printouts</span>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-400 bg-black/45 px-2 py-0.5 rounded border border-[#30363d] self-start sm:self-auto">
                                  Folder output: <code className="text-red-400 font-bold font-mono">pdf/</code>
                                </span>
                              </div>
                              <p className="text-[10px] text-[#8b949e]">
                                Save printable PDFs inside the pdf folder: <code className="font-mono bg-black/35 px-1 py-0.5 rounded text-zinc-355 select-all">{'await page.pdf({ path: "pdf/report.pdf" });'}</code>
                              </p>

                              {!hasPdfs ? (
                                <div className="border border-dashed border-[#30363d] rounded-lg p-5 text-center flex flex-col items-center justify-center text-[#8b949e]">
                                  <FileText className="h-5 w-5 mb-1 text-[#484f58]" />
                                  <p className="text-[10px] italic">No PDF reports found in {activeFolder === "All" ? "any folders" : `folder "${activeFolder}"`}.</p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {pdfs.map((art, idx) => {
                                    const versions = artifactVersionHistory[art.name] || [];
                                    return (
                                      <div key={`pdf-${art.name}-${idx}`} className="flex flex-col rounded-lg bg-[#0d1117] border border-[#30363d] shadow overflow-hidden">
                                        
                                        {/* Master PDF item row */}
                                        <div
                                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 px-3 hover:bg-black/10 transition-all group cursor-pointer gap-2"
                                          onClick={() => {
                                            setViewerPdf(art.url);
                                            setViewerTitle(art.name);
                                          }}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto text-left">
                                            <FileText className="h-4 w-4 text-red-400 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                              <span className="text-[11px] font-mono font-medium text-zinc-200 truncate group-hover:text-blue-400 transition-colors block" title={art.name}>
                                                {art.name}
                                              </span>
                                              <div className="flex items-center gap-2 text-[8px] font-mono text-zinc-500 mt-0.5">
                                                <span>Size: {formatFileSize(art.size)}</span>
                                                {art.timestamp && (
                                                  <>
                                                    <span>•</span>
                                                    <span>Updated: {formatAssetTimestamp(art.timestamp)}</span>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {/* Actions bar */}
                                          <div className="flex flex-wrap items-center justify-end gap-1.5 w-full sm:w-auto" onClick={e => e.stopPropagation()}>
                                            
                                            {/* Folder Selector */}
                                            <select
                                              value={getArtifactFolder(art)}
                                              onChange={(e) => {
                                                const newFolder = e.target.value;
                                                setFileFolderMap(prev => {
                                                  const updated = { ...prev, [art.name]: newFolder };
                                                  localStorage.setItem("assets_file_folder_map", JSON.stringify(updated));
                                                  return updated;
                                                });
                                                addTerminalLine(`Moved "${art.name}" to folder "${newFolder}"`, "success");
                                              }}
                                              className="bg-[#161b22] border border-[#30363d] rounded text-[8.5px] text-zinc-400 px-1 py-0.5 focus:outline-none cursor-pointer"
                                            >
                                              {allAvailableFolders.filter(f => f !== "All").map((f, fIdx) => (
                                                <option key={`f-opt-p-${f}-${fIdx}`} value={f} className="bg-[#161b22] text-zinc-300">{f}</option>
                                              ))}
                                            </select>

                                            {/* Versions Accordion trigger */}
                                            <button
                                              onClick={() => setExpandedHistoryFile(expandedHistoryFile === art.name ? null : art.name)}
                                              className={`flex items-center gap-0.5 px-2 py-0.5 text-[9px] rounded border transition-colors cursor-pointer ${
                                                expandedHistoryFile === art.name 
                                                  ? "bg-blue-600 border-blue-500 text-white" 
                                                  : "bg-[#161b22] border-[#30363d] text-zinc-400 hover:text-white"
                                              }`}
                                            >
                                              <History className="h-2.5 w-2.5" />
                                              <span>History ({versions.length})</span>
                                            </button>

                                            <button
                                              onClick={() => {
                                                setViewerPdf(art.url);
                                                setViewerTitle(art.name);
                                              }}
                                              className="flex items-center gap-1 px-2.5 py-0.5 text-[10px] rounded bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 transition-colors cursor-pointer font-medium"
                                            >
                                              <Eye className="h-3 w-3" />
                                              <span>Preview</span>
                                            </button>
                                            <a
                                              href={`${art.url}?download=true`}
                                              download={art.name}
                                              className="flex items-center gap-1 px-2.5 py-0.5 text-[10px] rounded bg-[#21262d] text-white border border-[#30363d] hover:bg-[#30363d] transition-colors font-medium"
                                            >
                                              <Download className="h-3 w-3" />
                                              <span>Get</span>
                                            </a>
                                          </div>
                                        </div>

                                        {/* Versions Log Accordion */}
                                        {expandedHistoryFile === art.name && (
                                          <div className="bg-[#161b22]/70 border-t border-[#30363d] p-3 space-y-2 text-left">
                                            <div className="flex items-center gap-1.5 border-b border-[#30363d]/45 pb-1.5">
                                              <History className="h-3.5 w-3.5 text-blue-400" />
                                              <span className="text-[10px] font-bold text-white">Historical PDFs Run Capture Log</span>
                                            </div>
                                            {versions.length === 0 ? (
                                              <p className="text-[9.5px] italic text-[#8b949e]">No prior run versions saved.</p>
                                            ) : (
                                              <div className="space-y-1.5 divide-y divide-[#30363d]/45">
                                                {versions.map((v: any, vIdx: number) => {
                                                  const isCurrent = v.size === art.size && v.timestamp === art.timestamp;
                                                  return (
                                                    <div key={`pdf-history-${art.name}-${v.timestamp}-${vIdx}`} className="flex items-center justify-between gap-2 pt-1.5 first:pt-0">
                                                      <div className="text-left space-y-0.5 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                          <span className="text-[9.5px] font-bold font-mono text-zinc-400 bg-black/35 px-1 py-0.1 rounded">
                                                            Run #{versions.length - vIdx}
                                                          </span>
                                                          {isCurrent && (
                                                            <span className="text-[8px] uppercase font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded-sm">
                                                              Active
                                                            </span>
                                                          )}
                                                          <span className="text-[9px] text-zinc-500">
                                                            {formatAssetTimestamp(v.timestamp)}
                                                          </span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                          <span className="text-[9px] text-zinc-500 italic">Caption:</span>
                                                          <input
                                                            type="text"
                                                            value={v.note || ""}
                                                            placeholder="Click to add note..."
                                                            onChange={(e) => {
                                                              const newNote = e.target.value;
                                                              setArtifactVersionHistory(prev => {
                                                                const next = { ...prev };
                                                                const list = [...(next[art.name] || [])];
                                                                const index = list.findIndex(item => item.timestamp === v.timestamp && item.size === v.size);
                                                                if (index !== -1) {
                                                                  list[index] = { ...list[index], note: newNote };
                                                                }
                                                                next[art.name] = list;
                                                                localStorage.setItem("playwright_artifact_version_history", JSON.stringify(next));
                                                                return next;
                                                              });
                                                            }}
                                                            className="bg-transparent hover:bg-black/30 focus:bg-[#0d1117] text-[10px] text-blue-400 focus:outline-none focus:border-zinc-700 px-1 py-0.5 rounded transition w-full max-w-[200px]"
                                                          />
                                                        </div>
                                                      </div>
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="text-[9.5px] font-mono text-zinc-500 mr-1">
                                                          {formatFileSize(v.size)}
                                                        </span>
                                                        <button
                                                          onClick={() => {
                                                            setViewerPdf(v.url);
                                                            setViewerTitle(`${art.name} (v${versions.length - vIdx})`);
                                                          }}
                                                          className="px-2 py-0.5 text-[9.5px] rounded bg-[#21262d] border border-[#30363d] text-zinc-300 hover:bg-[#30363d] hover:text-white"
                                                        >
                                                          Preview
                                                        </button>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                      {/* 3. Excel Workbook & CSV Section */}
                      {(activeAssetSubTab === "all" || activeAssetSubTab === "excel") && (
                        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#30363d] pb-2">
                            <div className="flex items-center gap-1.5">
                              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                              <span className="text-xs font-semibold text-white">Excel Sheets / CSV Reports</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 bg-black/45 px-2 py-0.5 rounded border border-[#30363d] self-start sm:self-auto">
                              Folder output: <code className="text-emerald-400 font-bold font-mono">excel/</code>
                            </span>
                          </div>
                          <p className="text-[10px] text-[#8b949e]">
                            Save excel or csv files into the excel folder. Open and inspect sheets directly here.
                          </p>
                          {filteredArtifacts.filter(a => a.type === "excel").length === 0 ? (
                            <div className="border border-dashed border-[#30363d] rounded-lg p-5 text-center flex flex-col items-center justify-center text-[#8b949e]">
                              <FileSpreadsheet className="h-5 w-5 mb-1 text-[#484f58]" />
                              <p className="text-[10px] italic">No excel sheets found in excel/ folder.</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {filteredArtifacts
                                .filter(a => a.type === "excel")
                                .map((art, idx) => (
                                  <div
                                    key={`excel-${art.name}-${idx}`}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 px-3 rounded-lg bg-[#0d1117] border border-[#30363d] shadow hover:border-blue-500 transition-all group cursor-pointer gap-2"
                                    onClick={() => {
                                      handlePreviewExcel(art.name);
                                    }}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
                                      <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
                                      <div className="min-w-0 flex-1 text-left">
                                        <span className="text-[11px] font-mono font-medium text-zinc-200 truncate group-hover:text-emerald-400 transition-colors block" title={art.name}>
                                          {art.name}
                                        </span>
                                        <div className="flex items-center gap-2 text-[8px] font-mono text-zinc-500 mt-0.5">
                                          <span>{formatFileSize(art.size)}</span>
                                          {art.timestamp && (
                                            <>
                                              <span>•</span>
                                              <span>{formatAssetTimestamp(art.timestamp)}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto" onClick={e => e.stopPropagation()}>
                                      <button
                                        onClick={() => handlePreviewExcel(art.name)}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 px-3 py-1 text-[10px] rounded bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 transition-colors cursor-pointer font-medium"
                                      >
                                        <Eye className="h-3 w-3" />
                                        <span>Preview</span>
                                      </button>
                                      <a
                                        href={`${art.url}?download=true`}
                                        download={art.name}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 px-3 py-1 text-[10px] rounded bg-[#21262d] text-white border border-[#30363d] hover:bg-[#30363d] transition-colors font-medium"
                                      >
                                        <Download className="h-3 w-3" />
                                        <span>Get</span>
                                      </a>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4. Uploaded Input Assets Section */}
                      {(activeAssetSubTab === "all" || activeAssetSubTab === "upload") && (
                        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#30363d] pb-2">
                            <div className="flex items-center gap-1.5">
                              <Upload className="h-4 w-4 text-blue-400" />
                              <span className="text-xs font-semibold text-white">Input Files / Uploads</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 bg-black/45 px-2 py-0.5 rounded border border-[#30363d] self-start sm:self-auto">
                              Folder input: <code className="text-blue-400 font-bold font-mono">uploads/</code>
                            </span>
                          </div>
                          <p className="text-[10px] text-[#8b949e]">
                            Upload datasets or assets to load in scripts using file path: <code className="font-mono bg-black/35 px-1 py-0.5 rounded text-zinc-350 select-all">fs.readFileSync("uploads/filename.ext")</code>
                          </p>

                          {/* File Upload zone */}
                          <div 
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragActive(true);
                            }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragActive(false);
                              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                handleFileUpload(e.dataTransfer.files[0]);
                              }
                            }}
                            onClick={() => document.getElementById("file-upload-input")?.click()}
                            className={`border-2 border-dashed rounded p-5 text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                              dragActive 
                                ? "bg-blue-900/10 border-blue-500 text-white scale-[0.99]" 
                                : uploading
                                ? "bg-zinc-950/20 border-[#30363d]/80 text-[#8b919e] cursor-wait"
                                : "bg-[#0d1117] border-[#30363d] hover:bg-[#0d1117]/80 hover:border-[#8b949e] hover:text-white"
                            }`}
                          >
                            <input
                              type="file"
                              className="hidden"
                              id="file-upload-input"
                              disabled={uploading}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleFileUpload(e.target.files[0]);
                                }
                              }}
                            />
                             {uploading ? (
                              <div className="w-full flex flex-col items-center justify-center py-2">
                                <RefreshCw className="h-6 w-6 mb-2 animate-spin text-blue-400" />
                                <h4 className="text-xs font-semibold text-white">Uploading & Encrypting Asset...</h4>
                                <div className="w-48 h-1 bg-[#161b22] relative overflow-hidden rounded-full mt-2.5">
                                  <div className="absolute inset-y-0 left-0 bg-blue-500 w-1/3 animate-progress h-full rounded-full" />
                                </div>
                              </div>
                            ) : (
                              <>
                                <Upload className="h-6 w-6 mb-1 text-blue-400" />
                                <h4 className="text-xs font-semibold text-white">Upload New Asset</h4>
                                <p className="text-[9.5px] text-[#8b949e] mt-1">
                                  Drag & drop files here, or <span className="text-blue-400 font-medium">click to browse</span>.
                                </p>
                              </>
                            )}
                          </div>

                          {/* Uploads list */}
                          {filteredArtifacts.filter(a => a.type === "upload").length === 0 ? (
                            <div className="border border-dashed border-[#30363d] rounded p-5 text-center text-[#8b949e]">
                              <p className="text-[10px] leading-relaxed italic animate-none">No uploaded input assets yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {filteredArtifacts
                                .filter(a => a.type === "upload")
                                .map((art, idx) => (
                                  <div
                                    key={`upload-${art.name}-${idx}`}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 px-3 rounded-lg bg-[#0d1117] border border-[#30363d] shadow hover:border-blue-500 transition-all gap-2.5"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
                                      <Upload className="h-4 w-4 text-blue-400 shrink-0" />
                                      <div className="min-w-0 text-left">
                                        <span className="text-[11px] font-mono font-medium text-zinc-200 block truncate" title={art.displayName || art.name}>
                                          {art.displayName || art.name}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8px] font-mono text-zinc-500 mt-0.5">
                                          <span>uploads/{art.displayName || art.name}</span>
                                          <span>•</span>
                                          <span>{formatFileSize(art.size)}</span>
                                          {art.timestamp && (
                                            <>
                                              <span>•</span>
                                              <span>{formatAssetTimestamp(art.timestamp)}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto shrink-0">
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(`uploads/${art.displayName || art.name}`);
                                          addTerminalLine(`Copied relative path for "${art.displayName || art.name}"`, "success");
                                        }}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-[#21262d] text-zinc-300 hover:text-white border border-[#30363d] transition-colors cursor-pointer"
                                        title="Copy script path"
                                      >
                                        <Copy className="h-3 w-3" />
                                        <span>Copy Path</span>
                                      </button>
                                      <a
                                        href={`${art.url}?download=true`}
                                        download={art.name}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-colors"
                                      >
                                        <Download className="h-3 w-3" />
                                        <span>Get</span>
                                      </a>
                                      <button
                                        onClick={(e) => handleDeleteUpload(art.name, e)}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-rose-950/40 text-rose-450 hover:bg-rose-900 hover:text-white border border-rose-900/40 transition-colors cursor-pointer"
                                        title="Delete uploaded file"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 5. Session Recordings Section */}
                      {(activeAssetSubTab === "all" || activeAssetSubTab === "video") && (
                        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[#30363d] pb-2">
                            <div className="flex items-center gap-1.5">
                              <Video className="h-4 w-4 text-purple-400" />
                              <span className="text-xs font-semibold text-white">Session Video Recordings</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 bg-black/45 px-2 py-0.5 rounded border border-[#30363d] self-start sm:self-auto">
                              Folder destination: <code className="text-purple-400 font-bold font-mono">videos/</code>
                            </span>
                          </div>
                          <p className="text-[10px] text-[#8b949e]">
                            Session recordings are compiled in WebM video formats automatically at context closing if <span className="font-semibold text-white">Record Session</span> is enabled before running the script.
                          </p>

                          {filteredArtifacts.filter(a => a.type === "video").length === 0 ? (
                            <div className="border border-dashed border-[#30363d] rounded p-5 text-center text-[#8b949e]">
                              <p className="text-[10px] leading-relaxed italic animate-none">No session video recordings yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {filteredArtifacts
                                .filter(a => a.type === "video")
                                .map((art, idx) => (
                                  <div
                                    key={`video-${art.name}-${idx}`}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 px-3 rounded-lg bg-[#0d1117] border border-[#30363d] shadow hover:border-purple-500 transition-all gap-2.5"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
                                      <Video className="h-4 w-4 text-purple-400 shrink-0" />
                                      <div className="min-w-0 text-left">
                                        <span className="text-[11px] font-mono font-medium text-zinc-200 block truncate" title={art.name}>
                                          {art.name}
                                        </span>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8px] font-mono text-zinc-500 mt-0.5">
                                          <span>videos/{art.name}</span>
                                          <span>•</span>
                                          <span>{formatFileSize(art.size)}</span>
                                          {art.timestamp && (
                                            <>
                                              <span>•</span>
                                              <span>{formatAssetTimestamp(art.timestamp)}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto shrink-0">
                                      <button
                                        onClick={() => {
                                          setViewerVideo(art.url);
                                          setViewerVideoTitle(art.name);
                                        }}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] rounded bg-[#21262d] text-zinc-300 hover:text-white border border-[#30363d] hover:bg-[#30363d] transition-colors cursor-pointer"
                                        title="Play the recorded browser session video inside high-fidelity player"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        <span>Play Video</span>
                                      </button>
                                      <a
                                        href={`${art.url}?download=true`}
                                        download={art.name}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] rounded bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-colors"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        <span>Download</span>
                                      </a>
                                      <button
                                        onClick={(e) => handleDeleteUpload(art.name, e, "video")}
                                        className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] rounded bg-rose-950/40 text-rose-450 hover:bg-rose-900 hover:text-white border border-rose-900/40 transition-colors cursor-pointer"
                                        title="Delete recording file"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Delete</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            </>
          )}
        </section>
          </div>

          {/* Console Resize Handle (Desktop only) */}
          {!isFullscreenEditor && !isFullscreenPreview && !isConsoleCollapsed && (
            <div
              onMouseDown={startResizeConsole}
              className={`hidden md:block h-1.5 hover:h-2 hover:bg-blue-500/80 transition-all cursor-row-resize select-none w-full z-10 shrink-0 bg-transparent border-t border-[#30363d] relative`}
              title="Drag to resize console"
            >
              {isResizingConsole && (
                <div className="absolute inset-0 bg-blue-500 pointer-events-none" />
              )}
            </div>
          )}

          {/* Console Output Footer (Integrated) */}
          <div 
            className={`flex flex-col bg-[#161b22] ${
              (isFullscreenEditor || isFullscreenPreview) ? "hidden" : "md:flex"
            } ${
              mobileActiveView === "console" ? "flex flex-grow h-full min-h-0 w-full" : "hidden"
            }`} 
            style={!isFullscreenEditor && !isFullscreenPreview && !isMobile ? { 
              height: isConsoleCollapsed ? "32px" : `${consoleHeight}px`, 
              minHeight: isConsoleCollapsed ? "32px" : `${consoleHeight}px` 
            } : undefined}
            id="bottom-console"
          >
            
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-[#30363d] bg-[#0d1117] shrink-0 font-sans">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 bg-black/40 border border-[#30363d] rounded-md p-0.5 select-none mr-2">
                  <button
                    onClick={() => setConsoleTab("scripts")}
                    className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1 ${
                      consoleTab === "scripts"
                        ? "bg-[#30363d] text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>Scripts Logs</span>
                    {terminalLines.filter(l => l.source === "script" || !l.source).length > 0 && (
                      <span className="px-1 py-0.2 text-[8px] bg-zinc-700 text-zinc-300 rounded font-mono font-bold">
                        {terminalLines.filter(l => l.source === "script" || !l.source).length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setConsoleTab("browser")}
                    className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1 ${
                      consoleTab === "browser"
                        ? "bg-[#30363d] text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>Browser Logs</span>
                    {terminalLines.filter(l => l.source === "browser").length > 0 && (
                      <span className="px-1 py-0.2 text-[8px] bg-amber-600/35 border border-amber-500/30 text-amber-400 rounded font-mono font-bold">
                        {terminalLines.filter(l => l.source === "browser").length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setConsoleTab("network")}
                    className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1 ${
                      consoleTab === "network"
                        ? "bg-[#30363d] text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>Network Logs</span>
                    {networkLogs.length > 0 && (
                      <span className="px-1.5 py-0.2 text-[8px] bg-blue-600/35 border border-blue-500/30 text-blue-400 rounded font-mono font-bold">
                        {networkLogs.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setConsoleTab("cookies")}
                    className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1 ${
                      consoleTab === "cookies"
                        ? "bg-[#30363d] text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <span>Cookies</span>
                    {browserCookies.length > 0 && (
                      <span className="px-1 py-0.2 text-[8px] bg-emerald-600/35 border border-emerald-500/30 text-emerald-400 rounded font-mono font-bold">
                        {browserCookies.length}
                      </span>
                    )}
                  </button>
                </div>

                {(consoleTab === "scripts" || consoleTab === "browser") && (
                  <div className="flex items-center gap-2">
                    {/* Text Filter Input with integrated Regex filter mode trigger */}
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={consoleFilterText}
                        onChange={(e) => setConsoleFilterText(e.target.value)}
                        placeholder={consoleUseRegex ? "Regex filter..." : "Filter logs..."}
                        className={`bg-[#161b22] text-xs text-white placeholder-zinc-550 border rounded pl-2 pr-7 py-0.5 w-28 sm:w-40 focus:outline-none transition font-sans ${
                          isConsoleRegexInvalid 
                            ? "border-rose-600 focus:border-rose-500" 
                            : "border-[#30363d] focus:border-zinc-500"
                        }`}
                      />
                      <button
                        onClick={() => setConsoleUseRegex(prev => !prev)}
                        title="Toggle Regular Expression Mode (.*)"
                        className={`absolute right-1 px-1 py-0.2 rounded text-[9.5px] font-mono leading-none transition select-none ${
                          consoleUseRegex 
                            ? "bg-blue-600/35 text-blue-400 border border-blue-500/50" 
                            : "text-[#8b949e] hover:text-white"
                        }`}
                      >
                        .*
                      </button>
                    </div>

                    {/* Severity Dropdown Select */}
                    <select
                      value={consoleSeverityFilter}
                      onChange={(e) => setConsoleSeverityFilter(e.target.value as any)}
                      className="bg-[#161b22] text-[10px] text-zinc-300 border border-[#30363d] rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-zinc-550 transition font-sans"
                    >
                      <option value="all">All Levels</option>
                      <option value="log">Log</option>
                      <option value="info">Info</option>
                      <option value="error">Error</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                    </select>

                    {(consoleFilterText || consoleSeverityFilter !== "all" || consoleUseRegex) && (
                      <button
                        onClick={() => {
                          setConsoleFilterText("");
                          setConsoleSeverityFilter("all");
                          setConsoleUseRegex(false);
                        }}
                        className="text-[9px] text-[#58a6ff] hover:underline font-semibold"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {consoleTab === "network" && (
                  <div className="flex items-center gap-2">
                    {/* Network Filter controls */}
                    <input
                      type="text"
                      value={networkFilterText}
                      onChange={(e) => setNetworkFilterText(e.target.value)}
                      placeholder="Filter URL..."
                      className="bg-[#161b22] text-xs text-white placeholder-zinc-550 border border-[#30363d] rounded px-2 py-0.5 w-28 sm:w-40 focus:outline-none focus:border-zinc-500 transition font-sans"
                    />
                    
                    <select
                      value={networkTypeFilter}
                      onChange={(e) => setNetworkTypeFilter(e.target.value)}
                      className="bg-[#161b22] text-[10px] text-zinc-300 border border-[#30363d] rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-zinc-550 transition font-sans"
                    >
                      <option value="all">All Types</option>
                      <option value="document">Document</option>
                      <option value="fetch">Fetch/XHR</option>
                      <option value="stylesheet">CSS</option>
                      <option value="script">JS</option>
                      <option value="image">Image</option>
                      <option value="other">Other</option>
                    </select>

                    {(networkFilterText || networkTypeFilter !== "all") && (
                      <button
                        onClick={() => {
                          setNetworkFilterText("");
                          setNetworkTypeFilter("all");
                        }}
                        className="text-[9px] text-[#58a6ff] hover:underline font-semibold"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}
              </div>
 
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setConsoleClearType(consoleTab);
                    setShowConsoleClearConfirm(true);
                  }}
                  className="text-[#8b949e] hover:text-white hover:bg-[#161b22] p-1 rounded transition cursor-pointer"
                  title={
                    consoleTab === "scripts"
                      ? "Clear script logs"
                      : consoleTab === "browser"
                      ? "Clear browser console logs"
                      : consoleTab === "network"
                      ? "Clear network logs"
                      : "Clear cookies"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                
                {!isMobile && (
                  <button
                    onClick={toggleConsoleCollapsed}
                    className="text-[#8b949e] hover:text-white hover:bg-[#161b12] p-1 rounded transition cursor-pointer flex items-center justify-center shrink-0"
                    title={isConsoleCollapsed ? "Expand Console Output Panel" : "Collapse Console Output Panel"}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transform transition-transform duration-200 ${isConsoleCollapsed ? "rotate-180 text-amber-400" : ""}`} />
                  </button>
                )}
              </div>
            </div>

            {!isConsoleCollapsed && (consoleTab === "scripts" || consoleTab === "browser") && (
              <div className="flex-grow flex-1 p-3 font-mono text-[11.5px] overflow-y-auto space-y-1 bg-[#0d1117]" id="terminal-screen">
              {/* Playwright Install Alert Notification Banner */}
              {(() => {
                const hasMissingBrowser = terminalLines.some(line => 
                  line.message.includes("Executable doesn't exist") || 
                  line.message.includes("browserType.launch: Executable doesn't exist") ||
                  line.message.includes("Please run the following command to download new browsers")
                );
                
                const isInitialized = terminalLines.some(line => 
                  line.message.includes("Browsers successfully initialized!")
                );

                if (hasMissingBrowser) {
                  if (isInitialized) {
                    return (
                      <div className="static mx-0 mb-3 bg-emerald-955/25 border border-emerald-800/65 rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                        <div className="flex items-start gap-2.5 text-xs text-emerald-250">
                          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                          <div>
                            <p className="font-bold text-emerald-300">Playwright Browsers Initialized</p>
                            <p className="text-zinc-400 text-[11px] mt-0.5 select-text">
                              Executable binaries are available! You are ready to run the scripts.
                            </p>
                          </div>
                        </div>
                        <div className="px-2.5 py-1 bg-emerald-900/40 border border-emerald-800 text-emerald-300 font-semibold text-[10px] rounded whitespace-nowrap shrink-0 flex items-center gap-1 select-none">
                          <Check className="h-3 w-3" />
                          <span>Ready</span>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="sticky top-0 z-20 shadow-lg bg-[#161b22]/95 border border-amber-800/85 rounded p-4 mb-3 flex flex-col gap-3 font-sans backdrop-blur-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-1.5 sm:gap-2.5 text-xs text-amber-250">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                            <div>
                              <p className="font-bold text-amber-300">Playwright Browsers Missing</p>
                              <p className="text-zinc-400 text-[11px] mt-0.5 select-text">
                                Executable binaries are missing for Playwright. Stand up server environment browsers by initializing.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleInitializePlaywright}
                            disabled={initializingPlaywright}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900 border border-amber-700/60 hover:border-amber-500 disabled:border-transparent text-black disabled:text-zinc-550 font-bold text-xs rounded transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
                          >
                            {initializingPlaywright ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                <span>Installing Binaries...</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3" />
                                <span>Start Initialization</span>
                              </>
                            )}
                          </button>
                        </div>
                        {initializingPlaywright && (
                          <div className="flex flex-col gap-1.5 mt-1 border-t border-amber-900/30 pt-2 text-[10px] font-mono text-amber-200">
                            <div className="flex items-center justify-between">
                              <span>Downloading chromium, firefox & webkit browser binaries...</span>
                              <span className="animate-pulse font-bold text-amber-400">ACTIVE SETUP</span>
                            </div>
                            <div className="w-full h-1 bg-[#0d1117] relative overflow-hidden rounded-full">
                              <div className="absolute inset-y-0 left-0 bg-amber-500 w-1/3 animate-progress h-full rounded-full" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {(() => {
                const filtered = terminalLines.filter(line => {
                  const lineSource = line.source || "script";
                  const tabSource = consoleTab === "scripts" ? "script" : "browser";
                  if (lineSource !== tabSource) return false;

                  const textSearch = consoleFilterText.trim();
                  let matchesText = true;
                  if (textSearch) {
                    if (consoleUseRegex) {
                      try {
                        const regex = new RegExp(textSearch, "i");
                        matchesText = regex.test(line.message);
                      } catch {
                        matchesText = false;
                      }
                    } else {
                      matchesText = line.message.toLowerCase().includes(textSearch.toLowerCase());
                    }
                  }
                  const matchesSeverity = consoleSeverityFilter === "all" || line.type === consoleSeverityFilter;
                  return matchesText && matchesSeverity;
                });

                const sourceTotalCount = terminalLines.filter(line => (line.source || "script") === (consoleTab === "scripts" ? "script" : "browser")).length;

                if (sourceTotalCount === 0) {
                  return (
                    <div className="text-[#8b949e] text-[11px] italic">
                      {consoleTab === "scripts" 
                        ? '[System] Script logs standing by. Press "Run Script" to stream execution logs...' 
                        : '[System] Browser console is empty. Navigating or interactions in the script may stream browser console logs here...'}
                    </div>
                  );
                }

                if (filtered.length === 0) {
                  return (
                    <div className="text-zinc-500 text-[11px] italic py-2">
                      [No log lines matches: severity="{consoleSeverityFilter}", search="{consoleFilterText}"]
                    </div>
                  );
                }

                return filtered.map((line, idx) => (
                  <div key={`term-line-${line.id || 'no-id'}-${idx}`} className="flex gap-2 items-start text-xs select-text">
                    <span className="text-[#8b949e] select-none text-[10px] pt-0.5">
                      [{line.timestamp}]
                    </span>
                    <span
                      className={`break-all leading-normal ${
                        line.type === "error"
                          ? "text-[#f85149]"
                          : line.type === "success"
                          ? "text-[#3fb950]"
                          : line.type === "warning"
                          ? "text-[#d29922]"
                          : line.type === "info"
                          ? "text-[#58a6ff]"
                          : "text-[#c9d1d9]"
                      }`}
                    >
                      {line.message}
                    </span>
                  </div>
                ));
              })()}
              <div ref={terminalEndRef} />
            </div>
          )}

          {!isConsoleCollapsed && consoleTab === "network" && (
            <div className="flex-grow flex-1 flex flex-col md:flex-row min-h-0 bg-[#0d1117] overflow-hidden" id="network-panel">
              {/* Left/Main Side: Network logs list */}
              <div className="flex-grow flex flex-col min-h-0 overflow-y-auto border-r border-[#30363d]/50">
                <div className="min-w-full inline-block align-middle">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="border-b border-[#30363d] bg-[#161b22] text-[#8b949e] font-semibold text-[10px] uppercase select-none sticky top-0 z-10">
                        <th className="p-2 w-16">Status</th>
                        <th className="p-2 w-16">Method</th>
                        <th className="p-2">Name / URL</th>
                        <th className="p-2 w-20">Type</th>
                        <th className="p-2 w-20 text-right">Time</th>
                        <th className="p-2 w-24 text-right">Captured</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363d]/30 font-mono text-[11px]">
                      {(() => {
                        const filteredNetwork = networkLogs.filter(item => {
                          // Text filter
                          const textSearch = networkFilterText.trim().toLowerCase();
                          const matchesText = !textSearch || item.url.toLowerCase().includes(textSearch);
                          
                          // Type filter
                          let matchesType = true;
                          if (networkTypeFilter !== "all") {
                            if (networkTypeFilter === "fetch") {
                              matchesType = ["fetch", "xhr"].includes(item.resourceType);
                            } else {
                              matchesType = item.resourceType === networkTypeFilter;
                            }
                          }
                          return matchesText && matchesType;
                        });

                        if (filteredNetwork.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-zinc-500 italic font-sans text-xs">
                                {networkLogs.length === 0 
                                  ? "No network traffic captured yet. Run a script to stream browser request logs." 
                                  : "No matching network requests found."}
                              </td>
                            </tr>
                          );
                        }

                        return filteredNetwork.map((item, idx) => {
                          const isSelected = selectedNetworkLog?.id === item.id;
                          const isPending = item.status === undefined;
                          const isFailed = item.status === 0;

                          // Truncate URL elegantly
                          let displayName = item.url;
                          try {
                            const parsed = new URL(item.url);
                            const pathname = parsed.pathname + parsed.search;
                            if (pathname === "/") {
                              displayName = parsed.host;
                            } else {
                              displayName = parsed.host + (pathname.length > 50 ? pathname.substring(0, 50) + "..." : pathname);
                            }
                          } catch {
                            if (displayName.length > 60) {
                              displayName = displayName.substring(0, 60) + "...";
                            }
                          }

                          return (
                            <tr
                              key={`network-${item.id || 'no-id'}-${idx}`}
                              onClick={() => setSelectedNetworkLog(item)}
                              className={`cursor-pointer transition-colors ${
                                isSelected 
                                  ? "bg-[#1f242c]" 
                                  : "hover:bg-[#161b22]/50"
                              }`}
                            >
                              <td className="p-2">
                                {isPending ? (
                                  <span className="text-zinc-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                                    <span>Pending</span>
                                  </span>
                                ) : isFailed ? (
                                  <span className="text-rose-500 font-bold">Failed</span>
                                ) : (
                                  <span className={`font-bold ${
                                    item.status >= 200 && item.status < 300 
                                      ? "text-[#3fb950]" 
                                      : item.status >= 300 && item.status < 400
                                      ? "text-amber-500"
                                      : "text-[#f85149]"
                                  }`}>
                                    {item.status}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-zinc-850 text-zinc-300">
                                  {item.method}
                                </span>
                              </td>
                              <td className="p-2 max-w-[200px] sm:max-w-[400px] truncate text-zinc-200" title={item.url}>
                                {displayName}
                              </td>
                              <td className="p-2 capitalize text-zinc-400 text-[10px]">
                                {item.resourceType}
                              </td>
                              <td className="p-2 text-right text-zinc-400">
                                {item.duration !== undefined ? `${item.duration}ms` : "-"}
                              </td>
                              <td className="p-2 text-right text-zinc-500 text-[10px]">
                                {item.timestamp}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Side: Network request inspector details pane */}
              {selectedNetworkLog && (
                <div className="w-full md:w-[420px] bg-[#161b22] border-t md:border-t-0 md:border-l border-[#30363d] flex flex-col shrink-0 font-sans p-3 overflow-y-auto">
                  <div className="flex items-center justify-between pb-2 border-b border-[#30363d] mb-3">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                      Request Details
                    </span>
                    <button
                      onClick={() => setSelectedNetworkLog(null)}
                      className="text-zinc-500 hover:text-white text-xs px-1.5 py-0.5 hover:bg-[#30363d] rounded transition cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-zinc-300">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Request URL</div>
                      <div className="p-2 bg-[#0d1117] border border-[#30363d] rounded text-[10.5px] font-mono break-all select-all text-zinc-200">
                        {selectedNetworkLog.url}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Request Method</div>
                        <div className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded font-mono text-zinc-200">
                          {selectedNetworkLog.method}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Resource Type</div>
                        <div className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded font-mono capitalize text-zinc-200">
                          {selectedNetworkLog.resourceType}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Status</div>
                        <div className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded font-mono text-zinc-200">
                          {selectedNetworkLog.status === undefined ? (
                            <span className="text-yellow-500 font-semibold">Pending</span>
                          ) : selectedNetworkLog.status === 0 ? (
                            <span className="text-rose-500 font-bold">Failed</span>
                          ) : (
                            <span className={selectedNetworkLog.status >= 200 && selectedNetworkLog.status < 300 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              {selectedNetworkLog.status} {selectedNetworkLog.statusText || ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Response Time</div>
                        <div className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded font-mono text-zinc-200">
                          {selectedNetworkLog.duration !== undefined ? `${selectedNetworkLog.duration}ms` : "-"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">Captured At</div>
                      <div className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded font-mono text-zinc-200">
                        {selectedNetworkLog.timestamp}
                      </div>
                    </div>

                    {selectedNetworkLog.headers && Object.keys(selectedNetworkLog.headers).length > 0 && (
                      <div className="pt-2 border-t border-[#30363d]/50">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Response Headers</div>
                        <div className="p-2 bg-[#0d1117] border border-[#30363d] rounded text-[9.5px] font-mono overflow-x-auto max-h-[150px] overflow-y-auto divide-y divide-[#161b22]">
                          {Object.entries(selectedNetworkLog.headers).map(([k, v], hIdx) => (
                            <div key={`net-header-${k}-${hIdx}`} className="py-0.5 flex gap-1 select-all">
                              <span className="text-zinc-500 shrink-0 font-bold">{k}:</span>
                              <span className="text-zinc-300 break-all">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#30363d]/50">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Response Body</div>
                      {selectedNetworkLog.body ? (
                        <div className="p-2 bg-[#0d1117] border border-[#30363d] rounded text-[10px] font-mono overflow-x-auto max-h-[220px] overflow-y-auto break-all whitespace-pre-wrap select-all text-zinc-300">
                          {selectedNetworkLog.body}
                        </div>
                      ) : (
                        <div className="p-2 bg-[#0d1117] border border-[#30363d] rounded text-[10px] italic text-zinc-500 select-none">
                          No response body captured. Only "document", "fetch", and "xhr" types are eligible for body text streaming.
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-[#30363d]/50">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Diagnostic Context</div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed">
                        This request was completed inside the virtualized Playwright headless browser session. Traffic is routed through local proxies for visual rendering and trace auditing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isConsoleCollapsed && consoleTab === "cookies" && (
            <div className="flex-grow flex-1 flex flex-col min-h-0 bg-[#0d1117] overflow-hidden" id="cookies-panel">
              <div className="flex-grow overflow-auto p-4">
                <div className="max-w-full overflow-x-auto rounded-lg border border-[#30363d] bg-[#161b22]/45">
                  <table className="w-full border-collapse text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-[#30363d] bg-black/40 text-zinc-400 font-bold select-none text-[10.5px]">
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Value</th>
                        <th className="p-2.5">Domain</th>
                        <th className="p-2.5">Path</th>
                        <th className="p-2.5">Expires</th>
                        <th className="p-2.5 text-center">HttpOnly</th>
                        <th className="p-2.5 text-center">Secure</th>
                        <th className="p-2.5">SameSite</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363d] font-mono text-[11px] text-zinc-300">
                      {browserCookies.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-zinc-500 italic font-sans text-xs">
                            No browser cookies captured yet. Run a script to navigate and record cookies.
                          </td>
                        </tr>
                      ) : (
                        browserCookies.map((cookie, idx) => {
                          const expiresDate = cookie.expires === -1 
                            ? "Session" 
                            : typeof cookie.expires === "number"
                            ? new Date(cookie.expires * 1000).toLocaleString()
                            : String(cookie.expires || "Session");

                          return (
                            <tr key={`${cookie.name}-${idx}`} className="hover:bg-[#161b22]/60 transition-colors">
                              <td className="p-2.5 font-bold text-amber-400 select-all">{cookie.name}</td>
                              <td className="p-2.5 max-w-[240px] truncate select-all text-zinc-200" title={cookie.value}>
                                {cookie.value}
                              </td>
                              <td className="p-2.5 text-zinc-400 select-all">{cookie.domain}</td>
                              <td className="p-2.5 text-zinc-400">{cookie.path}</td>
                              <td className="p-2.5 text-zinc-400 text-[10px] whitespace-nowrap">{expiresDate}</td>
                              <td className="p-2.5 text-center">
                                {cookie.httpOnly ? (
                                  <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold rounded bg-blue-950/40 border border-blue-900/60 text-blue-400 font-sans">
                                    HttpOnly
                                  </span>
                                ) : (
                                  <span className="text-zinc-650 font-bold text-[10px] select-none">-</span>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                {cookie.secure ? (
                                  <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold rounded bg-emerald-955/25 border border-emerald-900/60 text-emerald-400 font-sans">
                                    Secure
                                  </span>
                                ) : (
                                  <span className="text-zinc-650 font-bold text-[10px] select-none">-</span>
                                )}
                              </td>
                              <td className="p-2.5 text-zinc-400 text-[10.5px] uppercase font-sans">
                                {cookie.sameSite || "Lax"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          </div>
        </section>
      </div>

      {/* Bottom Status Bar */}
      {!isFullscreenEditor && (
      <footer className="h-auto py-1 sm:py-0 sm:h-6 bg-[#161b22] border border-[#30363d] rounded-md text-white text-[10px] flex flex-wrap sm:flex-nowrap items-center px-3 justify-between shrink-0 font-mono gap-y-1.5 gap-x-3">
        {/* Left section: Status, Active Script and Engine info */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 overflow-hidden">
          {/* Status Pill */}
          {(() => {
            let badgeBg = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
            let pulseColor = "bg-emerald-500";
            let label = "Ready";
            let icon = <Check className="h-3 w-3" />;
            
            if (status === "connecting") {
              badgeBg = "bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse";
              pulseColor = "bg-blue-500";
              label = "Connecting";
              icon = <RefreshCw className="h-2.5 w-2.5 animate-spin" />;
            } else if (status === "running") {
              badgeBg = "bg-amber-500/10 border-amber-500/30 text-amber-400";
              pulseColor = "bg-amber-500";
              label = "Running";
              icon = <Play className="h-2.5 w-2.5 text-amber-400 fill-amber-400/20" />;
            } else if (status === "completed") {
              badgeBg = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
              pulseColor = "bg-emerald-500";
              label = "Completed";
              icon = <CheckCircle className="h-2.5 w-2.5" />;
            } else if (status === "error") {
              badgeBg = "bg-rose-500/10 border-rose-500/30 text-rose-400";
              pulseColor = "bg-rose-500";
              label = "Error";
              icon = <AlertTriangle className="h-2.5 w-2.5" />;
            } else if (status === "stopped") {
              badgeBg = "bg-zinc-500/10 border-zinc-700 text-zinc-400";
              pulseColor = "bg-zinc-500";
              label = "Stopped";
              icon = <XCircle className="h-2.5 w-2.5" />;
            }

            return (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${badgeBg} font-semibold shrink-0`}>
                <span className="relative flex h-1.5 w-1.5">
                  {status === "running" || status === "connecting" ? (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseColor}`}></span>
                  ) : null}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${pulseColor}`}></span>
                </span>
                {icon}
                <span className="uppercase text-[9px] tracking-wider">{label}</span>
              </div>
            );
          })()}

          {/* Current Script Name & unsaved indicator */}
          <div className="flex items-center gap-1.5 text-zinc-400 shrink-0 border-l border-[#30363d] pl-2.5 sm:pl-4">
            <FileCode className="h-3 w-3 text-zinc-500" />
            <span className="max-w-[120px] sm:max-w-[200px] truncate text-zinc-300 font-medium">
              {scriptName || "Untitled Script"}
            </span>
            {hasUnsavedChanges ? (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved local modifications" />
            ) : null}
          </div>

          {/* Engine indicators */}
          <div className="hidden md:flex items-center gap-3 text-zinc-500 border-l border-[#30363d] pl-4">
            <span className="hover:text-zinc-300 transition-colors">Playwright v1.40.1</span>
            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span className="hover:text-zinc-300 transition-colors">Node v22.14</span>
            <span className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span className="hover:text-zinc-300 transition-colors">Chromium</span>
          </div>
        </div>

        {/* Right section: cursor position, and connection status */}
        <div className="flex items-center gap-3 ml-auto sm:ml-0 text-zinc-400 shrink-0">
          {/* Cursor info for active coding */}
          <div className="hidden xs:block text-zinc-500 font-mono text-[9px] select-none">
            Ln {cursorPos.line}, Col {cursorPos.column}
          </div>

          {/* Server Connection status */}
          <div className="flex items-center gap-1.5 border-l border-[#30363d] pl-2.5 sm:pl-4 py-0.5 shrink-0">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-zinc-400 text-[9px] hidden sm:inline uppercase font-bold tracking-wider">Online</span>
          </div>
        </div>
      </footer>
      )}

      {/* Full screen Image Viewer Modal */}
      <AnimatePresence>
        {viewerImage && (
          <motion.div
            key="viewer-image-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-black/90 p-4 backdrop-blur-md"
            onClick={() => setViewerImage(null)}
          >
            {/* Top action bar */}
            <div 
              className="flex items-center justify-between w-full p-2 text-white border-b border-[#30363d] bg-[#161b22] rounded"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-blue-400" />
                <span className="font-mono text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-md">{viewerTitle}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <a
                  href={viewerImage}
                  download={viewerTitle}
                  className="px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded text-xs text-[#c9d1d9] hover:text-white hover:bg-[#30363d] flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download PNG</span>
                </a>
                <button
                  onClick={() => setViewerImage(null)}
                  className="p-1 px-2.5 bg-[#da3633] hover:bg-[#f85149] rounded text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Main image context wrapper */}
            <div className="flex-grow flex items-center justify-center p-2 sm:p-6 overflow-hidden">
              <motion.img
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                src={viewerImage}
                alt={viewerTitle}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain rounded-lg border border-[#30363d] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Bottom informational bar */}
            <div 
              className="text-center text-[11px] text-[#8b949e] font-mono py-1"
              onClick={(e) => e.stopPropagation()}
            >
              Press <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-white font-sans text-[10px]">ESC</kbd> or click background to close.
            </div>
          </motion.div>
        )}

        {/* Dynamic PDF Viewer Modal */}
        {viewerPdf && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-black/90 p-4 backdrop-blur-md"
            onClick={() => setViewerPdf(null)}
          >
            {/* Top action bar */}
            <div 
              className="flex items-center justify-between w-full p-2 text-white border-b border-[#30363d] bg-[#161b22] rounded shrink-0 mb-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-400" />
                <span className="font-mono text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-md">{viewerTitle} (PDF Preview)</span>
              </div>
              
              <div className="flex items-center gap-2">
                <a
                  href={`${viewerPdf}?download=true`}
                  download={viewerTitle}
                  className="px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded text-xs text-[#c9d1d9] hover:text-white hover:bg-[#30363d] flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download PDF</span>
                </a>
                <button
                  onClick={() => setViewerPdf(null)}
                  className="p-1 px-2.5 bg-[#da3633] hover:bg-[#f85149] rounded text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Main iframe context wrapper */}
            <div className="flex-grow flex flex-col bg-white rounded-lg overflow-hidden border border-[#30363d] p-0" onClick={(e) => e.stopPropagation()}>
              <iframe
                src={`${viewerPdf}#toolbar=0&navpanes=0`}
                className="w-full h-full border-0"
                title={viewerTitle}
              />
            </div>

            {/* Bottom informational bar */}
            <div 
              className="text-center text-[10px] text-[#8b949e] font-mono py-1"
              onClick={(e) => e.stopPropagation()}
            >
              If preview is blank, please update your browser's PDF reader permission, or click <a href={`${viewerPdf}?download=true`} download={viewerTitle} className="text-blue-400 underline">Download</a>.
            </div>
          </motion.div>
        )}

        {/* Dynamic Excel Sheet Viewer Modal */}
        {viewerExcel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-black/90 p-4 backdrop-blur-md"
            onClick={() => setViewerExcel(null)}
          >
            {/* Top action bar */}
            <div 
              className="flex items-center justify-between w-full p-2 text-white border-b border-[#30363d] bg-[#161b22] rounded shrink-0 mb-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                <span className="font-mono text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-md">{viewerTitle} (Excel/CSV Viewer)</span>
              </div>
              
              <div className="flex items-center gap-2">
                <a
                  href={`/excel/${encodeURIComponent(viewerExcel.name)}`}
                  download={viewerExcel.name}
                  className="px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded text-xs text-[#c9d1d9] hover:text-white hover:bg-[#30363d] flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download File</span>
                </a>
                <button
                  onClick={() => setViewerExcel(null)}
                  className="p-1 px-2.5 bg-[#da3633] hover:bg-[#f85149] rounded text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Excel spreadsheet rendering */}
            <ExcelPreviewerContent fileData={viewerExcel} />

            {/* Bottom informational bar */}
            <div 
              className="text-center text-[10px] text-[#8b949e] font-mono py-1"
              onClick={(e) => e.stopPropagation()}
            >
              Showing first 200 rows of each worksheet. Grid lines and formula values are computed dynamically.
            </div>
          </motion.div>
        )}

        {/* Dynamic Video Player Viewer Modal */}
        {viewerVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 p-4 backdrop-blur-sm"
            onClick={() => setViewerVideo(null)}
          >
            {/* Top action bar */}
            <div 
              className="flex items-center justify-between w-full p-2 text-white border-b border-[#30363d] bg-[#161b22] rounded shrink-0 mb-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-purple-400" />
                <span className="font-mono text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-md">{viewerVideoTitle}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <a
                  href={`${viewerVideo}?download=true`}
                  download={viewerVideoTitle}
                  className="px-3 py-1.5 bg-[#21262d] border border-[#30363d] rounded text-xs text-[#c9d1d9] hover:text-white hover:bg-[#30363d] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download Video</span>
                </a>
                <button
                  onClick={() => setViewerVideo(null)}
                  className="p-1 px-2.5 bg-[#da3633] hover:bg-[#f85149] rounded text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Main Video element display context wrapper */}
            <div className="flex-grow flex items-center justify-center p-2 sm:p-6 overflow-hidden bg-black/40 rounded-lg border border-[#30363d] shadow-inner" onClick={(e) => e.stopPropagation()}>
              <video
                src={viewerVideo}
                controls
                autoPlay
                className="max-h-[75vh] max-w-full rounded-md border border-[#30363d]/80 bg-[#0d1117] shadow-2xl"
                style={{ outline: "none" }}
              />
            </div>

            {/* Bottom informational bar */}
            <div 
              className="text-center text-[10px] text-[#8b949e] font-mono py-1"
              onClick={(e) => e.stopPropagation()}
            >
              Playwright automated browser session video playback. Press <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-white font-sans text-[10px]">ESC</kbd> or click background to close.
            </div>
          </motion.div>
        )}

        {/* Excel Loader Spinner Overlay */}
        {viewerExcelLoading && (
          <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 flex flex-col items-center gap-3 max-w-xs text-center shadow-2xl">
              <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin" />
              <p className="font-semibold text-white text-xs">Parsing Spreadsheet...</p>
              <p className="text-[10px] text-zinc-400">Reading worksheet columns, calculating cell structures and compiling table views.</p>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Side-by-Side Version Diff Comparison Modal */}
      <AnimatePresence>
        {compareSnapshot && (
          <motion.div
            key="compare-snapshot-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-[#30363d] w-full max-w-6xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-none"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#161b22]">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Comparing project with: <span className="font-mono text-blue-400">v-{compareSnapshot.versionId}</span>
                  </h3>
                  <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                    ({new Date(compareSnapshot.updatedAt).toLocaleString()})
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      if (compareSnapshot.files && compareSnapshot.files.length > 0) {
                        setWorkspaceFiles(compareSnapshot.files);
                        const mainFile = compareSnapshot.files.find(f => f.name === "main.js") || compareSnapshot.files[0];
                        setActiveFileName(mainFile.name);
                        setCurrentCode(mainFile.code);
                      } else {
                        setWorkspaceFiles([{ name: "main.js", code: compareSnapshot.code }]);
                        setActiveFileName("main.js");
                        setCurrentCode(compareSnapshot.code);
                      }
                      addTerminalLine(`Restored entire project workspace from snapshot version [v-${compareSnapshot.versionId}]`, "warning");
                      setCompareSnapshot(null);
                    }}
                    className="px-3 py-1.5 bg-amber-900 hover:bg-amber-800 text-amber-100 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    Restore This Snapshot
                  </button>
                  <button
                    onClick={() => setCompareSnapshot(null)}
                    className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] rounded text-xs font-medium transition-all cursor-pointer hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* File Selector Tab Bar */}
              {(() => {
                const snapshotFiles = compareSnapshot.files || [{ name: "main.js", code: compareSnapshot.code }];
                return (
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-[#161b22] border-b border-[#30363d] overflow-x-auto shrink-0 select-none">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono mr-2">Snapshot Files:</span>
                    {snapshotFiles.map((file, idx) => {
                      const isActive = file.name === diffActiveFileName;
                      return (
                        <button
                          key={`diff-file-tab-${file.name}-${idx}`}
                          onClick={() => setDiffActiveFileName(file.name)}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
                            isActive 
                              ? "bg-blue-600/25 text-blue-400 border border-blue-500/40" 
                              : "bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:bg-[#30363d] hover:text-white"
                          }`}
                        >
                          {file.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Headings Label Bar */}
              <div className="flex text-xs text-zinc-400 bg-[#161b22]/50 border-b border-[#30363d] select-none font-mono">
                <div className="flex-1 p-2 border-r border-[#30363d] font-semibold text-center italic text-red-400 bg-red-950/20">
                  Original (Snapshot v-{compareSnapshot.versionId})
                </div>
                <div className="flex-1 p-2 font-semibold text-center italic text-emerald-400 bg-emerald-950/20">
                  Modified (Your Current Draft)
                </div>
              </div>

              {/* Diff Editor Container */}
              {(() => {
                const snapshotFiles = compareSnapshot.files || [{ name: "main.js", code: compareSnapshot.code }];
                const originalFile = snapshotFiles.find(f => f.name === diffActiveFileName) || snapshotFiles[0];
                const originalCodeForDiff = originalFile ? originalFile.code : "";
                
                const draftFile = workspaceFiles.find(f => f.name === diffActiveFileName);
                const modifiedCodeForDiff = (diffActiveFileName === activeFileName) 
                  ? currentCode 
                  : (draftFile ? draftFile.code : "");

                return (
                  <div className="flex-grow min-h-0 bg-[#0d1117] relative">
                    <DiffEditor
                      height="100%"
                      original={originalCodeForDiff}
                      modified={modifiedCodeForDiff}
                      language={diffActiveFileName.endsWith(".json") ? "json" : "javascript"}
                      theme="vs-dark"
                      loading={
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 font-mono bg-[#0d1117]">
                          Preparing comparison diff...
                        </div>
                      }
                      options={{
                        readOnly: true,
                        fontSize: 13,
                        fontFamily: "JetBrains Mono, Menlo, monospace",
                        renderSideBySide: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      }}
                    />
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal Dialog */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            key="share-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#0d1117] border border-[#30363d] w-full max-w-md rounded-lg shadow-2xl flex flex-col overflow-hidden p-5 space-y-4 font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#30363d] pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-[#58a6ff]" />
                  <h3 className="text-sm font-semibold text-white">Share Playwright Project</h3>
                </div>
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setSharingEmailStatus("idle");
                    setShareEmail("");
                    setShareEmailMsg("");
                  }}
                  className="text-zinc-400 hover:text-white transition cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {!activeScriptId ? (
                <div className="py-4 text-center space-y-3">
                  <div className="w-12 h-12 bg-amber-950/40 border border-amber-800 rounded-full flex items-center justify-center mx-auto text-amber-500">
                    <Save className="h-6 w-6 animate-bounce" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">Save Required</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed max-w-sm mx-auto">
                    To make this Playwright project shareable, please make sure it has been named and saved on the cloud first. This generates a durable repository ID mapping.
                  </p>
                  <button
                    onClick={() => {
                      setShowShareModal(false);
                      handleSaveScript();
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold cursor-pointer transition-all"
                  >
                    Save & Continue Sharing
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  {/* Share Info & Name */}
                  <div className="bg-[#161b22] px-3 py-2 border border-[#30363d] rounded text-[11px] leading-tight flex items-center justify-between">
                    <div>
                      <span className="text-zinc-500 font-mono">Project:</span>{" "}
                      <span className="text-white font-semibold">{scriptName || "untitled"}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {isPrivate ? (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 rounded font-bold">Private</span>
                      ) : (
                        <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.5 rounded font-bold">Public & Sharable</span>
                      )}
                    </div>
                  </div>

                  {/* Private/Public Script Toggle in Share Dialog */}
                  <div className="bg-[#161b22] px-3.5 py-3 border border-[#30363d] rounded-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[10.5px] text-[#8b949e] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                          {isPrivate ? (
                            <Lock className="h-3 w-3 text-amber-500" />
                          ) : (
                            <Globe className="h-3 w-3 text-emerald-400" />
                          )}
                          <span>Public Privacy Visibility</span>
                        </span>
                        <p className="text-[11px] text-zinc-300 font-semibold font-sans">
                          {isPrivate 
                            ? "Private Mode (Hanya pemilik yang dapat mengakses)" 
                            : "Public & Sharable Mode (Siapa pun dengan tautan dapat mengakses)"
                          }
                        </p>
                      </div>
                      
                      {/* Interactive Toggle Switch */}
                      <button
                        onClick={async () => {
                          const newIsPrivate = !isPrivate;
                          setIsPrivate(newIsPrivate);
                          if (activeScriptId) {
                            try {
                              const headers: Record<string, string> = { "Content-Type": "application/json" };
                              if (idToken) {
                                headers["Authorization"] = `Bearer ${idToken}`;
                              }
                              const r = await fetch(`/api/scripts/${activeScriptId}/privacy`, {
                                method: "PUT",
                                headers,
                                body: JSON.stringify({ isPrivate: newIsPrivate })
                              });
                              if (r.ok) {
                                addTerminalLine(`Project visibility is now ${newIsPrivate ? "Private" : "Public & Sharable"}.`, "success");
                                loadSavedScripts();
                              } else {
                                addTerminalLine("Failed to save privacy update.", "error");
                              }
                            } catch (err) {
                              addTerminalLine("Failed to sync privacy update.", "error");
                            }
                          }
                        }}
                        className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isPrivate ? "bg-zinc-700" : "bg-emerald-600 animate-none"
                        }`}
                        aria-pressed={!isPrivate}
                        title={isPrivate ? "Klik toggle ON untuk menjadikan Public & Sharable" : "Klik toggle OFF untuk menjadikan Private"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isPrivate ? "translate-x-0" : "translate-x-4.5"
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal border-t border-[#30363d]/50 pt-2 font-sans select-none">
                      {isPrivate 
                        ? "Project saat ini bersifat Private. Aktifkan (toggle ON) untuk mengubah status menjadi Public & Sharable."
                        : "Toggle ON aktif: Siapa pun yang memiliki tautan dapat melihat & menjalankan project ini."
                      }
                    </p>
                  </div>

                  {/* Share by Link */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[#8b949e] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Link className="h-3 w-3 text-blue-400" />
                      <span>Shareable Link</span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.protocol}//${window.location.host}/?projectId=${activeScriptId}`}
                        className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-[#58a6ff] select-all font-mono truncate"
                      />
                      <button
                        onClick={() => {
                          const url = `${window.location.protocol}//${window.location.host}/?projectId=${activeScriptId}`;
                          navigator.clipboard.writeText(url);
                          addTerminalLine("Share: Link copied to clipboard", "success");
                          setShareEmailMsg("Link copied to clipboard!");
                          setTimeout(() => setShareEmailMsg(""), 3000);
                        }}
                        className="px-3 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#c9d1d9] hover:text-white rounded text-xs transition cursor-pointer flex items-center justify-center h-8"
                        title="Copy link to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      Anyone who accesses this link can instantly load copy-drafts, explore historic snapshots, or launch run streams.
                    </p>
                  </div>

                  {/* Share by Email */}
                  <div className="space-y-1.5 pt-2 border-t border-[#30363d]">
                    <label className="text-[10px] text-[#8b949e] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-emerald-400" />
                      <span>Share by Email</span>
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                        placeholder="recipient@domain.com"
                        className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-zinc-500 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none placeholder-zinc-700 h-8"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const targetEmail = shareEmail.trim();
                            if (!targetEmail || !targetEmail.includes("@")) {
                              setSharingEmailStatus("error");
                              setShareEmailMsg("Please enter a valid email address.");
                              return;
                            }
                            setSharingEmailStatus("sending");
                            setShareEmailMsg("");
                            try {
                              const res = await fetch("/api/share-email", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  scriptId: activeScriptId,
                                  email: targetEmail,
                                  scriptName: scriptName || "untitled.js"
                                })
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setSharingEmailStatus("success");
                                setShareEmailMsg(data.message);
                                setShareEmail("");
                                addTerminalLine(`Share: Sent email invite to ${targetEmail}`, "success");
                              } else {
                                const data = await res.json().catch(() => ({}));
                                setSharingEmailStatus("error");
                                setShareEmailMsg(data.error || "Failed sending email invite");
                              }
                            } catch (e2: any) {
                              setSharingEmailStatus("error");
                              setShareEmailMsg(e2.message || "Failed connecting to email api");
                            }
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          const targetEmail = shareEmail.trim();
                          if (!targetEmail || !targetEmail.includes("@")) {
                            setSharingEmailStatus("error");
                            setShareEmailMsg("Please enter a valid email address.");
                            return;
                          }
                          setSharingEmailStatus("sending");
                          setShareEmailMsg("");
                          try {
                            const res = await fetch("/api/share-email", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                scriptId: activeScriptId,
                                email: targetEmail,
                                scriptName: scriptName || "untitled.js"
                                })
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setSharingEmailStatus("success");
                              setShareEmailMsg(data.message);
                              setShareEmail("");
                              addTerminalLine(`Share: Sent email invite to ${targetEmail}`, "success");
                            } else {
                              const data = await res.json().catch(() => ({}));
                              setSharingEmailStatus("error");
                              setShareEmailMsg(data.error || "Failed sending email invite");
                            }
                          } catch (e2: any) {
                            setSharingEmailStatus("error");
                            setShareEmailMsg(e2.message || "Failed connecting to email api");
                          }
                        }}
                        disabled={sharingEmailStatus === "sending" || !shareEmail.trim()}
                        className="px-3 bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 rounded text-xs font-semibold text-white transition cursor-pointer max-h-8"
                      >
                        {sharingEmailStatus === "sending" ? "Sending..." : "Send Invite"}
                      </button>
                    </div>
                    {shareEmailMsg && (
                      <p className={`text-[10px] font-medium leading-none mt-1 ${
                        sharingEmailStatus === "success" 
                          ? "text-emerald-400" 
                          : sharingEmailStatus === "error" 
                          ? "text-[#f85149]" 
                          : "text-blue-400"
                      }`}>
                        {shareEmailMsg}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag shield overlay to prevent iframe / Monaco selection interference */}
      {(isResizingSidebar || isResizingPreview || isResizingConsole) && (
        <div 
          className={`fixed inset-0 z-[9999] select-none ${
            isResizingSidebar || isResizingPreview ? "cursor-col-resize" : "cursor-row-resize"
          }`} 
        />
      )}

      {/* Floating interactive right-click Context Menu for scripts */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            key="context-menu-popup"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.08 }}
            className="fixed bg-[#161b22] border border-[#30363d] rounded-md shadow-2xl py-1 z-[9999] font-sans min-w-[170px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()} // Prevent closing before clicks complete
          >
            <div className="px-3 py-1 border-b border-[#30363d] text-[10px] text-[#8b949e] font-bold truncate max-w-[220px]">
              {contextMenu.script.name || "Template Script"}
            </div>
            
            {/* Option: Load Script */}
            <button
              onClick={() => {
                if (contextMenu.isTemplate) {
                  handleSelectTemplate(contextMenu.script);
                } else {
                  handleLoadScript(contextMenu.script);
                }
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-[#c9d1d9] hover:bg-blue-600 hover:text-white flex items-center gap-2 group transition-colors cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 text-[#8b949e] group-hover:text-white" />
              <span>Load in Editor</span>
            </button>

            {/* Option: Execute immediately */}
            <button
              onClick={() => {
                if (contextMenu.isTemplate) {
                  handleSelectTemplate(contextMenu.script);
                } else {
                  handleLoadScript(contextMenu.script);
                }
                // allow component state updates to flush first
                setTimeout(() => {
                  if (runScriptRef.current) runScriptRef.current();
                }, 100);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center gap-2 group transition-colors cursor-pointer border-b border-[#30363d] pb-2"
            >
              <Play className="h-3.5 w-3.5 text-emerald-500 group-hover:text-white" />
              <span>Run Script</span>
            </button>

            {/* Option: Clone script */}
            <button
              onClick={() => {
                if (contextMenu.isTemplate) {
                  const dummyScript: SavedScript = {
                    id: Math.random().toString(36).substring(2, 11),
                    name: `Copy of ${contextMenu.script.name}`,
                    code: contextMenu.script.code,
                    ownerId: user?.uid || "",
                    ownerEmail: user?.email || "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isPrivate: true,
                    versions: []
                  };
                  handleMakeCopy(dummyScript);
                } else {
                  handleMakeCopy(contextMenu.script);
                }
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 text-xs text-[#c9d1d9] hover:bg-blue-600 hover:text-white flex items-center gap-2 group transition-colors cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5 text-[#8b949e] group-hover:text-white" />
              <span>Duplicate Project</span>
            </button>

            {!contextMenu.isTemplate && (
              <>
                {/* Option: Copy Share link */}
                <button
                  onClick={() => {
                    const shareLink = `${window.location.protocol}//${window.location.host}/?projectId=${contextMenu.script.id}`;
                    navigator.clipboard.writeText(shareLink);
                    addTerminalLine(`Share URL link copied to clipboard: ${shareLink}`, "success");
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#c9d1d9] hover:bg-blue-600 hover:text-white flex items-center gap-2 group transition-colors cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5 text-[#8b949e] group-hover:text-white" />
                  <span>Copy Share Link</span>
                </button>

                {/* Option: Delete Option */}
                {contextMenu.script.ownerId === user?.uid && (
                  <button
                    onClick={(e) => {
                      handleDeleteScript(contextMenu.script, e);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-rose-450 hover:bg-rose-600 hover:text-white flex items-center gap-2 group transition-colors border-t border-[#30363d] mt-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500 group-hover:text-white" />
                    <span>Delete Script</span>
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Custom Confirmation Modals / Safe from iframe restrictions */}
        {fileToDelete && (
          <div key="modal-file-delete-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans select-none"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Delete Asset File?</h3>
                <p className="text-[11px] text-[#8b949e]">
                  Are you sure you want to delete <span className="text-[#c9d1d9] font-semibold">"{fileToDelete}"</span>? This will permanently remove it from the backend server.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setFileToDelete(null)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const target = fileToDelete;
                    const type = fileToDeleteType;
                    setFileToDelete(null);
                    await executeDeleteUpload(target, type);
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Delete Asset
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {scriptToDelete && (
          <div key="modal-script-delete-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans select-none"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Delete Script File?</h3>
                <p className="text-[11px] text-[#8b949e]">
                  Are you sure you want to delete <span className="text-[#c9d1d9] font-semibold">"{scriptToDelete.name}"</span>? This will permanently remove the script from your workspace storage collection.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setScriptToDelete(null)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const target = scriptToDelete;
                    setScriptToDelete(null);
                    await executeDeleteScript(target);
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Delete Script
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {workspaceToDelete && (
          <div key="modal-workspace-delete-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans select-none"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Delete Project Environment?</h3>
                <p className="text-[11px] text-[#8b949e]">
                  Are you sure you want to delete <span className="text-[#c9d1d9] font-semibold">"{workspaceToDelete.name}"</span> and all of its associated environment settings?
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setWorkspaceToDelete(null)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const id = workspaceToDelete.id;
                    setWorkspaceToDelete(null);
                    executeDeleteWorkspace(id);
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Delete Environment
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {envToRevoke && (
          <div key="modal-env-revoke-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans select-none"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Revoke Secure Key?</h3>
                <p className="text-[11px] text-[#8b949e]">
                  Are you sure you want to delete and revoke the environment variable key <span className="text-amber-500 font-mono">"{envToRevoke.key}"</span>?
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setEnvToRevoke(null)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const targetId = envToRevoke.id;
                    const targetKey = envToRevoke.key;
                    setEnvToRevoke(null);
                    executeRevokeEnv(targetId, targetKey);
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Revoke Key
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showNewFolderModal && (
          <div key="modal-new-folder-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-left space-y-4 font-sans select-none"
            >
              <div className="flex items-center gap-2 text-blue-400">
                <FolderPlus className="h-5 w-5" />
                <h3 className="text-sm font-bold text-white">Create Custom Folder</h3>
              </div>
              <p className="text-[11px] text-[#8b949e]">
                Enter a folder name to group your captured screenshots, PDFs, reports, or upload assets.
              </p>
              <div className="space-y-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Auth Check, Checkout Flow"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowNewFolderModal(false);
                    setNewFolderName("");
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const trimmed = newFolderName.trim();
                    if (trimmed) {
                      if (!customFolders.includes(trimmed)) {
                        const updated = [...customFolders, trimmed];
                        setCustomFolders(updated);
                        localStorage.setItem("assets_custom_folders", JSON.stringify(updated));
                        addTerminalLine(`Created asset custom folder: "${trimmed}"`, "success");
                      }
                      setActiveFolder(trimmed);
                    }
                    setShowNewFolderModal(false);
                    setNewFolderName("");
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-blue-650 hover:bg-blue-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-blue-900/10"
                >
                  Create Folder
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {comparisonModal && (
          <div key="modal-comparison-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-4xl w-full p-6 font-sans select-none text-[#c9d1d9] space-y-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <History className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-white">Compare Asset Run Versions</h3>
                    <p className="text-[10.5px] text-[#8b949e] truncate max-w-sm sm:max-w-md" title={comparisonModal.fileName}>
                      File: <code className="text-blue-400 font-mono font-bold">{comparisonModal.fileName}</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 p-0.5 bg-[#0d1117] border border-[#30363d] rounded-lg shrink-0">
                    <button
                      onClick={() => setCompareViewType("slider")}
                      className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                        compareViewType === "slider" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <Columns className="h-3 w-3" />
                      <span>Slider Wipe</span>
                    </button>
                    <button
                      onClick={() => setCompareViewType("side-by-side")}
                      className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                        compareViewType === "side-by-side" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <LayoutGrid className="h-3 w-3" />
                      <span>Side-by-Side</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setComparisonModal(null)}
                    className="text-zinc-500 hover:text-white hover:bg-zinc-800 p-1 rounded-md transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Version info badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-blue-950/15 border border-blue-900/35 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="font-bold text-blue-400 uppercase text-[9px] bg-blue-500/10 px-1.5 py-0.5 rounded mr-1.5">Version A</span>
                    <span className="text-zinc-300 font-medium">Historical Version</span>
                  </div>
                  <div className="text-zinc-400 text-[10px] font-mono flex items-center gap-2">
                    <span>{formatFileSize(comparisonModal.versionA.size)}</span>
                    <span>•</span>
                    <span>{formatAssetTimestamp(comparisonModal.versionA.timestamp)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-950/15 border border-emerald-900/35 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="font-bold text-emerald-400 uppercase text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded mr-1.5">Version B</span>
                    <span className="text-zinc-300 font-medium">Current Version</span>
                  </div>
                  <div className="text-zinc-400 text-[10px] font-mono flex items-center gap-2">
                    <span>{formatFileSize(comparisonModal.versionB.size)}</span>
                    <span>•</span>
                    <span>{formatAssetTimestamp(comparisonModal.versionB.timestamp)}</span>
                  </div>
                </div>
              </div>

              {/* Main Visualizer Panel */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3 flex items-center justify-center min-h-[300px]">
                {compareViewType === "slider" ? (
                  <div className="relative w-full aspect-[16/10] bg-black rounded-lg overflow-hidden border border-[#30363d] select-none" id="compare-slider-container">
                    {/* Image B (Current) - Background */}
                    <img 
                      src={comparisonModal.versionB.url} 
                      className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none" 
                      referrerPolicy="no-referrer"
                      alt="Current"
                    />
                    
                    {/* Image A (Selected) - Swipe Overlay */}
                    <div 
                      className="absolute inset-y-0 left-0 overflow-hidden select-none border-r border-blue-500 pointer-events-none"
                      style={{ width: `${compareSliderPosition}%` }}
                    >
                      {/* Container sized to width of viewport bounds to lock scaling */}
                      <div className="absolute inset-0 w-full h-full" style={{ width: '100%', minWidth: '800px' }}>
                        <img 
                          src={comparisonModal.versionA.url} 
                          className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                          referrerPolicy="no-referrer"
                          alt="Historical"
                        />
                      </div>
                    </div>

                    {/* Slider Handle */}
                    <div 
                      className="absolute inset-y-0 pointer-events-none flex flex-col items-center justify-center"
                      style={{ left: `${compareSliderPosition}%` }}
                    >
                      <div className="w-0.5 h-full bg-blue-500 shadow-lg shadow-blue-500/50" />
                      <div className="absolute w-8 h-8 bg-blue-600 border border-blue-400 rounded-full flex items-center justify-center text-white shadow-xl cursor-ew-resize pointer-events-auto hover:bg-blue-500 active:scale-95 transition-all">
                        <Columns className="h-4 w-4 rotate-90" />
                      </div>
                    </div>

                    {/* Drag overlay to capture interaction */}
                    <div 
                      className="absolute inset-0 cursor-ew-resize active:cursor-ew-resize"
                      onMouseMove={(e) => {
                        if (e.buttons === 1) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                          setCompareSliderPosition(percentage);
                        }
                      }}
                      onTouchMove={(e) => {
                        if (e.touches.length > 0) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.touches[0].clientX - rect.left;
                          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                          setCompareSliderPosition(percentage);
                        }
                      }}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                        setCompareSliderPosition(percentage);
                      }}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full">
                    <div className="flex flex-col space-y-2 text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Historical Run</span>
                      <div className="aspect-[16/10] bg-black rounded-lg border border-[#30363d] overflow-hidden flex items-center justify-center relative">
                        <img 
                          src={comparisonModal.versionA.url} 
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                          alt="Historical"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col space-y-2 text-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-500">Latest Run</span>
                      <div className="aspect-[16/10] bg-black rounded-lg border border-[#30363d] overflow-hidden flex items-center justify-center relative">
                        <img 
                          src={comparisonModal.versionB.url} 
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                          alt="Current"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Slider instruction */}
              {compareViewType === "slider" && (
                <p className="text-[10px] text-[#8b949e] italic text-center">
                  Drag your cursor or tap across the image to slide the divider and compare both runs in real-time.
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 border-t border-[#30363d] pt-3.5">
                <button
                  onClick={() => setComparisonModal(null)}
                  className="px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Close Comparison
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showConsoleClearConfirm && (
          <div key="modal-console-clear-confirm-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans select-none"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-950/40 border border-amber-900/60 flex items-center justify-center text-amber-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">
                  {consoleClearType === "scripts" 
                    ? "Clear Script Logs?" 
                    : consoleClearType === "browser" 
                    ? "Clear Browser Console Logs?" 
                    : consoleClearType === "network" 
                    ? "Clear Network Logs?" 
                    : "Clear Saved Cookies?"}
                </h3>
                <p className="text-[11px] text-[#8b949e]">
                  {consoleClearType === "scripts" 
                    ? "Are you sure you want to clear all execution script run logs? This action cannot be undone." 
                    : consoleClearType === "browser" 
                    ? "Are you sure you want to clear all browser console messages and errors? This action cannot be undone." 
                    : consoleClearType === "network" 
                    ? "Are you sure you want to clear all recorded network log entries? This action cannot be undone." 
                    : "Are you sure you want to clear all captured browser cookies? This action cannot be undone."}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowConsoleClearConfirm(false)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowConsoleClearConfirm(false);
                    if (consoleClearType === "scripts") {
                      setTerminalLines(prev => prev.filter(line => line.source !== "script"));
                    } else if (consoleClearType === "browser") {
                      setTerminalLines(prev => prev.filter(line => line.source !== "browser"));
                    } else if (consoleClearType === "network") {
                      setNetworkLogs([]);
                      setSelectedNetworkLog(null);
                    } else if (consoleClearType === "cookies") {
                      setBrowserCookies([]);
                    }
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Clear Logs
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showValidationModal && (
          <div key="modal-validation-warning-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-lg w-full p-6 font-sans select-none text-[#c9d1d9] space-y-4"
            >
              <div className="flex items-center gap-2.5 border-b border-[#30363d] pb-3">
                <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <AlertTriangle className="h-5 w-5 animate-pulse" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-white">Pre-Run Validation Warning</h3>
                  <p className="text-[10.5px] text-[#8b949e]">We detected potential issues with your Playwright script.</p>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-left">
                {validationIssues.map((issue, idx) => (
                  <div 
                    key={`validation-issue-${idx}-${issue.type}-${issue.message.substring(0, 15)}`} 
                    className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                      issue.type === "error" 
                        ? "bg-rose-500/5 border-rose-500/25 text-rose-300" 
                        : "bg-amber-500/5 border-amber-500/25 text-amber-300"
                    }`}
                  >
                    <span className="mt-0.5 font-bold uppercase text-[9px] px-1.5 py-0.2 rounded shrink-0 bg-black/30">
                      {issue.type}
                    </span>
                    <div className="space-y-1">
                      <p className="leading-relaxed text-zinc-200">{issue.message}</p>
                      {issue.line && (
                        <p className="text-[10px] text-zinc-500 font-mono">
                          Line: {issue.line}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-[#8b949e] leading-relaxed bg-[#0d1117] border border-[#30363d] rounded-lg p-3 text-left">
                <strong>Recommendation:</strong> Correcting these issues helps prevent common execution hangs, runtime failures, and environment mismatches on the engine container.
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-[#30363d] pt-3.5">
                <button
                  onClick={() => setShowValidationModal(false)}
                  className="px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel & Edit
                </button>
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    handleRunScript(true); // Bypass validation on run
                  }}
                  className="px-4 py-2 text-xs rounded bg-amber-650 hover:bg-amber-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-amber-900/10"
                >
                  Run Anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}

        <LoginModal
          key="modal-login-dialog"
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSubmit={handleManualSignIn}
          email={loginEmail}
          setEmail={setLoginEmail}
          password={loginPassword}
          setPassword={setLoginPassword}
          error={loginError}
          loading={loginLoading}
        />

        <GeminiSettingsModal
          key="modal-gemini-settings-dialog"
          isOpen={showGeminiModal}
          onClose={() => setShowGeminiModal(false)}
          apiKey={geminiApiKey}
          setApiKey={setGeminiApiKey}
          model={geminiModel}
          setModel={setGeminiModel}
          captchaCount={geminiCaptchaCount}
          onSave={saveGeminiSettings}
          saving={savingGeminiSettings}
          message={geminiSettingsMessage}
          setMessage={setGeminiSettingsMessage}
        />

        {showClearConfirm && (
          <div key="modal-clear-confirm-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans select-none"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">
                  {clearType === "outputs" 
                    ? "Delete All Output Files?"
                    : clearType === "inputs" || clearType === "upload" 
                    ? "Delete All Input Files?"
                    : clearType === "all" 
                    ? "Clear All Workspace Assets?"
                    : `Clear All ${clearType === "screenshot" ? "Screenshots" : clearType === "pdf" ? "PDFs" : clearType === "excel" ? "Excel sheets" : clearType === "video" ? "Recordings" : "Uploads"}?`}
                </h3>
                <p className="text-[11px] text-[#8b949e]">
                  {clearType === "outputs"
                    ? "Are you sure you want to delete all generated output files (screenshots, PDFs, Excel sheets, recordings) for this workspace?"
                    : clearType === "inputs" || clearType === "upload"
                    ? "Are you sure you want to delete all uploaded input files for this workspace?"
                    : clearType === "all"
                    ? "Are you sure you want to delete all generated output files and uploaded input files for this workspace?"
                    : `Are you sure you want to delete all ${clearType === "screenshot" ? "screenshots" : clearType === "pdf" ? "PDF files" : clearType === "excel" ? "Excel files" : clearType === "video" ? "recordings" : "uploaded files"} for this workspace?`}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowClearConfirm(false);
                    await executeClearArtifacts();
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Clear Files
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {workspaceFileToDelete && (
          <div key="modal-workspace-file-delete-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 font-sans"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/60 flex items-center justify-center text-rose-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white">Delete Script File?</h3>
                <p className="text-[11px] text-[#8b949e]">
                  Are you sure you want to delete <span className="text-[#c9d1d9] font-semibold">"{workspaceFileToDelete}"</span> from this workspace?
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setWorkspaceFileToDelete(null)}
                  className="flex-1 px-4 py-2 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const target = workspaceFileToDelete;
                    setWorkspaceFileToDelete(null);
                    executeDeleteFile(target);
                  }}
                  className="flex-1 px-4 py-2 text-xs rounded bg-red-650 hover:bg-red-550 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-red-900/10"
                >
                  Delete File
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {workspaceModalMode && (
          <div key="modal-workspace-mode-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-left space-y-4 font-sans select-none text-[#c9d1d9]"
            >
              <div className="flex items-center justify-between border-b border-[#30363d] pb-2.5">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  {workspaceModalMode === "create" ? (
                    <>
                      <Plus className="h-4 w-4 text-emerald-500" />
                      <span>Create Project Environment</span>
                    </>
                  ) : (
                    <>
                      <Edit className="h-4 w-4 text-blue-400" />
                      <span>Rename Project Environment</span>
                    </>
                  )}
                </h3>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Project Environment Name</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Production Keys, Client Testing..."
                  value={workspaceModalName}
                  onChange={(e) => setWorkspaceModalName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && workspaceModalName.trim()) {
                      const trimmed = workspaceModalName.trim();
                      if (workspaceModalMode === "create") {
                        const newId = Math.random().toString(36).substring(2, 9);
                        setEnvWorkspaces(prev => [...prev, { id: newId, name: trimmed, vars: [] }]);
                        setActiveWorkspaceId(newId);
                        addTerminalLine(`Created Project Environment: "${trimmed}"`, "success");
                      } else {
                        setEnvWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, name: trimmed } : ws));
                        addTerminalLine(`Renamed Project Environment to: "${trimmed}"`, "success");
                      }
                      setWorkspaceModalMode(null);
                    } else if (e.key === "Escape") {
                      setWorkspaceModalMode(null);
                    }
                  }}
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#484f58] rounded px-3 py-2 text-xs font-semibold focus:outline-none placeholder-zinc-700 text-[#c9d1d9] transition-colors"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363d]/50">
                <button
                  onClick={() => setWorkspaceModalMode(null)}
                  className="px-4 py-1.5 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!workspaceModalName.trim()}
                  onClick={() => {
                    const trimmed = workspaceModalName.trim();
                    if (!trimmed) return;
                    if (workspaceModalMode === "create") {
                      const newId = Math.random().toString(36).substring(2, 9);
                      setEnvWorkspaces(prev => [...prev, { id: newId, name: trimmed, vars: [] }]);
                      setActiveWorkspaceId(newId);
                      addTerminalLine(`Created Project Environment: "${trimmed}"`, "success");
                    } else {
                      setEnvWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, name: trimmed } : ws));
                      addTerminalLine(`Renamed Project Environment to: "${trimmed}"`, "success");
                    }
                    setWorkspaceModalMode(null);
                  }}
                  className="px-4 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-45 disabled:pointer-events-none text-white transition-all font-semibold cursor-pointer shadow-sm shadow-blue-900/10"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {sharedEnvToImport && (
          <div key="modal-shared-env-overlay" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-md w-full p-6 text-left space-y-4 font-sans text-[#c9d1d9]"
            >
              <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-blue-400" />
                  <span>Import Shared Environment Workspace</span>
                </h3>
                <button
                  onClick={() => setSharedEnvToImport(null)}
                  className="text-zinc-500 hover:text-white transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-medium">Source Workspace Name:</span>
                    <span className="text-xs text-white font-bold">{sharedEnvToImport.name}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs text-zinc-400 font-medium shrink-0">Included Keys:</span>
                    <div className="flex flex-wrap gap-1 justify-end max-h-24 overflow-y-auto">
                      {sharedEnvToImport.vars && sharedEnvToImport.vars.length > 0 ? (
                        sharedEnvToImport.vars.map((v: any, idx: number) => (
                          <span key={`shared-key-${v.key || ""}-${v.id || idx}`} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-zinc-300">
                            {v.key || "UNNAMED"}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-500 italic">No variables defined</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Import Strategy</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportOption("new")}
                      className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                        importOption === "new"
                          ? "bg-blue-950/20 border-blue-500/80 text-white"
                          : "bg-[#0d1117] border-[#30363d] text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-xs font-bold block">Create New</span>
                      <span className="text-[9.5px] text-zinc-400 leading-normal">Creates a brand new workspace with these keys.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportOption("merge")}
                      className={`p-3 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between gap-1 ${
                        importOption === "merge"
                          ? "bg-blue-950/20 border-blue-500/80 text-white"
                          : "bg-[#0d1117] border-[#30363d] text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-xs font-bold block">Merge/Update</span>
                      <span className="text-[9.5px] text-zinc-400 leading-normal">Merges shared keys into an existing workspace.</span>
                    </button>
                  </div>
                </div>

                {importOption === "new" ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">New Workspace Name</label>
                    <input
                      type="text"
                      placeholder="e.g. My Shared Keys..."
                      value={importNewName}
                      onChange={(e) => setImportNewName(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#484f58] rounded px-3 py-2 text-xs font-semibold focus:outline-none placeholder-zinc-700 text-[#c9d1d9] transition-colors"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Target Workspace</label>
                    <select
                      value={importTargetWorkspaceId}
                      onChange={(e) => setImportTargetWorkspaceId(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#484f58] rounded px-3 py-2 text-xs font-semibold focus:outline-none text-[#c9d1d9] transition-colors cursor-pointer"
                    >
                      {envWorkspaces.map((ws, idx) => (
                        <option key={`import-ws-target-${ws.id}-${idx}`} value={ws.id}>
                          {ws.name} ({ws.vars.length} vars)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#30363d]/50">
                <button
                  type="button"
                  onClick={() => setSharedEnvToImport(null)}
                  className="px-4 py-1.5 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (importOption === "new") {
                      const trimmed = importNewName.trim() || sharedEnvToImport.name || "Imported Workspace";
                      const newId = "ws-" + Math.random().toString(36).substring(2, 9);
                      
                      setEnvWorkspaces(prev => [...prev, {
                        id: newId,
                        name: trimmed,
                        vars: sharedEnvToImport.vars.map((v: any) => ({
                          id: v.id || Math.random().toString(36).substring(2, 9),
                          key: v.key,
                          value: v.value || "",
                          isSecret: v.isSecret || false,
                          isSaved: false
                        }))
                      }]);
                      setActiveWorkspaceId(newId);
                      addTerminalLine(`Imported shared workspace as a new project environment: "${trimmed}"`, "success");
                    } else {
                      setEnvWorkspaces(prev => prev.map(ws => {
                        if (ws.id === importTargetWorkspaceId) {
                          const updatedVars = [...ws.vars];
                          sharedEnvToImport.vars.forEach((sharedVar: any) => {
                            const existingIdx = updatedVars.findIndex(v => v.key === sharedVar.key);
                            if (existingIdx !== -1) {
                              updatedVars[existingIdx] = {
                                ...updatedVars[existingIdx],
                                value: sharedVar.value || "",
                                isSecret: sharedVar.isSecret || false,
                                isSaved: false
                              };
                            } else {
                              updatedVars.push({
                                id: Math.random().toString(36).substring(2, 9),
                                key: sharedVar.key,
                                value: sharedVar.value || "",
                                isSecret: sharedVar.isSecret || false,
                                isSaved: false
                              });
                            }
                          });
                          return { ...ws, vars: updatedVars };
                        }
                        return ws;
                      }));
                      setActiveWorkspaceId(importTargetWorkspaceId);
                      const targetName = envWorkspaces.find(ws => ws.id === importTargetWorkspaceId)?.name || "Target Workspace";
                      addTerminalLine(`Successfully merged ${sharedEnvToImport.vars?.length || 0} shared keys into workspace: "${targetName}"`, "success");
                    }
                    setSharedEnvToImport(null);
                  }}
                  className="px-4 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-all font-semibold cursor-pointer shadow-sm shadow-blue-900/10"
                >
                  Import Workspace
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showCreateProjectModal && (
          <div key="modal-create-project-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-sm w-full p-6 text-left space-y-4 font-sans select-none text-[#c9d1d9]"
            >
              <div className="flex items-center justify-between border-b border-[#30363d] pb-2.5">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-emerald-500" />
                  <span>Create New Project</span>
                </h3>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Project Name</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. My Web Scraper, Form Submitter..."
                  value={newProjectNameInput}
                  onChange={(e) => setNewProjectNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newProjectNameInput.trim()) {
                      const trimmed = newProjectNameInput.trim();
                      const newCode = `// New custom script\nawait page.goto("https://google.com");\nreturn { "success": true };`;
                      const newId = "scr-" + Math.random().toString(36).substring(2, 11);

                      setScriptName(trimmed);
                      setCurrentCode(newCode);
                      setOriginalName(trimmed);
                      setOriginalCode(newCode);
                      setSelectedTemplateId("");
                      setActiveScriptId(newId);
                      setIsPrivate(true);
                      setWorkspaceFiles([{ name: "main.js", code: newCode }]);
                      setActiveFileName("main.js");
                      addTerminalLine(`Created fresh Project "${trimmed}"`, "success");
                      
                      if (user) {
                        handleSaveScript(trimmed, newCode, [{ name: "main.js", code: newCode }], newId);
                      }
                      
                      setShowCreateProjectModal(false);
                    } else if (e.key === "Escape") {
                      setShowCreateProjectModal(false);
                    }
                  }}
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#484f58] rounded px-3 py-2 text-xs font-semibold focus:outline-none placeholder-zinc-700 text-[#c9d1d9] transition-colors font-sans"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363d]/50">
                <button
                  onClick={() => setShowCreateProjectModal(false)}
                  className="px-4 py-1.5 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!newProjectNameInput.trim()}
                  onClick={() => {
                    const trimmed = newProjectNameInput.trim();
                    if (!trimmed) return;
                    const newCode = `// New custom script\nawait page.goto("https://google.com");\nreturn { "success": true };`;
                    const newId = "scr-" + Math.random().toString(36).substring(2, 11);

                    setScriptName(trimmed);
                    setCurrentCode(newCode);
                    setOriginalName(trimmed);
                    setOriginalCode(newCode);
                    setSelectedTemplateId("");
                    setActiveScriptId(newId);
                    setIsPrivate(true);
                    setWorkspaceFiles([{ name: "main.js", code: newCode }]);
                    setActiveFileName("main.js");
                    addTerminalLine(`Created fresh Project "${trimmed}"`, "success");
                    
                    if (user) {
                      handleSaveScript(trimmed, newCode, [{ name: "main.js", code: newCode }], newId);
                    }
                    
                    setShowCreateProjectModal(false);
                  }}
                  className="px-4 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-45 disabled:pointer-events-none text-white transition-all font-semibold cursor-pointer shadow-sm shadow-blue-900/10"
                >
                  Create Project
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {pendingChoice && (
          <div key="modal-pending-choice-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-w-2xl w-full p-6 text-left space-y-4 font-sans text-[#c9d1d9] flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                    </span>
                    <span>Interactive Element Selection</span>
                  </h3>
                  <p className="text-[11px] text-[#8b949e]">
                    Script is waiting for choice. Found {pendingChoice.options.length} elements matching selector: <code className="bg-[#0d1117] px-1.5 py-0.5 rounded border border-[#30363d] text-blue-400 font-mono text-[10px]">{pendingChoice.options[0]?.selector}</code>
                  </p>
                </div>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between text-xs bg-[#0d1117] border border-[#30363d]/50 rounded px-3 py-1.5">
                <span className="text-[10px] text-zinc-400 font-medium font-mono">
                  {selectedIndexes.length} of {pendingChoice.options.length} selected
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    onClick={() => setSelectedIndexes(pendingChoice.options.map(o => o.index))}
                    className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-[#30363d]">|</span>
                  <button
                    onClick={() => setSelectedIndexes([])}
                    className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Scrollable List of Options */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[50vh]">
                {pendingChoice.options.map((opt, idx) => {
                  const isChecked = selectedIndexes.includes(opt.index);
                  return (
                    <div
                      key={`opt-${opt.index}-${idx}`}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedIndexes(prev => prev.filter(idx => idx !== opt.index));
                        } else {
                          setSelectedIndexes(prev => [...prev, opt.index]);
                        }
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        isChecked 
                          ? "bg-blue-950/20 border-blue-500/50 hover:bg-blue-950/30" 
                          : "bg-[#0d1117] border-[#30363d] hover:bg-[#161b22] hover:border-[#484f58]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // Handled by div onClick
                        className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono bg-[#21262d] text-zinc-400 px-1.5 py-0.5 rounded border border-[#30363d]">
                            Index {opt.index}
                          </span>
                          {opt.tagName && (
                            <span className="text-[10px] font-mono uppercase bg-zinc-800 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-700">
                              &lt;{opt.tagName}&gt;
                            </span>
                          )}
                          {opt.id && (
                            <span className="text-[10px] font-mono text-amber-500 truncate max-w-[120px]" title={`ID: ${opt.id}`}>
                              #{opt.id}
                            </span>
                          )}
                          {opt.classList && (
                            <span className="text-[9px] font-mono text-zinc-500 truncate max-w-[200px]" title={`Classes: ${opt.classList}`}>
                              .{opt.classList.replace(/\s+/g, ".")}
                            </span>
                          )}
                        </div>

                        {/* Element Inner Text */}
                        <div className="text-xs font-semibold text-zinc-200 truncate">
                          {opt.text || <span className="text-zinc-600 italic">No text content</span>}
                        </div>

                        {/* Collapsible/scrollable HTML snippet */}
                        {opt.html && (
                          <div className="bg-black/40 border border-[#30363d]/50 rounded p-1.5 font-mono text-[9px] text-emerald-400 overflow-x-auto whitespace-pre select-all max-h-[60px]">
                            {String(opt.html || "").trim()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between border-t border-[#30363d] pt-3 flex-shrink-0">
                <span className="text-[10px] text-zinc-500 italic">
                  * Selected items will be returned as an array of locators in the script.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSubmitChoice}
                    disabled={submittingChoice}
                    className="px-5 py-2 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white transition-all font-semibold cursor-pointer shadow-sm shadow-blue-900/20 flex items-center gap-1.5"
                  >
                    {submittingChoice ? (
                      <>
                        <span className="h-3 w-3 border-2 border-white border-t-transparent animate-spin rounded-full"></span>
                        <span>Submitting Choice...</span>
                      </>
                    ) : (
                      <span>Submit Selection ({selectedIndexes.length})</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Download Project Modal Dialog */}
        {showDownloadModal && (
          <div key="modal-download-project-overlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#0d1117] border border-[#30363d] rounded-xl shadow-2xl max-w-lg w-full p-5 text-left space-y-4 font-sans text-[#c9d1d9] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#30363d] pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-emerald-400">
                    <Download className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Download Project Files</h3>
                    <p className="text-[10.5px] text-zinc-400">Unduh berkas project yang ditampilkan sebagai arsip ZIP</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDownloadModal(false)}
                  className="text-zinc-400 hover:text-white transition cursor-pointer text-xs p-1"
                >
                  ✕
                </button>
              </div>

              {/* Project Overview Card */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold border-b border-[#30363d]/60 pb-2">
                  <span className="text-zinc-400 font-mono">Project Name:</span>
                  <span className="text-emerald-400 font-bold">{scriptName || "Playwright Automation Project"}</span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="text-[#8b949e] font-semibold text-[10.5px] mb-1">
                    Files to be downloaded ({workspaceFiles?.length || 1} file(s)):
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {(workspaceFiles && workspaceFiles.length > 0 ? workspaceFiles : [{ name: "main.js" }]).map((f, i) => (
                      <div key={`download-file-${f.name || 'file'}-${i}`} className="bg-[#0d1117] px-2.5 py-1.5 border border-[#30363d]/60 rounded flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          <span className="font-mono text-white text-xs truncate">{f.name}</span>
                        </div>
                        {f.name === activeFileName && (
                          <span className="text-[9.5px] bg-emerald-950/80 text-emerald-400 px-1.5 py-0.5 border border-emerald-800/60 rounded">Active</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Information Notice */}
              <div className="text-[11px] text-zinc-400 bg-blue-950/30 border border-blue-900/50 rounded-lg p-2.5 flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0 mt-0.5">ℹ️</span>
                <p className="leading-relaxed">
                  Arsip ZIP ini hanya berisi berkas-berkas project yang ditampilkan dalam ruang kerja. Berkas tambahan seperti <code className="text-blue-300 font-mono bg-blue-950/60 px-1 py-0.5 rounded">package.json</code>, <code className="text-blue-300 font-mono bg-blue-950/60 px-1 py-0.5 rounded">.env</code>, dan folder luaran tidak ikut diunduh.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363d]/80">
                <button
                  onClick={() => setShowDownloadModal(false)}
                  className="px-3.5 py-1.5 text-xs rounded bg-[#21262d] text-zinc-300 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    handleDownloadScript();
                    setShowDownloadModal(false);
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-[#21262d] text-zinc-200 border border-[#30363d] hover:bg-[#30363d] hover:text-white transition-all font-semibold cursor-pointer flex items-center gap-1.5"
                  title="Download only the current script code as a single .js file"
                >
                  <FileCode className="h-3.5 w-3.5 text-blue-400" />
                  <span>Script Only (.js)</span>
                </button>

                <button
                  disabled={isPackagingZip}
                  onClick={async () => {
                    await handleDownloadProjectZip();
                    setShowDownloadModal(false);
                  }}
                  className="px-4 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                >
                  {isPackagingZip ? (
                    <>
                      <span className="h-3 w-3 border-2 border-white border-t-transparent animate-spin rounded-full"></span>
                      <span>Bundling ZIP...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      <span>Download Project ZIP</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

