/** File classification & upload policy. Shared by server and (type-only) client. */
export const FILE_KINDS = [
  "cad",
  "drawing",
  "electronics",
  "code",
  "document",
  "data",
  "image",
  "video",
  "simulation",
  "archive",
  "other",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const EXT: Record<string, { kind: FileKind; mime: string; text?: boolean }> = {};
function reg(kind: FileKind, mime: string, exts: string[], text = false) {
  for (const e of exts) EXT[e] = { kind, mime, text };
}
reg("cad", "model/step", ["step", "stp"], true);
reg("cad", "model/iges", ["iges", "igs"], true);
reg("cad", "model/stl", ["stl"]);
reg("cad", "model/3mf", ["3mf"]);
reg("cad", "model/obj", ["obj"], true);
reg("cad", "application/octet-stream", ["sldprt", "sldasm", "f3d", "f3z", "ipt", "iam", "x_t", "x_b", "prt", "asm", "catpart", "catproduct", "par", "psm"]);
reg("cad", "application/x-freecad", ["fcstd"]);
reg("drawing", "image/vnd.dxf", ["dxf"], true);
reg("drawing", "image/vnd.dwg", ["dwg"]);
reg("drawing", "application/octet-stream", ["slddrw", "idw"]);
reg("electronics", "text/plain", ["kicad_sch", "kicad_pcb", "kicad_pro", "kicad_sym", "kicad_mod", "net", "sch", "brd", "gbr", "gtl", "gbl", "gto", "gbo", "gts", "gbs", "drl", "xln"], true);
reg("code", "text/plain", [
  "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "ino", "py", "rs", "ts", "tsx", "js", "jsx", "java", "kt", "go", "m",
  "sh", "bash", "cmake", "launch", "toml", "ini", "cfg", "conf", "lua", "swift", "cs", "vhd", "v", "sv", "proto", "msg", "srv",
], true);
reg("code", "application/json", ["json"], true);
reg("code", "application/yaml", ["yaml", "yml"], true);
reg("code", "application/xml", ["xml"], true);
reg("document", "text/markdown", ["md", "markdown"], true);
reg("document", "text/plain", ["txt", "rst", "tex"], true);
reg("document", "application/pdf", ["pdf"]);
reg("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"]);
reg("document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", ["pptx"]);
reg("data", "text/csv", ["csv"], true);
reg("data", "text/tab-separated-values", ["tsv"], true);
reg("data", "text/plain", ["log", "dat"], true);
reg("data", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ["xlsx"]);
reg("data", "application/octet-stream", ["bag", "mcap", "db3", "h5", "hdf5", "mat", "npy", "parquet", "ulg", "bin"]);
reg("image", "image/png", ["png"]);
reg("image", "image/jpeg", ["jpg", "jpeg"]);
reg("image", "image/gif", ["gif"]);
reg("image", "image/webp", ["webp"]);
reg("image", "image/svg+xml", ["svg"], true);
reg("image", "image/bmp", ["bmp"]);
reg("image", "image/tiff", ["tif", "tiff"]);
reg("image", "image/heic", ["heic"]);
reg("video", "video/mp4", ["mp4", "m4v"]);
reg("video", "video/quicktime", ["mov"]);
reg("video", "video/webm", ["webm"]);
reg("video", "video/x-matroska", ["mkv"]);
reg("simulation", "application/xml", ["urdf", "sdf", "world", "xacro"], true);
reg("simulation", "text/plain", ["sim", "inp", "cdb"], true);
reg("simulation", "application/octet-stream", ["slx", "mdl", "simscape", "wbpj", "ansys"]);
reg("archive", "application/zip", ["zip"]);
reg("archive", "application/gzip", ["gz", "tgz"]);
reg("archive", "application/x-tar", ["tar"]);
reg("archive", "application/x-7z-compressed", ["7z"]);

/** Executables and scripts that browsers/OSes may run directly are never accepted. */
export const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "msi", "com", "scr", "bat", "cmd", "ps1", "vbs", "vbe", "jse", "wsf", "jar", "app", "dmg", "apk",
  "pkg", "deb", "rpm", "lnk", "hta", "cpl", "reg", "html", "htm", "xhtml", "php",
]);

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function classify(name: string): { kind: FileKind; mime: string; text: boolean } {
  const e = EXT[extensionOf(name)];
  return e ? { kind: e.kind, mime: e.mime, text: Boolean(e.text) } : { kind: "other", mime: "application/octet-stream", text: false };
}

export type PreviewKind = "image" | "video" | "pdf" | "text" | "markdown" | "csv" | "stl" | "none";

export function previewKind(name: string, mime: string): PreviewKind {
  const ext = extensionOf(name);
  if (ext === "stl") return "stl";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["csv", "tsv"].includes(ext)) return "csv";
  if (EXT[ext]?.text) return "text";
  return "none";
}

export function isTextual(name: string) {
  return Boolean(EXT[extensionOf(name)]?.text);
}
