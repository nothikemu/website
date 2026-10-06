import "server-only";
import { extensionOf } from "@/lib/files";

/**
 * Content inspection run after an upload lands in storage:
 *  - magic-byte sniffing to reject executables and mislabelled files
 *  - lightweight, format-aware metadata extraction used by file history and
 *    binary "metadata diffs". New CAD-aware extractors plug in here.
 */
export function sniff(head: Buffer): { executable: boolean; detected?: string } {
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return { executable: true, detected: "pe" };
  if (head.length >= 4 && head.readUInt32BE(0) === 0x7f454c46) return { executable: true, detected: "elf" };
  if (head.length >= 4 && [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(head.readUInt32BE(0)))
    return { executable: true, detected: "mach-o" };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { executable: false, detected: "png" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { executable: false, detected: "jpeg" };
  if (head.subarray(0, 4).toString("latin1") === "%PDF") return { executable: false, detected: "pdf" };
  if (head.subarray(0, 6).toString("latin1").startsWith("GIF8")) return { executable: false, detected: "gif" };
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP")
    return { executable: false, detected: "webp" };
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return { executable: false, detected: "mp4" };
  if (head[0] === 0x50 && head[1] === 0x4b) return { executable: false, detected: "zip" };
  return { executable: false };
}

/** Declared types that must match their magic bytes. */
const STRICT: Record<string, string[]> = {
  png: ["png"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  gif: ["gif"],
  webp: ["webp"],
  pdf: ["pdf"],
  mp4: ["mp4"],
  m4v: ["mp4"],
  mov: ["mp4"],
  zip: ["zip"],
  docx: ["zip"],
  xlsx: ["zip"],
  pptx: ["zip"],
  "3mf": ["zip"],
};

export function validateContent(name: string, head: Buffer): string | null {
  const s = sniff(head);
  if (s.executable) return "Executable files are not allowed";
  const ext = extensionOf(name);
  const expected = STRICT[ext];
  if (expected && !expected.includes(s.detected ?? "")) return `File content does not match the .${ext} extension`;
  if (ext === "svg") {
    const text = head.toString("utf8").toLowerCase();
    if (/<script|on\w+\s*=|javascript:/.test(text)) return "SVG files containing scripts are not allowed";
  }
  return null;
}

function isProbablyText(buf: Buffer) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

export function extractMetadata(name: string, buf: Buffer, totalSize: number): Record<string, unknown> {
  const ext = extensionOf(name);
  const meta: Record<string, unknown> = {};
  const complete = buf.length >= totalSize;
  try {
    if (["step", "stp"].includes(ext)) {
      const text = buf.toString("latin1");
      const header = text.slice(0, 8000);
      const fileName = /FILE_NAME\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*\(([^)]*)\)\s*,\s*\(([^)]*)\)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/s.exec(header);
      const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/.exec(header);
      const desc = /FILE_DESCRIPTION\s*\(\s*\(\s*'([^']*)'/.exec(header);
      if (desc) meta.description = desc[1];
      if (fileName) {
        meta.timestamp = fileName[2];
        meta.author = fileName[3]?.replace(/'/g, "").trim() || undefined;
        meta.preprocessor = fileName[5] || undefined;
        meta.originatingSystem = fileName[6] || undefined;
      }
      if (schema) {
        meta.schema = schema[1];
        meta.applicationProtocol = /AP242|MANAGED_MODEL_BASED_3D/i.test(schema[1]!) ? "AP242" : /AUTOMOTIVE_DESIGN|AP214/i.test(schema[1]!) ? "AP214" : /CONFIG_CONTROL|AP203/i.test(schema[1]!) ? "AP203" : schema[1];
      }
      if (complete) {
        meta.entityCount = (text.match(/^#\d+\s*=/gm) ?? []).length;
        const solids = (text.match(/MANIFOLD_SOLID_BREP/g) ?? []).length;
        if (solids) meta.solidBodies = solids;
        const units = /SI_UNIT\s*\(\s*\.(\w+)\.\s*,\s*\.METRE\./.exec(text);
        meta.lengthUnit = units ? `${units[1]!.toLowerCase()}metre` : /SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\./.test(text) ? "metre" : undefined;
      }
    } else if (ext === "stl") {
      const asciiHead = buf.subarray(0, 5).toString("latin1").toLowerCase();
      if (asciiHead === "solid" && isProbablyText(buf.subarray(0, 512))) {
        meta.format = "ascii";
        if (complete) meta.triangles = (buf.toString("latin1").match(/facet normal/g) ?? []).length;
      } else if (buf.length >= 84) {
        meta.format = "binary";
        meta.triangles = buf.readUInt32LE(80);
      }
    } else if (["kicad_pcb", "kicad_sch", "kicad_pro"].includes(ext)) {
      const text = buf.toString("utf8", 0, Math.min(buf.length, 4000));
      const v = /\(version\s+(\d+)\)/.exec(text);
      const g = /\(generator\s+"?([\w-]+)"?/.exec(text);
      if (v) meta.formatVersion = v[1];
      if (g) meta.generator = g[1];
      if (complete && ext === "kicad_pcb") {
        const full = buf.toString("utf8");
        meta.footprints = (full.match(/\(footprint\s/g) ?? []).length;
        const layers = /\(layers([\s\S]*?)\n\s*\)/.exec(full);
        if (layers) meta.copperLayers = (layers[1]!.match(/\.Cu"?\s+signal/g) ?? []).length || undefined;
      }
      if (complete && ext === "kicad_sch") meta.symbols = (buf.toString("utf8").match(/\(symbol\s+\(lib_id/g) ?? []).length;
    } else if (ext === "png" && buf.length >= 24) {
      meta.width = buf.readUInt32BE(16);
      meta.height = buf.readUInt32BE(20);
    } else if ((ext === "jpg" || ext === "jpeg") && buf.length > 4) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1]!;
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          meta.height = buf.readUInt16BE(i + 5);
          meta.width = buf.readUInt16BE(i + 7);
          break;
        }
        i += 2 + len;
      }
    } else if (ext === "pdf") {
      const v = /%PDF-(\d\.\d)/.exec(buf.subarray(0, 16).toString("latin1"));
      if (v) meta.pdfVersion = v[1];
      if (complete) meta.pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length || undefined;
    } else if (["csv", "tsv"].includes(ext)) {
      const text = buf.toString("utf8");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
      const sep = ext === "tsv" ? "\t" : ",";
      meta.columns = lines[0]?.split(sep).map((s) => s.trim().replace(/^"|"$/g, "")) ?? [];
      if (complete) meta.rows = Math.max(0, lines.length - 1);
    }
    if (isProbablyText(buf) && complete && !("rows" in meta)) {
      const text = buf.toString("utf8");
      meta.lines = text.length ? text.split(/\r?\n/).length : 0;
    }
  } catch {
    // Metadata is best-effort; never block an upload on a parser.
  }
  for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
  return meta;
}
