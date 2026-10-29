import { createWorker } from "tesseract.js";
import { Page } from "playwright";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

export interface CaptchaSolveOptions {
  lang?: string;
  charWhitelist?: string;
  cleanText?: boolean; // automatically remove non-alphanumeric or extra spaces
  binarize?: boolean; // toggle high-contrast black and white preprocessing
  useGemini?: boolean; // toggle using Gemini API for OCR
  gemini?: { apiKey?: string; model?: string; onUsed?: () => void };
}

export interface CaptchaSolveResult {
  text: string;
  confidence: number;
}

function getGeminiClient(apiKey?: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error("Add a Gemini API key in AI settings to use Gemini OCR.");
  }
  return new GoogleGenAI({ apiKey });
}

// ==========================================
// Advanced Morphological Preprocessing Steps
// ==========================================

function threshold(src: Uint8Array, width: number, height: number, thresholdVal: number = 160): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = src[i * 3];
    const g = src[i * 3 + 1];
    const b = src[i * 3 + 2];
    const gray = (r + g + b) / 3;
    out[i] = gray < thresholdVal ? 255 : 0;
  }
  return out;
}

function majority(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let count = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if (src[(y + j) * width + (x + i)]) {
            count++;
          }
        }
      }
      out[y * width + x] = count >= 5 ? 255 : 0;
    }
  }
  return out;
}

function prune(src: Uint8Array, width: number, height: number, minNeighbors = 2): Uint8Array {
  const out = new Uint8Array(src);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!src[idx]) continue;

      let neighbors = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if (i === 0 && j === 0) continue;
          if (src[(y + j) * width + (x + i)]) {
            neighbors++;
          }
        }
      }

      if (neighbors < minNeighbors) {
        out[idx] = 0;
      }
    }
  }
  return out;
}

function erode(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let ok = true;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if (src[(y + j) * width + x + i] === 0) {
            ok = false;
          }
        }
      }
      out[y * width + x] = ok ? 255 : 0;
    }
  }
  return out;
}

function dilate(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let ok = false;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if (src[(y + j) * width + x + i]) {
            ok = true;
          }
        }
      }
      out[y * width + x] = ok ? 255 : 0;
    }
  }
  return out;
}

function opening(src: Uint8Array, width: number, height: number): Uint8Array {
  return dilate(erode(src, width, height), width, height);
}

function removeThinHorizontal(src: Uint8Array, width: number, height: number, minLength = 10, maxThickness = 2): Uint8Array {
  const out = new Uint8Array(src);
  for (let y = 0; y < height; y++) {
    let run: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (src[idx]) {
        run.push(idx);
      } else {
        if (run.length >= minLength) {
          let thick = false;
          for (const p of run) {
            const xx = p % width;
            const yy = Math.floor(p / width);
            let h = 0;
            for (let k = -2; k <= 2; k++) {
              const ny = yy + k;
              if (ny >= 0 && ny < height && src[ny * width + xx]) {
                h++;
              }
            }
            if (h > maxThickness) {
              thick = true;
              break;
            }
          }
          if (!thick) {
            for (const p of run) {
              out[p] = 0;
            }
          }
        }
        run = [];
      }
    }
    // Handle run that reaches the end of the row
    if (run.length >= minLength) {
      let thick = false;
      for (const p of run) {
        const xx = p % width;
        const yy = Math.floor(p / width);
        let h = 0;
        for (let k = -2; k <= 2; k++) {
          const ny = yy + k;
          if (ny >= 0 && ny < height && src[ny * width + xx]) {
            h++;
          }
        }
        if (h > maxThickness) {
          thick = true;
          break;
        }
      }
      if (!thick) {
        for (const p of run) {
          out[p] = 0;
        }
      }
    }
  }
  return out;
}

