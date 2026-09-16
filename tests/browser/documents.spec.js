import { test, expect } from "@playwright/test";
import JSZip from "jszip";
function pdf(text, encrypted = false) {
  const stream = text ? `BT /F1 12 Tf 30 700 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  if (encrypted)
    objects.push(
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${"00".repeat(32)}> /U <${"00".repeat(32)}> /P -4 >>`,
    );
  let out = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = out.length;
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${encrypted ? "/Encrypt 6 0 R /ID [<0123456789ABCDEF> <0123456789ABCDEF>]" : ""} >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(out);
}
test("PDF and DOCX extraction, page labels, scanned and encrypted rejection", async ({
  page,
}) => {
  await page.goto("/#create");
  const file = page.getByLabel("Choose a document (optional)");
  await file.setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: pdf("Learning from a PDF"),
  });
  await expect(page.locator("#source"))
    .toHaveValue(/\[Page 1\]/)
    .catch(async (error) => {
      console.log(await page.locator("body").innerText());
      throw error;
    });
  await expect(page.locator("#source")).toHaveValue(/Learning from a PDF/);
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Learning from a DOCX</w:t></w:r></w:p></w:body></w:document>',
  );
  await file.setInputFiles({
    name: "notes.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.locator("#source")).toHaveValue(/Learning from a DOCX/);
  await file.setInputFiles({
    name: "scanned.pdf",
    mimeType: "application/pdf",
    buffer: pdf(""),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Scanned PDFs are unsupported",
  );
  await file.setInputFiles({
    name: "locked.pdf",
    mimeType: "application/pdf",
    buffer: pdf("Locked text", true),
  });
  await expect(page.getByRole("alert")).toContainText("Password-protected");
  await file.setInputFiles({
    name: "too-big.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("10 MB");
  await file.setInputFiles({
    name: "unsupported.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b"),
  });
  await expect(page.getByRole("alert")).toContainText("PDF, DOCX, or TXT");
});
