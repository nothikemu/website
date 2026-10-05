"use client";

import { useEffect, useRef, useState } from "react";

/** Minimal STL viewer (binary + ASCII) using three.js, loaded only when needed. */
export function StlViewer({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        const buf = await (await fetch(url)).arrayBuffer();
        if (disposed || !ref.current) return;
        const geometry = new STLLoader().parse(buf);
        geometry.computeVertexNormals();
        geometry.center();
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        setInfo(`${(geometry.attributes.position!.count / 3).toLocaleString()} triangles · ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}`);
        const el = ref.current;
        const dark = document.documentElement.classList.contains("dark");
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 100000);
        const r = Math.max(size.x, size.y, size.z);
        camera.position.set(r * 1.4, r * 1.1, r * 1.6);
        scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x222222 : 0x888888, 1.6));
        const dir = new THREE.DirectionalLight(0xffffff, 1.4);
        dir.position.set(r, r * 2, r);
        scene.add(dir);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: dark ? 0xb8bcc4 : 0x8a8f98, metalness: 0.35, roughness: 0.5 }));
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        const grid = new THREE.GridHelper(r * 3, 24, dark ? 0x33363d : 0xcfcfc8, dark ? 0x25272c : 0xe2e2dd);
        grid.position.y = -size.z / 2;
        scene.add(grid);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        let raf = 0;
        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
        cleanup = () => {
          cancelAnimationFrame(raf);
          renderer.dispose();
          el.removeChild(renderer.domElement);
        };
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [url]);
  return (
    <div className="relative h-[420px] w-full">
      <div ref={ref} className="bg-grid h-full w-full" />
      {info ? <div className="absolute bottom-2 left-2 rounded-sm bg-surface/80 px-2 py-0.5 font-mono text-2xs text-fg-muted">{info} · drag to orbit</div> : null}
      {error ? <div className="absolute inset-0 flex items-center justify-center text-sm text-red">Could not render STL: {error}</div> : null}
    </div>
  );
}
