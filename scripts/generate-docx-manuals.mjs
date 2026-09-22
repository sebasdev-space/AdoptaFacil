// Regenerates the client-facing .docx manuals from their Markdown sources,
// embedding every referenced screenshot as an inline data URI so each output
// file is a single self-contained document. Run with `pnpm docs:manuals`
// after editing docs/manual/*.md. No pandoc/LibreOffice binary is required.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import HTMLtoDOCX from 'html-to-docx';

const MANUAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'manual');

const FILES = [
  { md: 'Manual_Usuario_Publico.md', title: 'AdoptaFácil — Manual de Usuario (Público)' },
  { md: 'Manual_Usuario_Organizacion.md', title: 'AdoptaFácil — Manual de Usuario (Organización)' },
  {
    md: 'Manual_Administracion_Plataforma.md',
    title: 'AdoptaFácil — Manual de Administración de Plataforma',
  },
];

function imgToDataUri(srcPath) {
  const abs = resolve(MANUAL_DIR, srcPath);
  const buf = readFileSync(abs);
  const ext = extname(abs).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buf.toString('base64')}`;
}

marked.use({
  renderer: {
    image(token) {
      const href = token.href || '';
      let dataUri = href;
      if (!href.startsWith('data:') && !href.startsWith('http')) {
        try {
          dataUri = imgToDataUri(href);
        } catch (e) {
          console.error('  ! no se pudo incrustar imagen', href, e.message);
        }
      }
      const alt = token.text || '';
      return `<img src="${dataUri}" alt="${alt}" style="max-width:600px;" />`;
    },
  },
});

async function convertOne({ md, title }) {
  const mdPath = join(MANUAL_DIR, md);
  let source = readFileSync(mdPath, 'utf8');

  // remove [TOC] marker (not meaningful outside the md viewer) — html-to-docx
  // will get its own generated TOC field instead.
  source = source.replace(/^\[TOC\]\s*$/m, '');

  const bodyHtml = marked.parse(source);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyHtml}</body></html>`;

  const buffer = await HTMLtoDOCX(html, null, {
    title,
    orientation: 'portrait',
    margins: { top: 720, right: 720, bottom: 720, left: 720 },
    font: 'Calibri',
    fontSize: 22,
    table: { row: { cantSplit: true } },
  });

  const outPath = join(MANUAL_DIR, md.replace(/\.md$/, '.docx'));
  writeFileSync(outPath, buffer);
  console.log('OK ->', outPath, `(${(buffer.length / 1024).toFixed(0)} KB)`);
}

for (const f of FILES) {
  console.log('Convirtiendo', f.md, '...');
  await convertOne(f);
}
