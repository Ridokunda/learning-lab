export async function extract(file) {
  if (file.size > 10 * 1024 * 1024)
    throw Error("Choose a file no larger than 10 MB.");
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt") {
    const text = await file.text();
    if (text.includes("\u0000"))
      throw Error("This does not appear to be a text file.");
    return text;
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const result = await (mammoth.default || mammoth).extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    if (!result.value.trim())
      throw Error("This document has no extractable text.");
    return result.value;
  }
  if (ext === "pdf") {
    const pdf = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdf.GlobalWorkerOptions.workerSrc = worker.default;
    let doc, loadingTask;
    try {
      loadingTask = pdf.getDocument({
        data: await file.arrayBuffer(),
        isEvalSupported: false,
      });
      doc = await loadingTask.promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i),
          content = await page.getTextContent();
        const text = content.items
          .map((x) => x.str + (x.hasEOL ? "\n" : " "))
          .join("");
        if (!text.trim())
          throw Error(
            `Page ${i} has no readable text. Scanned PDFs are unsupported; use a text-based PDF.`,
          );
        pages.push(`[Page ${i}]\n${text}`);
      }
      return pages.join("\n\n");
    } catch (e) {
      if (e.name === "PasswordException")
        throw Error(
          "Password-protected PDFs are unsupported. Choose an unlocked copy.",
        );
      throw e;
    } finally {
      await loadingTask?.destroy();
    }
  }
  throw Error("Choose a text-based PDF, DOCX, or TXT file.");
}
