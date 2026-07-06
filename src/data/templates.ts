import { ScriptTemplate } from "../types";

export const TEMPLATES: ScriptTemplate[] = [
  {
    id: "basic",
    name: "Scrape Title & Heading",
    description: "Loads example.com, reads the header text and document page title.",
    code: `// Playwright browser, context, and page are globally available
await page.goto("https://example.com");

console.log("Extracting heading text content...");
const heading = await page.$eval("h1", el => el.textContent.trim());

const title = await page.title();
console.log('Scraped success! Page Title: \"' + title + '\", Heading element: \"' + heading + '\"');

return {
  title,
  heading,
  engine: "Playwright Headless"
};`
  },
  {
    id: "screenshot",
    name: "Take Full Web Screenshot",
    description: "Navigates to Unsplash, waits for loading, and snaps a PNG screenshot.",
    code: `console.log("Loading Unsplash home page...");
await page.goto("https://unsplash.com", { waitUntil: "domcontentloaded" });

console.log("Allowing dynamic photos 2.5s to resolve...");
await page.waitForTimeout(2500);

console.log("Capturing full viewport screenshot into unsplash_shoot.png...");
// Files written under .png, .jpg, or .jpeg are automatically moved and presented in the screenshots tab
await page.screenshot({ path: "unsplash_shoot.png" });

console.log("Screenshot successfully saved and compiled to panel!");`
  },
  {
    id: "pdf",
    name: "Print web-page to PDF",
    description: "Saves a high-fidelity formatted PDF print of the Wikipedia page.",
    code: `console.log("Navigating to Wikipedia Playwright software subject...");
await page.goto("https://en.wikipedia.org/wiki/Playwright_(software)");

console.log("Rendering printer-friendly document PDF output...");
// .pdf extension outputs are automatically moved and presented under download tab
await page.pdf({ 
  path: "playwright_wiki.pdf", 
  format: "A4",
  printBackground: true 
});

console.log("PDF file printed as playwright_wiki.pdf!");`
  },
  {
    id: "duckduckgo",
    name: "Search DuckDuckGo & Scrape",
    description: "Performs organic keyword search, parses and displays top links.",
    code: `console.log("Opening DuckDuckGo search...");
await page.goto("https://html.duckduckgo.com/html/?q=Playwright+automation+documentation");

console.log("Scraping search result elements...");
const results = await page.$$eval(".result__body", elements => {
  return elements.slice(0, 4).map(el => {
    const titleEl = el.querySelector(".result__title a");
    const snippetEl = el.querySelector(".result__snippet");
    return {
      title: titleEl ? titleEl.textContent.trim() : "",
      url: titleEl ? titleEl.getAttribute("href") : "",
      snippet: snippetEl ? snippetEl.textContent.trim() : ""
    };
  });
});

console.log("Scrape success! Parsed " + results.length + " links:");
results.forEach((item, index) => {
  console.log("[" + (index + 1) + "] " + item.title + " -> " + item.url);
});

return {
  search_target: "DuckDuckGo",
  results
};`
  },
  {
    id: "exceljs",
    name: "Create Excel with ExcelJS",
    description: "Generates an Excel spreadsheet workbook using exceljs package.",
    code: `console.log("Loading ExcelJS module...");
const ExcelJS = require("exceljs");

console.log("Creating blank Excel Workbook...");
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet("Product Inventory");

// Setup core columns
worksheet.columns = [
  { header: "ID", key: "id", width: 10 },
  { header: "Product Name", key: "name", width: 30 },
  { header: "Category", key: "category", width: 20 },
  { header: "Price", key: "price", width: 15 },
  { header: "Stock", key: "stock", width: 15 }
];

// Stylize header row
worksheet.getRow(1).font = { bold: true };

// Add product listings
worksheet.addRow({ id: 101, name: "Wireless Keyboard", category: "Electronics", price: 49.99, stock: 120 });
worksheet.addRow({ id: 102, name: "Ergonomic Office Chair", category: "Furniture", price: 189.50, stock: 45 });
worksheet.addRow({ id: 103, name: "Stainless Thermal Bottle", category: "Kitchenware", price: 24.00, stock: 310 });
worksheet.addRow({ id: 104, name: "Noise Cancelling Headphones", category: "Electronics", price: 299.99, stock: 85 });

console.log("Writing excel data to disk as products.xlsx...");
// Any written .xlsx, .xls, or .csv files are automatically tracked and available in output asset downloads!
await workbook.xlsx.writeFile("products.xlsx");

console.log("Excel workbook successfully created: products.xlsx");
return {
  success: true,
  filename: "products.xlsx",
  rows: 4
};`
  },
  {
    id: "captcha-ocr",
    name: "Bypass Text Image CAPTCHA",
    description: "Demonstrates using the built-in Tesseract OCR engine to bypass text CAPTCHA images.",
    code: `console.log("Navigating to a sample page or rendering a local mockup...");
// For demonstration, we can navigate to any site with a basic text-based visual element, or use solveCaptcha on an element.
// In actual scripts, target the specific selector of the <img> or <canvas> displaying the CAPTCHA code.
await page.goto("https://example.com");

console.log("Solving CAPTCHA via Tesseract OCR engine...");
// Here we target the header as a proxy for the OCR target to show full functionality.
// We can pass 'binarize: true' to convert the CAPTCHA image to a high-contrast black & white version to improve Tesseract OCR recognition.
// We can also use a whitelisting filter to maximize OCR accuracy for alphanumeric characters.
const ocrResult = await page.solveCaptcha("h1", {
  charWhitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  cleanText: true,
  binarize: true
});

console.log("OCR solver completed successfully!");
console.log("Detected CAPTCHA text: \\"" + ocrResult.text + "\\"");
console.log("Confidence: " + ocrResult.confidence + "%");

return {
  success: true,
  captchaText: ocrResult.text,
  confidence: ocrResult.confidence,
  hint: "Use page.solveCaptcha(selector, options) or solveCaptcha(selector, options) in your scripts."
};`
  },
  {
    id: "iterate-elements",
    name: "Iterate Multiple Elements",
    description: "Demonstrates selecting a list of DOM elements and iterating over them to scrape their text and links.",
    code: `console.log("Navigating to Wikipedia home page...");
await page.goto("https://en.wikipedia.org/wiki/Main_Page");

console.log("Selecting multiple featured navigation links to iterate later...");
const selector = "#p-navigation li a";

// Get list of matching elements in the DOM
const elements = await page.locator(selector).all();
console.log("Found " + elements.length + " elements matching the list selector: " + selector);

const linksData = [];
for (let i = 0; i < elements.length; i++) {
  const element = elements[i];
  const text = await element.textContent();
  const href = await element.getAttribute("href");
  const cleanText = text ? text.trim() : "";
  console.log("[" + (i + 1) + "] Iterated element: \\"" + cleanText + "\\" -> " + href);
  if (cleanText) {
    linksData.push({ text: cleanText, url: href });
  }
}

return {
  total_iterated: elements.length,
  scraped_links: linksData
};`
  },
  {
    id: "interactive-selection",
    name: "Interactive Selection Picker",
    description: "Demonstrates using the new interactive multiple choice element picker to filter list items at runtime.",
    code: `console.log("Navigating to Wikipedia Main Page...");
await page.goto("https://en.wikipedia.org/wiki/Main_Page");

console.log("Triggering interactive chooseElements list picker...");
const selector = "#p-navigation li a";

// Prompt the user to select which elements to scrape using a beautiful checkbox multiple-choice UI
const selectedElements = await page.chooseElements(selector);
console.log("User finished selecting. Received " + selectedElements.length + " chosen element locators!");

const linksData = [];
for (let i = 0; i < selectedElements.length; i++) {
  const element = selectedElements[i];
  const text = await element.textContent();
  const href = await element.getAttribute("href");
  const cleanText = text ? text.trim() : "";
  console.log("[" + (i + 1) + "] Processing chosen item: \\"" + cleanText + "\\" -> " + href);
  if (cleanText) {
    linksData.push({ text: cleanText, url: href });
  }
}

return {
  status: "success",
  chosenCount: selectedElements.length,
  scrapedData: linksData
};`
  }
];
