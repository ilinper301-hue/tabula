# Tabula · comprobación en navegador: ninguna ruta tiene desplazamiento horizontal a 360 ni a 390 px.
# No la ejecuta `node --test` (necesita Chrome y Playwright para Python). Uso, desde la raíz del repo:
#   python3 -m http.server 8790 &
#   python3 tests/desbordamiento.py [puerto=8790] [carpeta_capturas]
# Entra «sin cuenta», carga los datos de ejemplo y mide document.documentElement.scrollWidth por ruta.
# Sale con código 1 si alguna ruta desborda. Con carpeta, guarda una captura a 390 × 844 por ruta.
import asyncio, sys
from playwright.async_api import async_playwright

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
ROUTES = ['hoy', 'tareas', 'calendario', 'aula', 'grupos', 'tutoria', 'cuaderno', 'planificacion',
          'planificacion?vista=programacion', 'documentos', 'documentos?tab=imprimir', 'programas',
          'encuestas', 'codigos', 'ajustes', 'mas']
WIDTHS = (360, 390)


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
        await b.close()
        if bad:
            print('DESBORDAN:', *bad, sep='\n  ')
            sys.exit(1)
        print('Ninguna ruta desborda.')

asyncio.run(main())
