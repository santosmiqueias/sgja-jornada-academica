"""Troca o "6ª" da logo da Jornada por "VI", no mesmo estilo (Montserrat Black, degradê azul, fita amarela/vermelha)."""
# Uso: python3 scripts/logo_vi.py entrada.jpg saida.jpg fonte-montserrat-900.(ttf|woff) [escala deslocX deslocY]
# Fonte: Montserrat Black (npm i @fontsource/montserrat, arquivo files/montserrat-latin-900-normal.woff).
# Logo grande: sem os 3 últimos parâmetros. Certificado: 0.40 609 14.
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

src, out, fonte = sys.argv[1], sys.argv[2], sys.argv[3]
# Opcional: escala e deslocamento da logo dentro da imagem (para usar no certificado).
esc_arg = float(sys.argv[4]) if len(sys.argv) > 4 else None
DX = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
DY = float(sys.argv[6]) if len(sys.argv) > 6 else 0.0
im = Image.open(src).convert("RGB")
W, H = im.size
k = esc_arg if esc_arg else W / 1600.0   # escala (as coordenadas foram medidas na versão de 1600 px)
P = lambda v: int(round(v * k))
PX = lambda v: int(round(DX + v * k))
PY = lambda v: int(round(DY + v * k))
a = np.asarray(im).astype(int)
BG = (254, 254, 254)

# 1) Máscara do "6ª" por peças conectadas: o 6 (azul + amarelo + vermelho) é uma peça só,
#    separada do J e do A por fundo branco. Apaga só as peças do 6 e do "ª".
import cv2
regiao = np.zeros((H, W), bool); regiao[PY(80):PY(670), PX(40):PX(620)] = True
tinta = (a.min(axis=2) < 205) & regiao
n, rot, est, cen = cv2.connectedComponentsWithStats(tinta.astype("uint8"), connectivity=8)
mask = np.zeros((H, W), bool)
for i in range(1, n):
    x, y, w, h, area = est[i]; cx, cy = cen[i]
    eh_6 = PX(40) <= cx < PX(470) and area > 50 * k * k
    eh_ord = x >= PX(495) and x + w <= PX(610) and y >= PY(110) and y + h <= PY(245)
    if eh_6 or eh_ord: mask |= (rot == i)
# inclui a borda suavizada (antisserrilhado) em volta das peças apagadas
m = Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(9 if k > 0.7 else 5))
limpa = im.copy()
limpa.paste(Image.new("RGB", im.size, BG), (0, 0), m)
# Restos muito claros do "ª" (compressão JPEG) viram fundo puro.
la = np.asarray(limpa).copy()
zona = (slice(PY(105), PY(250)), slice(PX(490), PX(612)))
claro = la[zona].min(axis=2) > 200
la[zona][claro] = BG
bloco = la[zona]; bloco[claro] = BG; la[zona] = bloco
limpa = Image.fromarray(la)

# 2) Desenho em escala 3x para bordas suaves, numa tela do tamanho da logo.
S = 3
cw, ch = W * S, H * S
ox, oy = 0, 0
L = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
u = lambda v: int(v * S * k)
ux = lambda v: int(S * (DX + v * k))
uy = lambda v: int(S * (DY + v * k))

AZUL_CLARO = (7, 71, 161); MARINHO = (5, 41, 103); PROFUNDO = (0, 22, 61)
AMARELO = (255, 194, 18); AMARELO_CLARO = (255, 226, 64); VERMELHO = (250, 25, 55)

def degrade(c1, c2, x0, y0, x1, y1):
    """Degradê linear entre (x0,y0) e (x1,y1), em coordenadas da tela 3x."""
    g = np.zeros((ch, cw, 3))
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((np.arange(cw)[None, :] - x0) * dx + (np.arange(ch)[:, None] - y0) * dy) / float(dx * dx + dy * dy), 0, 1)
    for i in range(3): g[..., i] = c1[i] + (c2[i] - c1[i]) * t
    return Image.fromarray(g.astype("uint8"))

def arco(x0, x1, y_meio, espessura, curva):
    """Faixa em arco (sorriso) que afina nas pontas: diferença de duas elipses de mesma largura."""
    mk = Image.new("L", (cw, ch), 0); d = ImageDraw.Draw(mk)
    d.ellipse((x0, y_meio - curva, x1, y_meio + espessura), fill=255)
    d.ellipse((x0, y_meio - curva - espessura, x1, y_meio), fill=0)
    return mk

# 2a) Letras "VI" em Montserrat Black, do tamanho que cabe antes do J de JORNADA.
X0, X1 = ux(78), ux(448)                    # faixa horizontal disponível
TOPO, BASE = uy(205), uy(500)               # do alto de JORNADA até a base de ACADÊMICA
f = ImageFont.truetype(fonte, 100)
bb = f.getbbox("VI")
esc = min((X1 - X0) / (bb[2] - bb[0]), (BASE - TOPO) / (bb[3] - bb[1]))
f = ImageFont.truetype(fonte, int(100 * esc))
bb = f.getbbox("VI")
tw, th = bb[2] - bb[0], bb[3] - bb[1]
tx = X0 + ((X1 - X0) - tw) // 2 - bb[0]
ty = BASE - th - bb[1] - u(40)
txt = Image.new("L", (cw, ch), 0); ImageDraw.Draw(txt).text((tx, ty), "VI", font=f, fill=255)
lx0, ly0, lx1, ly1 = tx + bb[0], ty + bb[1], tx + bb[2], ty + bb[3]

# 2b) Fita vermelha e amarela em arco por baixo das letras (a volta inferior do 6).
largura = (lx1 - lx0)
verm = arco(lx0 - u(30), lx1 - u(4), ly1 + u(10), u(42), u(150))
amar = arco(lx0 - u(40), lx1 - u(5), ly1 - u(6), u(46), u(150))
L.paste(degrade(VERMELHO, (205, 12, 42), lx0, 0, lx1, 0), (0, 0), verm)
L.paste(degrade(AMARELO, AMARELO_CLARO, lx0, 0, lx1, 0), (0, 0), amar)

# 2c) Profundidade 3D em marinho escuro (como a sombra do 6) e degradê azul nas letras.
prof = u(10)
extr = Image.new("L", (cw, ch), 0)
for i in range(1, prof + 1, S):
    extr = ImageChops.lighter(extr, ImageChops.offset(txt, i, i))
L.paste(Image.new("RGB", (cw, ch), PROFUNDO), (0, 0), extr)
L.paste(degrade(AZUL_CLARO, MARINHO, lx0, ly0, lx1, ly1), (0, 0), txt)
# reflexo suave no alto das letras
ramp = np.clip(1 - (np.arange(ch) - ly0) / float(max(1, (ly1 - ly0) * 0.45)), 0, 1)[:, None].repeat(cw, 1)
brilho = ImageChops.multiply(txt, Image.fromarray((ramp * 55).astype("uint8")))
L.paste(Image.new("RGB", (cw, ch), (255, 255, 255)), (0, 0), brilho)

L = L.resize((W, H), Image.LANCZOS)
final = limpa.copy()
final.paste(L, (ox, oy), L)
final.save(out, quality=94)
print("ok", final.size)
