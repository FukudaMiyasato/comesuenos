#!/usr/bin/env python3
"""Copia whisper-server y llama-server de Homebrew, con sus bibliotecas, a desktop/engines
y reescribe las rutas para que funcionen dentro de la app, sin Homebrew instalado.

Requiere: brew install whisper.cpp llama.cpp
"""
import os, shutil, subprocess, sys
from pathlib import Path

BREW = Path(subprocess.check_output(["brew", "--prefix"], text=True).strip())
OUT = Path(__file__).resolve().parent.parent / "engines"
BIN, LIB = OUT / "bin", OUT / "lib"
SEARCH = [BREW / "opt" / f / "lib" for f in ("whisper.cpp", "whisper-cpp", "llama.cpp", "ggml", "openssl@4", "openssl@3")]

def run(*a): subprocess.run(a, check=True, capture_output=True)

def deps(path):
    out = subprocess.check_output(["otool", "-L", str(path)], text=True).splitlines()[1:]
    return [l.strip().split(" (")[0] for l in out]

def resolve(dep):
    """Ruta real de una dependencia que no es del sistema, o None."""
    if dep.startswith(("/usr/lib/", "/System/")): return None
    if dep.startswith("/"): return Path(dep).resolve()
    name = dep.split("/")[-1]
    for d in SEARCH:
        if (d / name).exists(): return (d / name).resolve()
    sys.exit(f"No encuentro {dep}")

shutil.rmtree(OUT, ignore_errors=True)
BIN.mkdir(parents=True); LIB.mkdir()

todo = []
for exe in ("whisper-server", "llama-server"):
    src = Path(shutil.which(exe) or sys.exit(f"Falta {exe}")).resolve()
    shutil.copy(src, BIN / exe); todo.append(BIN / exe)
# Motores de cálculo de ggml (Metal y CPU): se cargan en tiempo de ejecución desde la carpeta del ejecutable.
for so in (BREW / "opt" / "ggml" / "libexec").glob("libggml-*.so"):
    shutil.copy(so, BIN / so.name); todo.append(BIN / so.name)

names = {}  # ruta original → nombre dentro de lib/
done = []
while todo:
    f = todo.pop()
    done.append(f)
    for dep in deps(f):
        real = resolve(dep)
        if not real or real.name == f.name: continue
        name = dep.split("/")[-1]
        if not (LIB / name).exists():
            shutil.copy(real, LIB / name); todo.append(LIB / name)
        names.setdefault(f, []).append((dep, name))

for f in done:
    os.chmod(f, 0o755)
    for dep, name in names.get(f, []):
        run("install_name_tool", "-change", dep, f"@rpath/{name}", str(f))
    if f.parent == LIB: run("install_name_tool", "-id", f"@rpath/{f.name}", str(f))
    rpath = "@loader_path" if f.parent == LIB else "@loader_path/../lib"
    subprocess.run(["install_name_tool", "-add_rpath", rpath, str(f)], capture_output=True)
    run("codesign", "--force", "--sign", "-", str(f))  # firma local: obligatoria en Apple Silicon

left = [f"{f.name}: {d}" for f in done for d in deps(f) if str(BREW) in d]
if left: sys.exit("Quedan rutas de Homebrew:\n" + "\n".join(left))
size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()) / 1e6
print(f"Listo: {len(done)} archivos, {size:.0f} MB en {OUT}")
