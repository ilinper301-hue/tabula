# Tabula · comprobación en navegador: ninguna ruta tiene desplazamiento horizontal a 360 ni a 390 px.
# No la ejecuta `node --test` (necesita Chrome y Playwright para Python). Uso, desde la raíz del repo:
#   python3 -m http.server 8790 &
#   python3 tests/desbordamiento.py [puerto=8790] [carpeta_capturas]
# Entra «sin cuenta», carga los datos de ejemplo y mide document.documentElement.scrollWidth por ruta.
# Sale con código 1 si alguna ruta desborda. Con carpeta, guarda una captura a 390 × 844 por ruta.
# Además, en Documentos (con varios documentos de prueba, sin datos reales) mide también con las hojas y menús
# abiertos: Añadir, Filtros, filtros activos, selección, ficha (con «Detalles» y «⋯»), menú de una fila de la cola
# e «Imprimir lo de hoy». En Cuaderno y Planificación, con la hoja de contexto y el menú «⋯» abiertos.
import asyncio, sys
from playwright.async_api import async_playwright

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
ROUTES = ['hoy', 'tareas', 'calendario', 'aula', 'grupos', 'tutoria', 'cuaderno', 'planificacion',
          'planificacion?vista=programacion', 'documentos', 'documentos?tab=imprimir', 'programas',
          'encuestas', 'codigos', 'ajustes', 'ajustes/perfil', 'ajustes/apariencia', 'ajustes/evaluacion', 'ajustes/curso',
          'ajustes/seguridad', 'ajustes/cuenta', 'ajustes/ayuda', 'mas']
WIDTHS = (360, 390)

# Documentos de prueba (ficticios): fichas HTML, un enlace y uno con título largo; dos para hoy en la cola
SEED = r'''async () => {
  const { store } = await import('/js/store.js');
  const { saveFile } = await import('/js/files.js');
  const hoy = new Date().toLocaleDateString('sv-SE');
  const ficha = async (titulo, extra) => {
    const sv = await saveFile(new File([`<h1>${titulo}</h1>`], 'f.html', { type: 'text/html' }));
    return store.add('documentos', { titulo, fileId: sv.fileId, nombreArchivo: sv.nombre, tipo: 'text/html', tamano: sv.tamano, paginas: 1, carpeta: '', etiquetas: [], notas: '', favorito: false, ...extra });
  };
  const a = await ficha('Prueba: una ficha con un título muy largo para ver si se corta bien en el móvil', { carpeta: 'Una carpeta con nombre largo', etiquetas: ['repaso'] });
  const b = await ficha('Prueba: sumas', { carpeta: 'Matemáticas' });
  store.add('documentos', { titulo: 'Prueba: enlace', enlace: 'https://example.com', nombreArchivo: '', tipo: '', tamano: 0, carpeta: '', etiquetas: [], notas: '', favorito: false });
  [a, b].forEach((d) => store.add('impresiones', { documentoId: d.id, fecha: hoy, copias: 20, dobleCara: false, color: false, groupId: '', nota: 'una nota algo larga para la fotocopiadora', estado: 'pendiente' }));
}'''

# (ruta, nombre, pasos) — cada paso: ('click', selector) | ('select', selector, valor) | ('wait', ms)
DOC_STATES = [
    ('documentos', 'hoja Añadir', [('click', '.ph-primary')]),
    ('documentos', 'hoja Filtros', [('click', '.dc-filter-btn')]),
    ('documentos', 'filtros activos', [('click', '.dc-filter-btn'), ('select', '#dc-flt-carpeta', 'Una carpeta con nombre largo'),
                                       ('click', '.dc-filters .dc-chip-btn:nth-child(2)'), ('click', '.dc-filters-foot .btn-primary')]),
    ('documentos', 'selección', [('click', '.ph-menu'), ('click', '.menu-item'), ('click', '.dc-card-open')]),
    ('documentos', 'ficha + Detalles + ⋯', [('click', '.dc-card-open'), ('click', '.dc-details > summary'), ('click', '.dc-more')]),
    ('documentos?tab=imprimir', 'menú de una fila', [('click', '.dc-row-more')]),
    ('documentos?tab=imprimir', 'Imprimir lo de hoy', [('click', '.dc-today')]),
    ('cuaderno', 'hoja de contexto', [('click', '.ctx-bar')]),
    ('cuaderno', 'menú ⋯', [('click', '.ph-menu')]),
    ('planificacion', 'hoja de contexto', [('click', '.ctx-bar')]),
]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        await c.route('**/fonts.g*/**', lambda r: r.abort())
        pg = await c.new_page()
        base = f'http://localhost:{PORT}/index.html'
        await pg.goto(base + '#/hoy'); await pg.wait_for_timeout(1500)
        await pg.get_by_text('Usar sin cuenta en este dispositivo').click(); await pg.wait_for_timeout(800)
        await pg.evaluate("async()=>{const m=await import('/js/views/ajustes/demo.js');await m.loadDemo()}")
        await pg.evaluate(SEED)
        bad = []
        for rt in ROUTES:
            out = []
            for w in WIDTHS:
                await pg.set_viewport_size({'width': w, 'height': 844})
                await pg.goto(base + '#/' + rt); await pg.wait_for_timeout(900)
                sw = await pg.evaluate('()=>document.documentElement.scrollWidth')
                out.append(f'{w}→{sw}')
                if sw > w: bad.append(f'{rt} a {w} px: {sw}')
            if SHOTS:
                await pg.screenshot(path=f"{SHOTS}/{rt.replace('?', '_').replace('=', '-')}.png")
            print(f'{rt:34} ' + '  '.join(out))
        for rt, name, steps in DOC_STATES:
            out = []
            for w in WIDTHS:
                await pg.set_viewport_size({'width': w, 'height': 844})
                await pg.goto(base + '#/mas'); await pg.goto(base + '#/' + rt); await pg.wait_for_timeout(900)
                for st in steps:
                    if st[0] == 'click': await pg.click(st[1])
                    elif st[0] == 'select': await pg.select_option(st[1], st[2])
                    await pg.wait_for_timeout(400)
                sw = await pg.evaluate('()=>document.documentElement.scrollWidth')
                # Dentro de una hoja abierta, su contenido tampoco puede desplazarse en horizontal
                inner = await pg.evaluate("()=>{const b=document.querySelector('.overlay .sheet-body');return b?b.scrollWidth-b.clientWidth:0}")
                out.append(f'{w}→{sw}' + (f' (hoja +{inner})' if inner else ''))
                if sw > w or inner > 0: bad.append(f'{rt} ({name}) a {w} px: {sw}, hoja +{inner}')
                await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            print(f'  {rt} · {name:24} ' + '  '.join(out))
        await b.close()
        if bad:
            print('DESBORDAN:', *bad, sep='\n  ')
            sys.exit(1)
        print('Ninguna ruta desborda.')

asyncio.run(main())