function removeSmallObjects(src: Uint8Array, width: number, height: number, minArea = 40): Uint8Array {
  const visited = new Uint8Array(width * height);
  const out = new Uint8Array(src);
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!src[idx] || visited[idx]) continue;

      const queue: [number, number][] = [[x, y]];
      const pixels: number[] = [];
      visited[idx] = 1;

      while (queue.length) {
        const popped = queue.pop();
        if (!popped) continue;
        const [cx, cy] = popped;
        pixels.push(cy * width + cx);

        for (let k = 0; k < 8; k++) {
          const nx = cx + dx[k];
          const ny = cy + dy[k];

          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const ni = ny * width + nx;
          if (visited[ni]) continue;
          if (!src[ni]) continue;

          visited[ni] = 1;
          queue.push([nx, ny]);
        }
      }

      if (pixels.length < minArea) {
        for (const p of pixels) {
          out[p] = 0;
        }
      }
    }
  }
  return out;
}

/**
 * Advanced high-contrast image preprocessing pipeline.
 * Scaled and filtered for maximum Tesseract OCR accuracy.
 */
export async function binarizeImage(imageBuffer: Buffer): Promise<Buffer> {
  const SCALE = 4;
  const CONFIG = {
    threshold: 160,
    majorityIteration: 1,
    pruneIteration: 4,
    minNeighbors: 2,
    openingIteration: 1,
    removeLineIteration: 5,
    lineLength: 2,
    lineThickness: 3.5,
    minComponentArea: 60
  };

  // 1. Load image and upscale with nearest neighbor interpolation for sharp pixels
  const img = sharp(imageBuffer);
  const metadata = await img.metadata();
  const width = metadata.width || 145;
  const height = metadata.height || 52;

  const { data, info } = await img
    .resize({
      width: width * SCALE,
      height: height * SCALE,
      kernel: sharp.kernel.nearest
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. Initial Thresholding
  let binary = threshold(data, info.width, info.height, CONFIG.threshold);

  // 3. Majority filter
  for (let i = 0; i < CONFIG.majorityIteration; i++) {
    binary = majority(binary, info.width, info.height);
  }

  // 4. Pruning
  for (let i = 0; i < CONFIG.pruneIteration; i++) {
    binary = prune(binary, info.width, info.height, CONFIG.minNeighbors);
  }

  // 5. Morphological Opening
  for (let i = 0; i < CONFIG.openingIteration; i++) {
    binary = opening(binary, info.width, info.height);
  }

  // 6. Remove thin noise/crossing lines
  for (let i = 0; i < CONFIG.removeLineIteration; i++) {
    binary = removeThinHorizontal(
      binary,
      info.width,
      info.height,
      CONFIG.lineLength,
      CONFIG.lineThickness
    );
  }

  // 7. Remove small stray component artifacts
  binary = removeSmallObjects(
    binary,
    info.width,
    info.height,
    CONFIG.minComponentArea
  );

  // 8. Construct clean high-contrast black characters on white background RGB image
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < binary.length; i++) {
    const c = binary[i];
    // Invert the foreground (255 is white char -> 0 black char, 0 black background -> 255 white background)
    const inverted = 255 - c;
    rgb[i * 3] = inverted;
    rgb[i * 3 + 1] = inverted;
    rgb[i * 3 + 2] = inverted;
  }

  // 9. Convert RGB buffer back to PNG Buffer
  return await sharp(rgb, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 3
    }
  })
    .png()
    .toBuffer();
}

/**
 * Solves an image-based CAPTCHA by taking a screenshot of the specified element
 * and processing it with Tesseract OCR.
 */
