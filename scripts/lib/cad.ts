/** Procedural engineering files for the demo: binary STL meshes, STEP AP214 text, a vector PDF. */
type V = [number, number, number];

function box(o: V, s: V): V[][] {
  const [x, y, z] = o;
  const [a, b, c] = s;
  const p = (i: number, j: number, k: number): V => [x + i * a, y + j * b, z + k * c];
  const q = (v1: V, v2: V, v3: V, v4: V) => [[v1, v2, v3], [v1, v3, v4]];
  return [
    ...q(p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)),
    ...q(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)),
    ...q(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)),
    ...q(p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)),
    ...q(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)),
    ...q(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)),
  ] as V[][];
}

/** Cylinder along the Y axis. */
function cylinder(c: V, r: number, len: number, n = 40): V[][] {
  const tris: V[][] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p = (a: number, y: number): V => [c[0] + Math.cos(a) * r, c[1] + y, c[2] + Math.sin(a) * r];
    const y0 = -len / 2;
    const y1 = len / 2;
    tris.push([p(a0, y0), p(a1, y0), p(a1, y1)], [p(a0, y0), p(a1, y1), p(a0, y1)]);
    tris.push([[c[0], c[1] + y0, c[2]], p(a1, y0), p(a0, y0)], [[c[0], c[1] + y1, c[2]], p(a0, y1), p(a1, y1)]);
  }
  return tris;
}

export function stl(tris: V[][], name: string) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(`Forgebase demo: ${name}`.padEnd(80, " "), 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50;
    const [a, b, c] = t as [V, V, V];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const l = Math.hypot(...n) || 1;
    [n[0]! / l, n[1]! / l, n[2]! / l, ...a, ...b, ...c].forEach((f, k) => buf.writeFloatLE(f, o + k * 4));
  });
  return buf;
}

/** Drive module: deck plate, battery box, four wheels. Units: mm. */
export function driveModuleStl(wheelDia: number) {
  const r = wheelDia / 2;
  const tris = [
    ...box([-260, -180, r - 10], [520, 360, 12]),
    ...box([-150, -90, r + 2], [300, 180, 90]),
    ...box([-240, -170, r + 2], [60, 340, 30]),
    ...[
      [-190, -205],
      [190, -205],
      [-190, 205],
      [190, 205],
    ].flatMap(([x, y]) => cylinder([x!, y!, r], r, 46)),
  ];
  return stl(tris, `drive module, ${wheelDia} mm wheels`);
}

export function bracketStl(thickness: number) {
  return stl([...box([0, 0, 0], [80, 60, thickness]), ...box([0, 0, thickness], [thickness, 60, 70]), ...box([thickness, 26, thickness], [50, thickness, 40])], `front bracket t=${thickness}`);
}

/** Minimal-but-real STEP AP214 export: header + a solid's geometric skeleton. */
export function stepFile(opts: { name: string; author: string; system: string; date: string; desc: string; points: V[] }) {
  const lines: string[] = [];
  let id = 1;
  const ent = (s: string) => {
    lines.push(`#${id}=${s};`);
    return id++;
  };
  const app = ent(`APPLICATION_CONTEXT('automotive design')`);
  ent(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2010,#${app})`);
  const prod = ent(`PRODUCT('${opts.name}','${opts.name}','',(#${app}))`);
  ent(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const len = ent(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  void len;
  const pts = opts.points.map((p) => ent(`CARTESIAN_POINT('',(${p.map((n) => n.toFixed(3)).join(",")}))`));
  const verts = pts.map((p) => ent(`VERTEX_POINT('',#${p})`));
  const shell = ent(`CLOSED_SHELL('',(${verts.slice(0, 8).map((v) => `#${v}`).join(",")}))`);
  ent(`MANIFOLD_SOLID_BREP('${opts.name}',#${shell})`);
  return Buffer.from(
    [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION(('${opts.desc}'),'2;1');`,
      `FILE_NAME('${opts.name}.step','${opts.date}',('${opts.author}'),('Forge Robotics'),'ST-DEVELOPER v18','${opts.system}','');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
      "ENDSEC;",
      "DATA;",
      ...lines,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ].join("\n"),
  );
}

export function boxPoints(w: number, d: number, h: number): V[] {
  const out: V[] = [];
  for (const x of [0, w]) for (const y of [0, d]) for (const z of [0, h]) out.push([x, y, z]);
  for (let i = 0; i < 24; i++) out.push([Math.round(Math.cos(i) * w * 50) / 100, Math.round(Math.sin(i) * d * 50) / 100, (h * i) / 24]);
  return out;
}

/** Single-page vector PDF power distribution diagram. */
export function powerPdf() {
  const blocks: [number, number, number, number, string, string][] = [
    [50, 620, 150, 60, "BATTERY", "24V LiFePO4 20Ah"],
    [250, 620, 120, 60, "BMS", "8S 40A"],
    [420, 620, 140, 60, "MAIN FUSE", "40A + E-STOP"],
    [80, 440, 120, 60, "MOTOR DRV FL", "VNH7070"],
    [230, 440, 120, 60, "MOTOR DRV FR", "VNH7070"],
    [380, 440, 120, 60, "MOTOR DRV RL", "VNH7070"],
    [80, 330, 120, 60, "MOTOR DRV RR", "VNH7070"],
    [260, 300, 160, 80, "STM32H743", "drive controller"],
    [460, 300, 110, 60, "5V BUCK", "LMR33630"],
    [460, 190, 110, 60, "JETSON ORIN", "autonomy"],
  ];
  const ops: string[] = ["0.15 0.15 0.15 RG 1 w"];
  for (const [x, y, w, h, t, s] of blocks) {
    ops.push(`${x} ${y} ${w} ${h} re S`);
    ops.push(`BT /F1 10 Tf ${x + 8} ${y + h - 18} Td (${t}) Tj ET`);
    ops.push(`BT /F1 8 Tf ${x + 8} ${y + 10} Td (${s}) Tj ET`);
  }
  for (const [x1, y1, x2, y2] of [
    [200, 650, 250, 650],
    [370, 650, 420, 650],
    [490, 620, 490, 520],
    [140, 520, 490, 520],
    [140, 520, 140, 500],
    [290, 520, 290, 500],
    [440, 520, 440, 500],
    [40, 520, 40, 360],
    [40, 360, 80, 360],
    [40, 520, 140, 520],
    [515, 360, 515, 300],
    [515, 250, 515, 300],
    [420, 340, 460, 330],
  ])
    ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  ops.push("BT /F1 16 Tf 50 740 Td (Cargo Rover - Power Distribution, Rev B) Tj ET");
  ops.push("BT /F1 8 Tf 50 722 Td (Forge Robotics - drawn by Nikhilesh - checked by Viraj - sheet 1 of 1) Tj ET");
  ops.push("50 60 512 40 re S BT /F1 8 Tf 58 86 Td (DWG CR-EL-001  REV B  2026-09-14) Tj ET BT /F1 8 Tf 58 70 Td (Notes: all motor feeds 14 AWG; logic ground star point at BMS negative; see CHANGE-003) Tj ET");
  const content = ops.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
