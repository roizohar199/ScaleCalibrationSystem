import { chromium, type PDFOptions } from "playwright";

export async function renderHtmlToPdfBuffer(
  html: string,
  options?: {
    format?: "A4";
    marginMm?: { top: number; right: number; bottom: number; left: number };
  }
): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "load" });

    // Critical: wait for fonts to be ready (otherwise you get garbled glyph mapping)
    await page.evaluate(async () => {
      // @ts-ignore
      await document.fonts.ready;
    });

    const margin = options?.marginMm ?? { top: 10, right: 10, bottom: 10, left: 10 };

    const pdfOptions: PDFOptions = {
      format: options?.format ?? "A4",
      printBackground: true,
      margin: {
        top: `${margin.top}mm`,
        right: `${margin.right}mm`,
        bottom: `${margin.bottom}mm`,
        left: `${margin.left}mm`,
      },
      preferCSSPageSize: true,
    };

    const pdf = await page.pdf(pdfOptions);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