export async function solveCaptcha(
  page: Page,
  selector: string,
  options: CaptchaSolveOptions = {}
): Promise<CaptchaSolveResult> {
  if (!page) {
    throw new Error("solveCaptcha: 'page' instance is required.");
  }
  if (!selector) {
    throw new Error("solveCaptcha: 'selector' is required.");
  }

  // 1. Locate the captcha element and take a high-quality screenshot of it
  const element = page.locator(selector);
  const elementExists = await element.count().then(c => c > 0);
  if (!elementExists) {
    throw new Error(`solveCaptcha: Element with selector "${selector}" was not found on the page.`);
  }

  // Take screenshot as buffer
  const imageBuffer = await element.screenshot({ type: "png" });

  // Save the original CAPTCHA screenshot to cwd so it gets picked up as an artifact in the UI
  try {
    fs.writeFileSync(path.join(process.cwd(), "captcha_original.png"), imageBuffer);
  } catch (err) {
    // Fail silently on file writing errors to keep script executing
  }

  let finalBuffer = imageBuffer;

  // Apply binarization if toggled
  if (options.binarize) {
    try {
      const binarizedBuffer = await binarizeImage(imageBuffer);
      finalBuffer = binarizedBuffer;
      // Save binarized screenshot to cwd so it gets picked up as an artifact in the UI
      fs.writeFileSync(path.join(process.cwd(), "captcha_binarized.png"), binarizedBuffer);
    } catch (err) {
      // Fallback silently to original screenshot if binarization fails
    }
  }

  // 2. Recognize text using Tesseract
  return solveCaptchaFromBuffer(finalBuffer, options);
}

/**
 * Solves an image CAPTCHA from a Buffer, local path, base64, or URL.
 */
export async function solveCaptchaFromBuffer(
  source: Buffer | string,
  options: CaptchaSolveOptions = {}
): Promise<CaptchaSolveResult> {
  if (options.useGemini) {
    try {
      const ai = getGeminiClient(options.gemini?.apiKey);
      let imageBuffer: Buffer;
      if (Buffer.isBuffer(source)) {
        imageBuffer = source;
      } else if (typeof source === "string") {
        if (source.startsWith("data:")) {
          const base64Data = source.split(",")[1];
          imageBuffer = Buffer.from(base64Data, "base64");
        } else if (fs.existsSync(source)) {
          imageBuffer = fs.readFileSync(source);
        } else {
          throw new Error("Invalid or unsupported image source string for Gemini CAPTCHA OCR.");
        }
      } else {
        throw new Error("Invalid image source type for Gemini CAPTCHA OCR.");
      }

      const imagePart = {
        inlineData: {
          mimeType: "image/png",
          data: imageBuffer.toString("base64"),
        },
      };

      const promptText = options.charWhitelist 
        ? `Analyze this CAPTCHA image and extract the text. The characters can only be from this whitelist: ${options.charWhitelist}. Return ONLY the exact characters from the CAPTCHA. No intro, no explanation, no spaces, no punctuation, and no markdown. Just the code.`
        : `Analyze this CAPTCHA image and extract the text. Return ONLY the exact characters from the CAPTCHA. No intro, no explanation, no spaces, no punctuation, and no markdown. Just the code.`;

      const response = await ai.models.generateContent({
        model: options.gemini?.model || "gemini-2.5-flash",
        contents: { parts: [imagePart, { text: promptText }] },
      });

      let text = response.text ? response.text.trim() : "";
      
      if (options.cleanText) {
        text = text.replace(/[^a-zA-Z0-9]/g, "");
      }

      options.gemini?.onUsed?.();

      return {
        text,
        confidence: 99,
      };
    } catch (err: any) {
      console.warn(`[CaptchaSolver] Gemini CAPTCHA OCR failed or is missing key: ${err.message || err}. Automatically falling back to secondary Tesseract OCR...`);
    }
  }

  // Tesseract OCR fallback or default
  const lang = options.lang || "eng";
  const worker = await createWorker(lang);

  try {
    // Apply character whitelist if specified to increase accuracy
    if (options.charWhitelist) {
      await worker.setParameters({
        tessedit_char_whitelist: options.charWhitelist,
      });
    }

    const response = await worker.recognize(source);
    let text = response.data.text ? response.data.text.trim() : "";
    const confidence = response.data.confidence || 0;

    if (options.cleanText) {
      // Remove whitespaces and special characters for standard short text CAPTCHAs
      text = text.replace(/[^a-zA-Z0-9]/g, "");
    }

    return {
      text,
      confidence,
    };
  } finally {
    await worker.terminate();
  }
}
