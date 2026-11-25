"use client";

import { useEffect, useRef, useState } from "react";
import { keyOf, TONE, type Bubble } from "./types";

type Node = { x: number; y: number; vx: number; vy: number; r: number; target: number; category: string };

const GAP = 8;
const time = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const WORD = { positivo: "positivo", neutral: "neutral", negativo: "negativo" } as const;

/**
 * Un círculo por categoría y sentimiento (una misma categoría puede tener uno azul
 * y otro rojo). Cuantas más veces se habló, más grande. Una pequeña simulación los
 * junta hacia el centro sin que se pisen. Al pulsar uno se centra, crece y muestra
 * cuándo fue creciendo. No hay textos: no se guardan.
 */
export default function Bubbles({ bubbles, pulsing }: { bubbles: Bubble[]; pulsing: string[] }) {
  const categories = bubbles.map((b) => ({ ...b, name: keyOf(b) }));
  const box = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const nodes = useRef(new Map<string, Node>());
  const [selected, setSelected] = useState<string | null>(null);

  // La simulación lee siempre los datos más recientes sin reiniciarse.
  const live = useRef({ categories, selected });
  live.current = { categories, selected };

  useEffect(() => {
    if (selected && !categories.some((c) => c.name === selected)) setSelected(null);
  }, [categories, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      const el = box.current;
      if (!el) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const cx = W / 2;
      const cy = H / 2;
      const { categories, selected } = live.current;
      const map = nodes.current;

      // Radio = k·√(nº de textos): el área es proporcional a la cantidad.
      const total = categories.reduce((s, c) => s + c.count, 0);
      const k = Math.min(Math.sqrt((W * H * 0.31) / (Math.PI * Math.max(total, 1))), Math.min(W, H) * 0.22);
      // La atracción al centro se reparte según la forma del área: en una ventana ancha el grupo se ensancha.
      const gx = 0.0035 * Math.sqrt(H / W);
      const gy = 0.0035 * Math.sqrt(W / H);
      const big = Math.max(120, Math.min(W, H) * 0.47);

      const names = new Set(categories.map((c) => c.name));
      for (const name of map.keys()) if (!names.has(name)) map.delete(name);
      for (const c of categories) {
        let n = map.get(c.name);
        if (!n) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.min(W, H) * 0.3;
          n = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: 0, vy: 0, r: 0, target: 0, category: c.category };
          map.set(c.name, n);
        }
        n.target = c.name === selected ? big : Math.max(30, k * Math.sqrt(c.count));
      }

      const list = [...map.entries()];
      // Los círculos de una misma categoría (uno azul, otro rojo) se buscan para quedar pegados.
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i][1];
          const b = list[j][1];
          if (a.category !== b.category) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = Math.max(0, d - (a.r + b.r + GAP)) * 0.03;
          a.vx += (dx / d) * pull; a.vy += (dy / d) * pull;
          b.vx -= (dx / d) * pull; b.vy -= (dy / d) * pull;
        }
      }
      for (const [name, n] of list) {
        n.r += (n.target - n.r) * 0.14;
        if (name === selected) {
          n.x += (cx - n.x) * 0.18;
          n.y += (cy - n.y) * 0.18;
          n.vx = n.vy = 0;
        } else {
          n.vx = (n.vx + (cx - n.x) * gx) * 0.86;
          n.vy = (n.vy + (cy - n.y) * gy) * 0.86;
          n.x += n.vx;
          n.y += n.vy;
        }
      }

      // Separa los que se pisan (el seleccionado no se mueve: empuja a los demás).
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const [an, a] = list[i];
            const [bn, b] = list[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d = Math.hypot(dx, dy);
            const min = a.r + b.r + GAP;
            if (d >= min) continue;
            if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
            const push = (min - d) / d;
            const wa = an === selected ? 0 : bn === selected ? 1 : 0.5;
            a.x -= dx * push * wa;
            a.y -= dy * push * wa;
            b.x += dx * push * (1 - wa);
            b.y += dy * push * (1 - wa);
          }
        }
      }

      for (const [name, n] of list) {
        if (name !== selected && !selected) {
          if (n.r * 2 < W) n.x = Math.min(W - n.r, Math.max(n.r, n.x));
          if (n.r * 2 < H) n.y = Math.min(H - n.r, Math.max(n.r, n.y));
        }
        const node = els.current.get(name);
        if (!node) continue;
        node.style.width = node.style.height = `${n.r * 2}px`;
        node.style.transform = `translate(${n.x - n.r}px, ${n.y - n.r}px)`;
        node.style.setProperty("--r", String(n.r));
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`bubbles${selected ? " has-selected" : ""}`} ref={box} onClick={() => setSelected(null)}>
      {categories.map((c) => {
        const open = c.name === selected;
        return (
          <div
            key={c.name}
            ref={(el) => {
              if (el) els.current.set(c.name, el);
              else els.current.delete(c.name);
            }}
            className={`bubble ${TONE[c.sentiment]}${open ? " open" : ""}${pulsing.includes(c.name) ? " pulse" : ""}`}
          >
            {open ? (
              <div className="skin detail" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="title" onClick={() => setSelected(null)} aria-label={`Cerrar ${c.category}`}>
                  {c.category}
                </button>
                <p className="summary">
                  {c.count} {c.count === 1 ? "vez" : "veces"} · {WORD[c.sentiment]}
                </p>
                <ul>
                  {c.times.map((t, i) => (
                    <li key={`${t}-${i}`}>
                      <time>{time.format(t)}</time>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <button
                type="button"
                className="skin"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(c.name);
                }}
                aria-label={`${c.category}, ${WORD[c.sentiment]}: ${c.count} ${c.count === 1 ? "vez" : "veces"}`}
              >
                <span className="name">{c.category}</span>
                <span className="count">{c.count}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
