"use client";

import { useEffect, useRef, useState } from "react";
import type { Transcript } from "./page";

export type Tone = "pos" | "neg" | "neu";
export type Category = { name: string; tone: Tone; items: Transcript[] };

type Node = { x: number; y: number; vx: number; vy: number; r: number; target: number };

const GAP = 8;
const time = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Círculos por categoría: cuantos más textos, más grande. Una pequeña simulación
 * los junta hacia el centro sin que se pisen. Al pulsar uno se centra, crece y
 * muestra sus textos.
 */
export default function Bubbles({ categories, pulsing }: { categories: Category[]; pulsing: string[] }) {
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
      const total = categories.reduce((s, c) => s + c.items.length, 0);
      const k = Math.min(Math.sqrt((W * H * 0.3) / (Math.PI * Math.max(total, 1))), Math.min(W, H) * 0.2);
      const big = Math.max(120, Math.min(W, H) * 0.47);

      const names = new Set(categories.map((c) => c.name));
      for (const name of map.keys()) if (!names.has(name)) map.delete(name);
      for (const c of categories) {
        let n = map.get(c.name);
        if (!n) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.min(W, H) * 0.3;
          n = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: 0, vy: 0, r: 0, target: 0 };
          map.set(c.name, n);
        }
        n.target = c.name === selected ? big : Math.max(30, k * Math.sqrt(c.items.length));
      }

      const list = [...map.entries()];
      for (const [name, n] of list) {
        n.r += (n.target - n.r) * 0.14;
        if (name === selected) {
          n.x += (cx - n.x) * 0.18;
          n.y += (cy - n.y) * 0.18;
          n.vx = n.vy = 0;
        } else {
          n.vx = (n.vx + (cx - n.x) * 0.003) * 0.86;
          n.vy = (n.vy + (cy - n.y) * 0.004) * 0.86;
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
            className={`bubble ${c.tone}${open ? " open" : ""}${pulsing.includes(c.name) ? " pulse" : ""}`}
          >
            {open ? (
              <div className="skin detail" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="title" onClick={() => setSelected(null)} aria-label={`Cerrar ${c.name}`}>
                  {c.name} <span>{c.items.length}</span>
                </button>
                <ul>
                  {c.items.map((t) => (
                    <li key={t.id} className={t.sentiment ?? "neutral"}>
                      <p>{t.text}</p>
                      <time>{time.format(t.at)}</time>
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
                aria-label={`${c.name}: ${c.items.length} textos`}
              >
                <span className="name">{c.name}</span>
                <span className="count">{c.items.length}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
