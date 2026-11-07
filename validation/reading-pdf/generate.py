"""Generate ONLY fictional, deterministic PDF binaries; never read customer PDFs."""
import hashlib
import json
import sys
from pathlib import Path
from reportlab.pdfgen import canvas

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
meters = ['123456', '723456', '823456', '923456', '1023456', '1123456', '1223456', '1423456', '1523456', '2723456']
records = [dict(loc=f'020100{i+1:04d}', med=med, contract='654321') for i, med in enumerate(meters)]
manifest = []


def make(kind, case, rows=None, total=None, reverse=False, pages=1, missing_header=False,
         incomplete=False, conflict=False, ambiguous=False, blank_page=False, jitter=0, close_contract=False, stagger_header=0):
    rows = [dict(r) for r in (rows if rows is not None else records[:3])]
    expected = [dict(localizacion=r['loc'], medidor=r['med']) for r in rows]
    if incomplete:
        rows[-1]['med'] = None
    if conflict:
        rows[-1]['loc'] = rows[0]['loc']
    name = f'{kind}-{case}.pdf'
    c = canvas.Canvas(str(out / name), pagesize=(612, 842), pageCompression=1, invariant=1)
    c.setTitle('TAREA 014 - DOCUMENTO COMPLETAMENTE FICTICIO')
    c.setAuthor('CNFL Campo - pruebas sinteticas')
    chunks = [rows[i::pages] for i in range(pages)]
    # Preserve expected output order: page order, then row order.
    if pages > 1:
        expected = [dict(localizacion=r['loc'], medidor=r['med']) for chunk in chunks for r in chunk]
    for page, chunk in enumerate(chunks):
        c.setFont('Helvetica', 10)
        c.drawString(40, 812, 'DOCUMENTO FICTICIO - SIN CLIENTES NI DATOS REALES')
        title = {'demanda':'LECTURA DE DEMANDA', 'residencial':'MEDIDORES SIN REGISTRO DE LECTURA',
                 'inspecciones':'HOJA DE INSPECCIÓN - LMR0085'}[kind]
        c.drawString(40, 785, title)
        if blank_page and page == 1:
            c.showPage()
            continue
        if kind == 'inspecciones':
            for i, r in enumerate(chunk):
                y = 730 - i * 55
                c.drawString(40, y, 'Localización:')
                c.drawString(115, y, r['loc'])
                c.drawString(260, y, 'Medidor:')
                if r['med'] is not None:
                    c.drawString(315, y + jitter, r['med'])
                if ambiguous:
                    c.drawString(365, y, '823459')
                c.drawString(430, y, 'Tarifa:')
                c.drawString(470, y, '1')
                c.drawString(40, y-18, 'Contrato:')
                c.drawString(115, y-18, r['contract'])
                c.drawString(260, y-18, 'Lec.Ant:')
                c.drawString(315, y-18, '5432')
        else:
            columns = [('Secuencia' if kind == 'demanda' else 'Localización', 'loc'), ('Contrato','contract'), ('Medidor','med')]
            if reverse or close_contract:
                columns[1], columns[2] = columns[2], columns[1]
            xs = [40, 180, 235] if close_contract else [40, 180, 320]
            if not (missing_header and page == 1):
                for i, (label, _) in enumerate(columns):
                    c.drawString(xs[i], 735 + (stagger_header if label == 'Contrato' else 0), label)
                c.drawString(460, 735, 'Tarifa')
            for i, r in enumerate(chunk):
                y = 710-i*24
                for j, (_, key) in enumerate(columns):
                    if r[key] is not None:
                        c.drawString(xs[j], y, r[key])
                    if key == 'med' and ambiguous:
                        c.drawString(xs[j]+55, y, '823459')
                c.drawString(460, y, '1')
        if total is not None and page == pages-1:
            c.drawString(40, 60, ('Total Inspecciones: ' if kind == 'inspecciones' else 'Total Medidores: ') + str(total))
        c.drawString(40, 30, f'Página {page+1} de {pages}')
        c.showPage()
    c.save()
    blocked = incomplete or conflict or ambiguous or missing_header or blank_page or (total is not None and total != len(expected))
    manifest.append(dict(file=name, kind=kind, case=case, sha256=hashlib.sha256((out/name).read_bytes()).hexdigest(),
                         pages=pages, declaredTotal=total, blocked=blocked, expectedRows=[] if blocked else expected))


for kind in ['demanda', 'residencial', 'inspecciones']:
    make(kind, 'valido-con-total', total=3)
    make(kind, 'valido-sin-total')
    make(kind, 'todos-los-prefijos', rows=records, total=10)
    make(kind, 'multipagina', rows=records[:6], total=6, pages=2)
    make(kind, 'multipagina-sin-total', rows=records[:6], pages=2)
    make(kind, 'incompleto-sin-total', incomplete=True)
    make(kind, 'incompleto-total-coincide', incomplete=True, total=2)
    make(kind, 'total-cero', total=0)
    make(kind, 'total-menor', total=2)
    make(kind, 'total-mayor', total=4)
    make(kind, 'conflicto-medidor', conflict=True)
    make(kind, 'medidor-ambiguo', ambiguous=True)
    make(kind, 'pagina-no-verificable', pages=2, blank_page=True)
    if kind != 'inspecciones':
        make(kind, 'columnas-reordenadas', reverse=True)
        make(kind, 'pagina-sin-encabezado', pages=2, missing_header=True)
        make(kind, 'contrato-cercano', rows=records[:1], incomplete=True, close_contract=True)
        make(kind, 'contrato-encabezado-elevado', rows=records[:1], incomplete=True, close_contract=True, stagger_header=6)
        make(kind, 'contrato-encabezado-bajo', rows=records[:1], incomplete=True, close_contract=True, stagger_header=-6)
    else:
        make(kind, 'valores-desalineados', jitter=6)
        make(kind, 'valores-desalineados-abajo', jitter=-6)

(out/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(f'{len(manifest)} PDFs ficticios y manifest.json generados en {out}')
