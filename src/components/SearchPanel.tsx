import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
  Search, 
  X, 
  FileCode, 
  ChevronDown, 
  ChevronRight, 
  Filter, 
  Replace, 
  Check, 
  RefreshCw,
  Sliders
} from "lucide-react";

export interface SearchResultMatch {
  line: number; // 1-indexed
  column: number; // 1-indexed
  lineText: string;
  matchLength: number;
}

export interface FileSearchResult {
  fileName: string;
  matches: SearchResultMatch[];
}

interface SearchPanelProps {
  workspaceFiles: { name: string; code: string }[];
  activeFileName: string;
  currentCode: string;
  handleSwitchFileAndJump: (fileName: string, line: number, column?: number, matchLength?: number) => void;
  setWorkspaceFiles: React.Dispatch<React.SetStateAction<{ name: string; code: string }[]>>;
  setCurrentCode: (code: string) => void;
  addTerminalLine?: (text: string, type?: "info" | "success" | "error" | "warning") => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  workspaceFiles,
  activeFileName,
  currentCode,
  handleSwitchFileAndJump,
  setWorkspaceFiles,
  setCurrentCode,
  addTerminalLine,
  searchInputRef
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [replaceQuery, setReplaceQuery] = useState<string>("");
  const [showReplace, setShowReplace] = useState<boolean>(false);
  const [showFileFilter, setShowFileFilter] = useState<boolean>(false);
  const [fileFilter, setFileFilter] = useState<string>("");

  // Search Options
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [wholeWord, setWholeWord] = useState<boolean>(false);
  const [isRegex, setIsRegex] = useState<boolean>(false);

  // Group Collapsed State
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const localInputRef = useRef<HTMLInputElement>(null);
  const inputToUse = searchInputRef || localInputRef;

  // Auto-focus input on mount
  useEffect(() => {
    if (inputToUse.current) {
      inputToUse.current.focus();
    }
  }, []);

  // Effective workspace files synced with current unsaved editor code
  const effectiveFiles = useMemo(() => {
    const fileMap = new Map<string, string>();

    if (workspaceFiles && workspaceFiles.length > 0) {
      workspaceFiles.forEach(f => {
        if (f.name) fileMap.set(f.name, f.code || "");
      });
    }

    if (activeFileName) {
      fileMap.set(activeFileName, currentCode || "");
    }

    if (fileMap.size === 0) {
      fileMap.set("main.js", currentCode || "");
    }

    return Array.from(fileMap.entries()).map(([name, code]) => ({ name, code }));
  }, [workspaceFiles, activeFileName, currentCode]);

  // Execute global search across all files
  const searchResults = useMemo(() => {
    const query = searchQuery;
    if (!query) return [];

    let filterPattern: RegExp | null = null;
    if (fileFilter.trim()) {
      try {
        const rawFilter = fileFilter.trim().replace(/\./g, "\\.").replace(/\*/g, ".*");
        filterPattern = new RegExp(rawFilter, "i");
      } catch {
        filterPattern = null;
      }
    }

    const results: FileSearchResult[] = [];

    for (const file of effectiveFiles) {
      // Apply File Filter if configured
      if (
        filterPattern &&
        !filterPattern.test(file.name) &&
        !file.name.toLowerCase().includes(fileFilter.trim().toLowerCase())
      ) {
        continue;
      }

      const lines = file.code.split("\n");
      const matches: SearchResultMatch[] = [];

      lines.forEach((lineText, lineIdx) => {
        const lineNum = lineIdx + 1;

        if (isRegex) {
          try {
            const flags = caseSensitive ? "g" : "gi";
            const regex = new RegExp(query, flags);
            let match: RegExpExecArray | null;
            while ((match = regex.exec(lineText)) !== null) {
              matches.push({
                line: lineNum,
                column: match.index + 1,
                lineText,
                matchLength: match[0].length || 1
              });
              if (match.index === regex.lastIndex) {
                regex.lastIndex++;
              }
            }
          } catch {
            // invalid regex input, skip line
          }
        } else {
          const searchText = caseSensitive ? lineText : lineText.toLowerCase();
          const targetQuery = caseSensitive ? query : query.toLowerCase();

          let startIndex = 0;
          while (startIndex < searchText.length) {
            const foundIdx = searchText.indexOf(targetQuery, startIndex);
            if (foundIdx === -1) break;

            let isWordMatch = true;
            if (wholeWord) {
              const charBefore = foundIdx > 0 ? searchText[foundIdx - 1] : "";
              const charAfter =
                foundIdx + targetQuery.length < searchText.length
                  ? searchText[foundIdx + targetQuery.length]
                  : "";
              const wordCharRegex = /[a-zA-Z0-9_]/;
              if (wordCharRegex.test(charBefore) || wordCharRegex.test(charAfter)) {
                isWordMatch = false;
              }
            }

            if (isWordMatch) {
              matches.push({
                line: lineNum,
                column: foundIdx + 1,
                lineText,
                matchLength: targetQuery.length
              });
            }

            startIndex = foundIdx + Math.max(1, targetQuery.length);
          }
        }
      });

      if (matches.length > 0) {
        results.push({
          fileName: file.name,
          matches
        });
      }
    }

    return results;
  }, [effectiveFiles, searchQuery, caseSensitive, wholeWord, isRegex, fileFilter]);

