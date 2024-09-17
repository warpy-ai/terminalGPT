/* eslint-disable @typescript-eslint/no-explicit-any */
import chalk from "chalk";
import { Plugin } from "./index";
import { promptResponse } from "../utils";
import { chromium, Browser, BrowserContext } from "playwright";
import randomUseragent from "random-useragent";
import { JSDOM } from "jsdom";
import { encoding_for_model } from "@dqbd/tiktoken";
import { addContext } from "../context";

const scrapperPlugin: Plugin = {
  name: "scrapper",
  keyword: "@scrapper",
  description:
    "Scrapes / Reads a website from a given URL from the user input and returns the content ",
  execute: async (context: {
    userInput: string;
    engine: string;
    apiKey: string;
    opts: any;
  }) => {
    const { userInput, engine, apiKey, opts } = context;
    // use regex to remove keyword and other texts, leave only the URL, note the URL can be http or https
    const url = userInput.match(
      /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/
    )?.[0];

    if (url) {
      try {
        // Scrape the website
        const scrapedContent = await scrapeWebsite(url);
        console.log(chalk.cyan("Got Web results"));

        // Add scraped content to context
        addContext({
          role: "system",
          content: `Scraped content from ${url}:\n\n${scrapedContent}`,
        });

        const enhancedPrompt = `Based on the following information from web scraping, please provide a summary or answer:
        ${scrapedContent}
        
        User query: ${url}`;

        const response = await promptResponse(
          engine,
          apiKey,
          enhancedPrompt,
          opts
        );
        return response;
      } catch (error) {
        console.error(chalk.red(`Error during web scraping: ${error}`));
        return `Error: ${error}`;
      }
    } else {
      console.log(chalk.yellow("Please provide a URL. Usage: @scrapper <URL>"));
      return "Error: No URL provided";
    }
  },
};

async function scrapeWebsite(url: string): Promise<string> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const userAgent = randomUseragent.getRandom();
    context = await browser.newContext({ userAgent });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "networkidle" });
    const content = await page.content();

    const dom = new JSDOM(content);
    const document = dom.window.document;

    const title = document.querySelector("title")?.textContent || "";
    const mainContent =
      document.querySelector("main, article, .content")?.textContent || "";
    const paragraphs = Array.from(document.querySelectorAll("p"))
      .map((p: any) => p.textContent)
      .join("\n");

    let extractedContent = `Title: ${title}\n\nMain Content:\n${mainContent}\n\nParagraphs:\n${paragraphs}`;

    const encoder = encoding_for_model("gpt-4");
    const maxTokens = 150000;

    let tokens = encoder.encode(extractedContent);
    while (tokens.length > maxTokens) {
      extractedContent = extractedContent.slice(
        0,
        Math.floor(extractedContent.length * 0.9)
      );
      tokens = encoder.encode(extractedContent);
    }

    return extractedContent;
  } catch (error) {
    console.error(chalk.red(`Error scraping website: ${error}`));
    throw error;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

export default scrapperPlugin;
