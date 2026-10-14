"use client";

import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";

/**
 * The edition as a PDF, made in the reader's browser.
 *
 * Each page is drawn exactly as it appears on screen (a copy of the sheet is
 * laid out off-screen at a fixed width and photographed), then the pages are
 * put together into one PDF. Nothing is sent to the server and nothing runs
 * there: an edition's PDF costs the site nothing however many readers want
 * one. This module and its two libraries are loaded only when a reader
 * presses Download.
 *
 * Every page is watermarked: the paper's name and the edition's date set
 * diagonally across it, faint enough to read through, and a line at the foot
 * with the site's address. A downloaded page passed on still says where it
 * came from.
 */

/** The width each sheet is laid out at for the PDF, in CSS pixels. */
const SHEET_WIDTH = 1000;
/** A4's width in points; each PDF page is as tall as its sheet needs. */
const PAGE_WIDTH = 595;
/** The band under each page that carries the address line. */
const FOOT = 22;

export async function downloadEditionPdf({
  sheets,
  host,
  date,
  dateLabel,
  siteName,
  siteAddress,
  onProgress,
}: {
  /** The sheets, in page order. */
  sheets: HTMLElement[];
  /** Where the copies are laid out: inside the e-paper, so its styles apply. */
  host: HTMLElement;
  /** 2026-10-14, for the file name. */
  date: string;
  /** "Wednesday, 14 October 2026", for the watermark. */
  dateLabel: string;
  siteName: string;
  siteAddress: string;
  onProgress: (fraction: number) => void;
}): Promise<void> {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = `position:fixed;left:-30000px;top:0;width:${SHEET_WIDTH}px;pointer-events:none;`;
  host.appendChild(stage);

  let pdf: jsPDF | null = null;
  try {
    await document.fonts.ready;
    for (let index = 0; index < sheets.length; index += 1) {
      const copy = sheets[index].cloneNode(true) as HTMLElement;
      stage.replaceChildren(copy);

      // Pictures load lazily, and an off-screen copy is never "near the
      // viewport": ask for them now and wait until they are drawn.
      const pictures = [...copy.querySelectorAll("img")];
      pictures.forEach((picture) => {
        picture.loading = "eager";
      });
      await Promise.all(pictures.map((picture) => picture.decode().catch(() => undefined)));

      const image = await toJpeg(copy, {
        // Sharp enough to read the smallest text, light enough to send on.
        quality: 0.78,
        pixelRatio: 1.15,
        backgroundColor: "#ffffff",
        width: SHEET_WIDTH,
        cacheBust: false,
      });
      const height = Math.round((copy.offsetHeight / SHEET_WIDTH) * PAGE_WIDTH);
      const format: [number, number] = [PAGE_WIDTH, height + FOOT];

      if (!pdf) {
        pdf = new jsPDF({ unit: "pt", format, orientation: "portrait", compress: true });
      } else {
        pdf.addPage(format, "portrait");
      }
      pdf.addImage(image, "JPEG", 0, 0, PAGE_WIDTH, height, undefined, "FAST");
      watermark(pdf, height, `${siteName} · E-paper · ${dateLabel.replace(/^[A-Za-z]+, /, "")}`);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(91, 95, 107);
      pdf.text(`${siteAddress} · ${siteName} e-paper · ${dateLabel} · Page ${index + 1}`, PAGE_WIDTH / 2, height + 14, {
        align: "center",
      });

      onProgress((index + 1) / sheets.length);
    }
    pdf?.save(`the-india-decade-epaper-${date}.pdf`);
  } finally {
    stage.remove();
  }
}

/** The paper's name and the date, set diagonally down the page, faint. */
function watermark(pdf: jsPDF, height: number, text: string) {
  pdf.saveGraphicsState();
  pdf.setGState(pdf.GState({ opacity: 0.09 }));
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(20, 22, 28);
  // jsPDF cannot centre rotated text, so start each line half its length
  // back along the slope from the point it should be centred on.
  const angle = 28;
  const radians = (angle * Math.PI) / 180;
  const half = pdf.getTextWidth(text) / 2;
  for (let y = 170; y < height + 60; y += 280) {
    const x = PAGE_WIDTH / 2 - half * Math.cos(radians);
    pdf.text(text, x, y + half * Math.sin(radians), { angle });
  }
  pdf.restoreGraphicsState();
}