  // Total matches across all matching files
  const totalMatchesCount = useMemo(() => {
    return searchResults.reduce((acc, r) => acc + r.matches.length, 0);
  }, [searchResults]);

  const toggleFileCollapse = (fileName: string) => {
    setCollapsedFiles(prev => ({
      ...prev,
      [fileName]: !prev[fileName]
    }));
  };

  const collapseAll = () => {
    const map: Record<string, boolean> = {};
    searchResults.forEach(r => {
      map[r.fileName] = true;
    });
    setCollapsedFiles(map);
  };

  const expandAll = () => {
    setCollapsedFiles({});
  };

  // Replace All Occurrences across workspace files
  const handleReplaceAll = () => {
    if (!searchQuery) return;

    let totalReplaced = 0;
    const updatedFiles = effectiveFiles.map(file => {
      if (
        fileFilter.trim() &&
        !file.name.toLowerCase().includes(fileFilter.trim().toLowerCase())
      ) {
        return file;
      }

      const lines = file.code.split("\n");
      let fileModified = false;

      const newLines = lines.map(lineText => {
        if (isRegex) {
          try {
            const flags = caseSensitive ? "g" : "gi";
            const regex = new RegExp(searchQuery, flags);
            if (regex.test(lineText)) {
              fileModified = true;
              totalReplaced++;
              return lineText.replace(regex, replaceQuery);
            }
          } catch {
            return lineText;
          }
        } else {
          const searchText = caseSensitive ? lineText : lineText.toLowerCase();
          const targetQuery = caseSensitive ? searchQuery : searchQuery.toLowerCase();

          if (searchText.includes(targetQuery)) {
            fileModified = true;
            totalReplaced++;
            if (caseSensitive) {
              return lineText.replaceAll(searchQuery, replaceQuery);
            } else {
              const reg = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
              return lineText.replace(reg, replaceQuery);
            }
          }
        }
        return lineText;
      });

      return fileModified ? { ...file, code: newLines.join("\n") } : file;
    });

    setWorkspaceFiles(updatedFiles);

    const updatedActive = updatedFiles.find(f => f.name === activeFileName);
    if (updatedActive) {
      setCurrentCode(updatedActive.code);
    }

    if (addTerminalLine) {
      addTerminalLine(
        `Global Search: Replaced occurrences across project files ("${searchQuery}" → "${replaceQuery}")`,
        "success"
      );
    }
  };

