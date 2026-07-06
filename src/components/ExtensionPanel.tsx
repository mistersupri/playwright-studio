import React from "react";
import { Puzzle, Download } from "lucide-react";
import { EXTENSION_FILES } from "../data/extensionFiles";

interface ExtensionPanelProps {
  selectedExtensionFileIndex: number;
  setSelectedExtensionFileIndex: (index: number) => void;
  handleDownloadExtensionZip: () => void;
  addTerminalLine: (message: string, type: "info" | "success" | "warning" | "error" | "log") => void;
}

export default function ExtensionPanel({
  selectedExtensionFileIndex,
  setSelectedExtensionFileIndex,
  handleDownloadExtensionZip,
  addTerminalLine,
}: ExtensionPanelProps) {
  return (
    <div className="flex-grow flex flex-col overflow-hidden p-3 bg-[#0d1117] font-sans">
      <div className="px-1 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center justify-between shrink-0 select-none font-sans">
        <div className="flex items-center gap-1.5 text-purple-400 font-sans">
          <Puzzle className="h-3.5 w-3.5" />
          <span>Chrome Extension Recorder</span>
        </div>
        <span className="text-[8px] bg-purple-950/40 text-purple-300 font-mono font-bold px-1.5 py-0.5 rounded border border-purple-900/30 flex items-center gap-1 select-none font-sans">
          v1.1.0
        </span>
      </div>

      <div className="flex-grow flex flex-col min-h-0 space-y-3 justify-between text-left">
        <div className="space-y-3.5 flex-grow overflow-y-auto pr-1 select-none scrollbar-thin">
          
          {/* Intro info card */}
          <div className="p-3 border border-purple-900/30 bg-purple-955/5 rounded-lg text-[10.5px] leading-relaxed text-zinc-300 select-text">
            <p className="mb-1 text-zinc-200 font-semibold text-[11px] font-sans">Alur Manual Menjadi Script Playwright Otomatis!</p>
            <p className="text-zinc-400 text-[10px] leading-relaxed select-text">
              Rekam setiap klik, input keyboard, navigasi halaman, screenshot, dan wait selector langsung dari browser asli Anda. Ekstensi Chrome ini akan menghasilkan kode otomasi Playwright yang bersih dan siap dijalankan.
            </p>
            
            {/* Action button to download the bundle */}
            <button
              onClick={handleDownloadExtensionZip}
              className="w-full h-8 mt-3 cursor-pointer rounded-md font-semibold bg-purple-600 hover:bg-purple-550 active:bg-purple-700 text-white transition-colors duration-200 flex items-center justify-center gap-1.5 text-[10.5px] font-sans shadow-md"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Extension Bundle (.zip)</span>
            </button>
          </div>

          {/* Interactive File Viewer */}
          <div className="border border-[#30363d] rounded-lg bg-[#161b22]/30 overflow-hidden">
            <div className="p-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between select-none">
              <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider font-sans">Bundle Files Preview</span>
              <span className="text-[8.5px] text-zinc-500 font-mono font-bold">{EXTENSION_FILES.length} Files</span>
            </div>
            
            {/* File names list */}
            <div className="grid grid-cols-3 gap-1 p-2 bg-[#0d1117] border-b border-[#30363d]/60 select-none">
              {EXTENSION_FILES.map((file, i) => (
                <button
                  key={`ext-file-${file.name}-${i}`}
                  onClick={() => setSelectedExtensionFileIndex(i)}
                  className={`px-1 py-1 text-[8.5px] font-mono rounded border text-center truncate transition-all cursor-pointer ${
                    selectedExtensionFileIndex === i
                      ? "bg-[#2d1b4e] border-purple-500/50 text-purple-300 font-bold"
                      : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:bg-[#21262d] hover:text-zinc-200"
                  }`}
                  title={file.name}
                >
                  {file.name}
                </button>
              ))}
            </div>
            
            {/* Selected file content preview */}
            <div className="p-2 bg-[#050505] relative select-text">
              <div className="flex items-center justify-between mb-1 select-none">
                <span className="text-[8.5px] font-mono text-zinc-500">{EXTENSION_FILES[selectedExtensionFileIndex].name}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(EXTENSION_FILES[selectedExtensionFileIndex].code);
                    addTerminalLine(`Copied ${EXTENSION_FILES[selectedExtensionFileIndex].name} code to clipboard`, "info");
                  }}
                  className="text-[8.5px] px-1.5 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#21262d] cursor-pointer transition-colors font-sans font-semibold"
                >
                  Copy
                </button>
              </div>
              <pre className="text-[9px] font-mono text-zinc-400 bg-transparent overflow-x-auto max-h-[110px] leading-relaxed scrollbar-thin select-text p-1.5 border border-[#30363d]/25 rounded whitespace-pre">
                {EXTENSION_FILES[selectedExtensionFileIndex].code}
              </pre>
            </div>
          </div>

          {/* Interactive installation manual */}
          <div className="space-y-2 select-text">
            <span className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider select-none px-1 block font-sans">Cara Instalasi & Penggunaan</span>
            
            <div className="space-y-1.5 font-sans">
              <div className="p-2.5 border border-[#30363d] rounded-lg bg-[#161b22]/25 flex items-start gap-2.5">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-950 text-purple-400 border border-purple-900/30 font-mono text-[9px] font-bold select-none">1</div>
                <div className="text-[10px] leading-relaxed text-zinc-400 select-text">
                  <strong className="text-zinc-200 font-semibold">Download ZIP</strong>: Klik tombol di atas untuk mengunduh bundle ekstensi, lalu ekstrak folder ZIP tersebut di komputer Anda.
                </div>
              </div>
              <div className="p-2.5 border border-[#30363d] rounded-lg bg-[#161b22]/25 flex items-start gap-2.5">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-950 text-purple-400 border border-purple-900/30 font-mono text-[9px] font-bold select-none">2</div>
                <div className="text-[10px] leading-relaxed text-zinc-400 select-text">
                  <strong className="text-zinc-200 font-semibold">Buka Extensions Chrome</strong>: Pada browser Google Chrome Anda, akses alamat <code className="text-purple-300 font-mono text-[9px] px-1 bg-black/40 rounded">chrome://extensions/</code>.
                </div>
              </div>
              <div className="p-2.5 border border-[#30363d] rounded-lg bg-[#161b22]/25 flex items-start gap-2.5">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-950 text-purple-400 border border-purple-900/30 font-mono text-[9px] font-bold select-none">3</div>
                <div className="text-[10px] leading-relaxed text-zinc-400 select-text">
                  <strong className="text-zinc-200 font-semibold">Aktifkan Developer Mode</strong>: Klik tombol toggle <strong className="text-zinc-200">Developer mode</strong> yang terletak di pojok kanan atas layar Chrome Anda.
                </div>
              </div>
              <div className="p-2.5 border border-[#30363d] rounded-lg bg-[#161b22]/25 flex items-start gap-2.5">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-950 text-purple-400 border border-purple-900/30 font-mono text-[9px] font-bold select-none">4</div>
                <div className="text-[10px] leading-relaxed text-zinc-400 select-text">
                  <strong className="text-zinc-200 font-semibold">Load Unpacked</strong>: Klik tombol <strong className="text-zinc-200">Load unpacked</strong> di kiri atas, lalu pilih folder hasil ekstrak tadi (pilih folder induk yang berisi <code className="text-[9px] font-mono bg-black/40 px-1 rounded text-zinc-300">manifest.json</code>).
                </div>
              </div>
              <div className="p-2.5 border border-[#30363d] rounded-lg bg-[#161b22]/25 flex items-start gap-2.5">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-950 text-purple-400 border border-purple-900/30 font-mono text-[9px] font-bold select-none">5</div>
                <div className="text-[10px] leading-relaxed text-zinc-400 select-text">
                  <strong className="text-zinc-200 font-semibold">Mulai Rekam</strong>: Pin ikon ekstensi di browser Anda. Klik ikon tersebut pada situs web apa pun untuk merekam alur interaksi Anda dan mengekspornya langsung menjadi kode Playwright!
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Tip */}
        <div className="pt-2 border-t border-[#30363d]/50 shrink-0 text-zinc-500 text-[9px] leading-relaxed flex items-start gap-1.5 font-sans select-none">
          <div className="text-purple-400 mt-0.5 shrink-0">💡</div>
          <span>Tip: Ekstensi ini mendukung ekspor script langsung ke format TypeScript, JavaScript, dan Python sesuai kebutuhan otomatisasi Anda!</span>
        </div>
      </div>
    </div>
  );
}
