import { BadGatewayException, BadRequestException, Body, Controller, Get, Post, Put } from "@nestjs/common";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../auth/auth.decorators.js";
import { parse } from "../common/validation.js";
import { SettingsService } from "./settings.service.js";

const SYSTEM_PROMPT = `You write Playwright automation scripts for a hosted runner.

Runtime:
- The code runs as the body of an async function. Do not launch or close the browser.
- These are already defined: page, context, browser, console, require, pause(label), solveCaptcha(selector), chooseElements(selector).
- Start by navigating with: await page.goto(url, { waitUntil: "domcontentloaded" }).
- Prefer resilient locators (getByRole, getByText, locator with waits).
- Files written with a relative path (page.screenshot({ path: "shot.png" }), fs.writeFileSync("data.json", ...)) are collected as run outputs.
- Uploaded input files are readable from "uploads/<name>".
- exceljs is installed for spreadsheets. Other npm packages are installed on first require.
- process.env holds the user's variables.

Return only code that runs as-is.`;

@Controller("ai")
export class AiController {
  constructor(private readonly settings: SettingsService) {}

  @Get("settings")
  view(@CurrentUser() user: SessionUser) {
    return this.settings.publicView(user.id);
  }

  @Put("settings")
  save(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = parse(z.object({ apiKey: z.string().max(200), model: z.string().trim().min(1).max(80) }), body);
    return this.settings.save(user.id, input);
  }

  @Post("generate")
  async generate(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = parse(
      z.object({
        prompt: z.string().trim().min(3, "Describe what the script should do.").max(4000),
        currentCode: z.string().max(200_000).optional(),
        mode: z.enum(["replace", "append", "prepend"]).default("replace"),
      }),
      body,
    );
    const { apiKey, model } = await this.settings.gemini(user.id);
    if (!apiKey) throw new BadRequestException("Add a Gemini API key in AI settings first.");

    let contents = `Task: ${input.prompt}`;
    if (input.currentCode?.trim() && input.mode !== "replace") {
      contents += `\n\nExisting script:\n\`\`\`js\n${input.currentCode}\n\`\`\`\nWrite only the code to ${input.mode === "append" ? "add after" : "add before"} it.`;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING, description: "Script body, no markdown fences." },
              explanation: { type: Type.STRING, description: "Two or three sentences on what the script does." },
            },
            required: ["code"],
          },
        },
      });
      const parsed = JSON.parse(response.text?.trim() || "{}") as { code?: string; explanation?: string };
      if (!parsed.code) throw new Error("The model returned no code.");
      return { code: parsed.code, explanation: parsed.explanation ?? "" };
    } catch (err) {
      throw new BadGatewayException(`Gemini request failed: ${(err as Error).message}`);
    }
  }
}