  // Render highlighted line snippet
  const renderHighlightedSnippet = (
    lineText: string,
    column: number,
    matchLength: number
  ) => {
    const matchStart = column - 1;
    const matchEnd = matchStart + matchLength;

    const before = lineText.substring(0, matchStart);
    const matched = lineText.substring(matchStart, matchEnd);
    const after = lineText.substring(matchEnd);

    let displayBefore = before;
    let displayAfter = after;

    if (before.length > 28) {
      displayBefore = "..." + before.substring(before.length - 24);
    }
    if (after.length > 35) {
      displayAfter = after.substring(0, 30) + "...";
    }

    return (
      <span className="font-mono text-[11px] truncate flex-grow text-zinc-300">
        <span className="text-zinc-500 whitespace-pre">{displayBefore}</span>
        <mark className="bg-amber-500/30 text-amber-200 font-bold px-0.5 rounded border border-amber-500/50">
          {matched}
        </mark>
        <span className="text-zinc-400 whitespace-pre">{displayAfter}</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden select-none">
      {/* Header Bar */}
      <div className="p-3 border-b border-[#30363d] bg-[#161b22] space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wide">
            <Search className="h-4 w-4 text-blue-400" />
            <span>Global Search</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowReplace(!showReplace)}
              className={`p-1 rounded text-xs transition cursor-pointer ${
                showReplace
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                  : "text-zinc-400 hover:bg-[#30363d] hover:text-white"
              }`}
              title="Toggle Replace Mode"
            >
              <Replace className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowFileFilter(!showFileFilter)}
              className={`p-1 rounded text-xs transition cursor-pointer ${
                showFileFilter || fileFilter
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                  : "text-zinc-400 hover:bg-[#30363d] hover:text-white"
              }`}
              title="Toggle File Name Filters"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Search Input Box */}
        <div className="relative flex items-center">
          <input
            ref={inputToUse as any}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search text in workspace files..."
            className="w-full bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded pl-2.5 pr-20 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
          />

          {/* Toggle buttons inside input right area */}
          <div className="absolute right-1.5 flex items-center gap-0.5">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="p-1 text-zinc-500 hover:text-white transition rounded"
                title="Clear Search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`px-1 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                caseSensitive
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#21262d]"
              }`}
              title="Match Case (Aa)"
            >
              Aa
            </button>
            <button
              onClick={() => setWholeWord(!wholeWord)}
              className={`px-1 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                wholeWord
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#21262d]"
              }`}
              title="Match Whole Word (\b)"
            >
              \b
            </button>
            <button
              onClick={() => setIsRegex(!isRegex)}
              className={`px-1 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                isRegex
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#21262d]"
              }`}
              title="Use Regular Expression (.*)"
            >
              .*
            </button>
          </div>
        </div>

        {/* Optional Replace Bar */}
        {showReplace && (
          <div className="flex items-center gap-1.5 pt-1 animate-fadeIn">
            <div className="relative flex-grow">
              <input
                type="text"
                value={replaceQuery}
                onChange={e => setReplaceQuery(e.target.value)}
                placeholder="Replace with..."
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded px-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleReplaceAll}
              disabled={!searchQuery || totalMatchesCount === 0}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-[11px] font-bold rounded flex items-center gap-1 transition shrink-0 cursor-pointer"
              title="Replace All Occurrences"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Replace All</span>
            </button>
          </div>
        )}

        {/* Optional File Filter Input */}
        {showFileFilter && (
          <div className="relative pt-1 animate-fadeIn">
            <input
              type="text"
              value={fileFilter}
              onChange={e => setFileFilter(e.target.value)}
              placeholder="files to include (e.g. *.js, main.js)..."
              className="w-full bg-[#0d1117] border border-[#30363d] focus:border-blue-500 rounded px-2.5 py-1 text-[11px] text-white placeholder-zinc-500 focus:outline-none"
            />
            {fileFilter && (
              <button
                onClick={() => setFileFilter("")}
                className="absolute right-2 top-2 text-zinc-500 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results Summary Bar */}
      <div className="px-3 py-1.5 bg-[#161b22]/70 border-b border-[#30363d]/60 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
        <div>
          {!searchQuery ? (
            <span>Global search across project files</span>
          ) : searchResults.length === 0 ? (
            <span className="text-amber-400/90 font-medium">No results found</span>
          ) : (
            <span>
              <strong className="text-white font-bold">{totalMatchesCount}</strong> match
              {totalMatchesCount !== 1 ? "es" : ""} in{" "}
              <strong className="text-white font-bold">{searchResults.length}</strong> file
              {searchResults.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="flex items-center gap-2 text-[10px]">
            <button
              onClick={collapseAll}
              className="hover:text-white transition cursor-pointer"
            >
              Collapse
            </button>
            <span>|</span>
            <button
              onClick={expandAll}
              className="hover:text-white transition cursor-pointer"
            >
              Expand
            </button>
          </div>
        )}
      </div>

      {/* Search Results List / Empty State */}
      <div className="flex-grow overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700">
        {!searchQuery ? (
          <div className="p-6 text-center text-zinc-500 space-y-2 my-auto">
            <Search className="h-8 w-8 mx-auto text-zinc-600 stroke-1" />
            <p className="text-xs font-medium">Ketik kata kunci untuk mencari di semua berkas project</p>
            <p className="text-[10.5px] text-zinc-600">
              Mendukung filter persis (Aa), kata utuh (\b), dan RegEx (.*)
            </p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 space-y-2 my-auto">
            <FileCode className="h-8 w-8 mx-auto text-zinc-600 stroke-1" />
            <p className="text-xs font-medium text-zinc-400">
              Tidak ada hasil yang cocok dengan &quot;<span className="text-white font-mono">{searchQuery}</span>&quot;
            </p>
            <p className="text-[10.5px] text-zinc-600">
              Coba periksa kata kunci atau matikan opsi Match Case / Whole Word.
            </p>
          </div>
        ) : (
          searchResults.map((result, resultIdx) => {
            const isCollapsed = collapsedFiles[result.fileName];
            const isActiveFile = result.fileName === activeFileName;

            return (
              <div
                key={`search-file-${result.fileName}-${resultIdx}`}
                className="border border-[#30363d]/70 rounded-lg overflow-hidden bg-[#161b22]/40"
              >
                {/* File Group Header */}
                <div
                  onClick={() => toggleFileCollapse(result.fileName)}
                  className={`px-2.5 py-1.5 flex items-center justify-between cursor-pointer transition select-none ${
                    isActiveFile
                      ? "bg-blue-950/30 border-b border-blue-900/40 text-blue-300"
                      : "hover:bg-[#21262d] text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    )}
                    <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="font-mono text-xs font-semibold truncate text-white">
                      {result.fileName}
                    </span>
                  </div>

                  <span className="text-[10px] bg-blue-950/80 text-blue-400 border border-blue-800/60 px-1.5 py-0.2 rounded font-bold shrink-0">
                    {result.matches.length}
                  </span>
                </div>

                {/* Match Items List */}
                {!isCollapsed && (
                  <div className="divide-y divide-[#30363d]/40">
                    {result.matches.map((match, idx) => (
                      <div
                        key={`match-${result.fileName}-${match.line}-${match.column}-${idx}`}
                        onClick={() => {
                          handleSwitchFileAndJump(
                            result.fileName,
                            match.line,
                            match.column,
                            match.matchLength
                          );
                        }}
                        className="px-2.5 py-1.5 flex items-center gap-2 hover:bg-[#21262d] transition cursor-pointer group"
                        title={`Buka ${result.fileName} pada Baris ${match.line}, Kolom ${match.column}`}
                      >
                        {/* Line number badge */}
                        <span className="font-mono text-[10px] text-zinc-500 group-hover:text-blue-400 shrink-0 w-12 text-right bg-[#0d1117] px-1 py-0.5 rounded border border-[#30363d]/40">
                          {match.line}:{match.column}
                        </span>

                        {/* Snippet text */}
                        <div className="truncate flex-grow">
                          {renderHighlightedSnippet(
                            match.lineText,
                            match.column,
                            match.matchLength
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
