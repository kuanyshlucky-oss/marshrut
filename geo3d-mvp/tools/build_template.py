# -*- coding: utf-8 -*-
"""Собирает Excel-шаблон для оцифровки скважин камеральщиком.
Листы: Инструкция, Скважины (шапка — один раз на скважину), Слои (по строке на слой),
Экспорт (формулы собирают CSV для загрузки), Справочник грунтов. В примере ещё лист Эталон.
Запуск: python build_template.py <папка_вывода>"""
import sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.comments import Comment

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
FONT = 'Arial'
R0 = 5                 # первая строка ввода (строка 4 — пример, 3 — заголовки, 2 — подсказки, 1 — название)
BH_LAST = 304          # скважин до 300 на файл
LY_LAST = 1004         # слоёв до 1000 на файл
EX_ROWS = LY_LAST - R0 + 1   # строк на листе «Экспорт»

# ---------- справочник грунтов (копия по умолчанию из server.js; рабочий — в админке) ----------
SOIL_DICT = [('почв', 0), ('растительн', 0), ('чернозем', 0), ('насыпн', 0), ('техноген', 0), ('суглин', 1), ('супес', 1), ('лесс', 1), ('глин', 2),
             ('песок', 3), ('песч', 3), ('гравий', 3), ('гравел', 3), ('галеч', 3), ('щебен', 3), ('дресв', 3),
             ('песчаник', 4), ('скальн', 4), ('известняк', 4), ('гранит', 4), ('сланец', 4), ('алевролит', 4), ('аргиллит', 4), ('выветрел', 4)]
CLASSES = ['Почвенно-растительный слой', 'Суглинок', 'Глина', 'Песок с гравием', 'Скальный грунт']
TYPICAL = ['Почвенно-растительный слой', 'Насыпной грунт', 'Суглинок', 'Суглинок песчанистый', 'Супесь', 'Глина', 'Глина тугопластичная', 'Песок', 'Песок с гравием',
           'Гравийный грунт', 'Щебенистый грунт', 'Известняк', 'Известняк выветрелый', 'Песчаник', 'Скальный грунт']

# ---------- колонки листа «Скважины»: (ключ, заголовок, ширина, подсказка, обязательное) ----------
BH = [
    ('id', 'ID скважины *', 14, 'как в журнале', True),
    ('report_id', 'Номер отчёта / объекта', 17, 'ИГИ-2025/12', False),
    ('doc', 'Документ-источник *', 26, 'название отчёта, год', True),
    ('org', 'Организация', 16, 'кто бурил', False),
    ('method', 'Способ бурения', 14, 'шнековое, колонковое', False),
    ('date', 'Дата бурения', 13, 'ГГГГ-ММ-ДД', False),
    ('depth', 'Глубина, м *', 10, 'число', True),
    ('lng', 'Долгота (lng) *', 13, 'градусы WGS84, 73.0860', True),
    ('lat', 'Широта (lat) *', 13, 'градусы WGS84, 49.8065', True),
    ('x_src', 'X исходная', 12, 'как в журнале, не выгружается', False),
    ('y_src', 'Y исходная', 12, 'не выгружается', False),
    ('crs_src', 'Система координат исходная', 18, 'WGS84, МСК, СК-42', False),
    ('acc', 'Класс точности *', 11, 'A / B / C / D', True),
    ('z', 'Отметка устья, м', 12, 'абсолютная, 541.3', False),
    ('z_src', 'Источник отметки', 16, 'журнал, тахеометр, топоплан', False),
    ('gw_first', 'Вода: появилась, м', 12, 'глубина от поверхности', False),
    ('gw_stable', 'Вода: установилась, м', 12, 'глубина от поверхности', False),
    ('gw_date', 'Дата замера воды', 13, 'ГГГГ-ММ-ДД', False),
    ('bearing_kpa', 'Несущая способность, кПа', 14, 'если дана одним числом', False),
    ('aggressive', 'Агрессивность', 16, 'слабая, средняя…', False),
    ('note', 'Примечание камеральщика', 30, 'сомнения, что неразборчиво (не выгружается)', False),
    ('check', 'Проверка', 46, 'заполняется само', False),
]
COL = {k: chr(ord('A') + i) for i, (k, *_r) in enumerate(BH)}   # ключ → буква колонки на листе «Скважины»
# колонки листа «Экспорт» (имена — ровно как ждёт сервер) и откуда берутся
EXPORT = [('id', None), ('report_id', 'report_id'), ('lng', 'lng'), ('lat', 'lat'), ('crs_src', 'crs_src'), ('acc', 'acc'), ('z', 'z'), ('z_src', 'z_src'),
          ('date', 'date'), ('depth', 'depth'), ('method', 'method'), ('org', 'org'), ('doc', 'doc'), ('gw_first', 'gw_first'), ('gw_stable', 'gw_stable'),
          ('gw_date', 'gw_date'), ('bearing_kpa', 'bearing_kpa'), ('aggressive', 'aggressive'),
          ('layer_from', 'LY:B'), ('layer_to', 'LY:C'), ('soil', 'LY:D'), ('ige', 'LY:E')]
EXL = {k: chr(ord('A') + i) for i, (k, _s) in enumerate(EXPORT)}

# ---------- стили ----------
def f(bold=False, size=10, color='000000', italic=False): return Font(name=FONT, bold=bold, size=size, color=color, italic=italic)
FILL_HEAD = PatternFill('solid', fgColor='1F3864'); FILL_REQ = PatternFill('solid', fgColor='C55A11'); FILL_IN = PatternFill('solid', fgColor='FFF9E5')
FILL_FORM = PatternFill('solid', fgColor='EDEDED'); FILL_EX = PatternFill('solid', fgColor='DDEBF7'); FILL_HINT = PatternFill('solid', fgColor='F7F7F7')
thin = Side(style='thin', color='BFBFBF'); BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical='center'); CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)

# ---------- пример данных ----------
EXAMPLE_BH = [
    dict(id='СКВ-101', report_id='ИГИ-2025/12', doc='Отчёт ИГИ 2025/12, Моя геодезия', org='Моя геодезия', method='шнековое', date='2025-05-10', depth=12, lng=73.0860, lat=49.8065,
         x_src='', y_src='', crs_src='WGS84', acc='A', z=541.3, z_src='тахеометр', gw_first=5.0, gw_stable=4.5, gw_date='2025-05-10', bearing_kpa=220, aggressive='неагрессивные', note=''),
    dict(id='СКВ-102', report_id='ИГИ-2025/12', doc='Отчёт ИГИ 2025/12, Моя геодезия', org='Моя геодезия', method='шнековое', date='2025-05-12', depth=12, lng=73.0885, lat=49.8052,
         x_src='', y_src='', crs_src='WGS84', acc='B', z=541.9, z_src='по топоплану', gw_first=5.2, gw_stable=4.8, gw_date='2025-05-12', bearing_kpa='', aggressive='', note=''),
    dict(id='СКВ-103', report_id='ИГИ-2012/04', doc='Отчёт ИГИ 2012/04', org='Др. организация', method='', date='2012-09-03', depth=8, lng=73.0831, lat=49.8089,
         x_src='(условно) 5431220', y_src='(условно) 4450118', crs_src='МСК, пересчитано в QGIS', acc='C', z='', z_src='', gw_first='', gw_stable=3.1, gw_date='', bearing_kpa='', aggressive='',
         note='Координаты сняты со схемы. Отметку устья в журнале не нашла.'),
]
EXAMPLE_LY = [
    ('СКВ-101', 0, 0.6, 'Почвенно-растительный слой', ''), ('СКВ-101', 0.6, 3.4, 'Суглинок песчанистый', 'ИГЭ-1'), ('СКВ-101', 3.4, 7.5, 'Глина тугопластичная', 'ИГЭ-2'),
    ('СКВ-101', 7.5, 10, 'Песок с гравием', 'ИГЭ-3'), ('СКВ-101', 10, 12, 'Известняк выветрелый', 'ИГЭ-4'),
    ('СКВ-102', 0, 0.5, 'Почвенно-растительный слой', ''), ('СКВ-102', 0.5, 3.8, 'Суглинок', ''), ('СКВ-102', 3.8, 8, 'Глина', ''), ('СКВ-102', 8, 10.4, 'Песок', ''), ('СКВ-102', 10.4, 12, 'Известняк', ''),
    ('СКВ-103', 0, 1.2, 'Насыпной грунт', ''), ('СКВ-103', 1.2, 4.5, 'Суглинок', ''), ('СКВ-103', 4.5, 8, 'Глина', ''),
]
# строка-образец (строка 4) на листах ввода — показывает формат, в выгрузку не попадает
SAMPLE_BH = dict(id='СКВ-ОБРАЗЕЦ', report_id='ИГИ-2025/12', doc='Название отчёта, год', org='Организация', method='шнековое', date='2025-05-10', depth=12, lng=73.0860, lat=49.8065,
                 x_src='', y_src='', crs_src='WGS84', acc='A', z=541.3, z_src='тахеометр', gw_first=5.0, gw_stable=4.5, gw_date='2025-05-10', bearing_kpa=220, aggressive='', note='ПРИМЕР — не удаляйте и не вводите сюда данные', check='← строка-образец')
SAMPLE_LY = ('СКВ-ОБРАЗЕЦ', 0.6, 3.4, 'Суглинок песчанистый', 'ИГЭ-1')

INSTRUCTION = [
    ('h1', 'Оцифровка скважин: как заполнять шаблон'),
    ('p', 'Цель: перенести данные из бумажных/PDF журналов бурения так, чтобы они совпадали между собой. Любая неточность здесь потом портит отчёты клиентам, поэтому вводите ровно то, что написано в журнале, а сомнения записывайте в «Примечание», а не «исправляйте» молча.'),
    ('h2', 'Порядок работы'),
    ('li', '1. Лист «Скважины»: одна строка = одна скважина. Паспорт скважины (координаты, дата, глубина, вода) вводится ОДИН раз. Жёлтые клетки — для ввода; серые — формулы, их не трогайте.'),
    ('li', '2. Лист «Слои»: одна строка = один слой. Слои одной скважины идут ПОДРЯД, сверху вниз. В первой колонке — ID скважины ровно как на листе «Скважины».'),
    ('li', '3. Посмотрите колонки «Проверка» на обоих листах. «ok» — зелёное, «⚠» — жёлтое (можно оставить, но геолог увидит), красное — исправьте.'),
    ('li', '4. Перейдите на лист «Экспорт» (он заполняется сам) и сохраните ЕГО: Файл → Сохранить как → тип «CSV UTF-8 (разделитель — запятая)». В русском Excel разделителем фактически станет точка с запятой, это нормально, система понимает оба варианта. Excel сохраняет только активный лист, поэтому лист «Экспорт» должен быть открыт. Кодировка именно UTF-8, иначе русские буквы испортятся.'),
    ('li', '5. Передайте CSV геологу или загрузите в админке: «Скважины → Импорт скважин по слоям → Загрузить на проверку». Скважины попадут в очередь проверки, в модель они не попадают, пока геолог их не примет.'),
    ('h2', 'Что вводить'),
    ('li', 'ID скважины — как в журнале (СКВ-101, 12-Б). Не должен повторяться. Одна и та же скважина из двух отчётов — две разные строки с разными ID (геолог разберётся с дублем).'),
    ('li', 'Документ-источник — название отчёта и год. По нему геолог найдёт оригинал, поэтому поле обязательное.'),
    ('li', 'Дата бурения — формат ГГГГ-ММ-ДД (2025-05-10). Если даты нет в журнале — оставьте пустой (будет предупреждение).'),
    ('li', 'Координаты — в градусах WGS84: долгота (lng, около 73.0…) и широта (lat, около 49.8…). Если в журнале координаты в местной системе (X/Y), впишите их в «X исходная / Y исходная», а перевод в градусы выполняет геодезист в QGIS. Пока колонки lng/lat не заполнены, скважина не пройдёт проверку.'),
    ('li', 'Класс точности координат: A — сняты тахеометром или RTK (так указано в отчёте); B — обычный GPS/ГНСС; C — сняты со схемы, плана или «привязка к ситуации»; D — координат нет или им нельзя доверять. Сомневаетесь — ставьте ниже (C), а не выше. Класс D в модель не попадает.'),
    ('li', 'Отметка устья — абсолютная высота земли в точке скважины, м (например 541.3), как в журнале. Не путать с глубиной. Нет в журнале — оставьте пустой.'),
    ('li', 'Глубина скважины, м — полная глубина бурения. Должна совпадать с подошвой последнего слоя.'),
    ('li', 'Вода: «появилась» — глубина, на которой встретили воду; «установилась» — глубина, на которой уровень стабилизировался (обычно меньше). Если воды не было — оставьте оба поля пустыми и напишите «воды не было» в «Примечание».'),
    ('li', 'Слои: «от» и «до» — глубина кровли и подошвы в метрах от поверхности. Первый слой от 0; «от» следующего слоя равно «до» предыдущего; «до» последнего слоя равно глубине скважины.'),
    ('li', 'Название грунта — КАК В ЖУРНАЛЕ, основной грунт первым словом: «Суглинок тугопластичный», «Глина мягкопластичная», «Песок пылеватый». НЕ переставляйте слова («тугопластичный суглинок» система не распознает). Колонка «Грунт распознан?» подскажет, знает ли система такое название; «?» значит его надо добавить в справочник (это делает геолог).'),
    ('h2', 'Частые ошибки'),
    ('li', '• Пустая или неверная система координат: долгота и широта перепутаны местами (lng должно быть ~73, lat ~49.8).'),
    ('li', '• Глубины слоёв в сантиметрах или с запятой вместо числа — вводите числа в метрах (0,6 или 0.6).'),
    ('li', '• Разрыв между слоями (до=3,4, следующий от=3,6) — проверьте, не пропущена ли строка.'),
    ('li', '• Слои одной скважины разбросаны по листу — держите их подряд.'),
    ('li', '• Исправили данные «по здравому смыслу» — так нельзя: вносите как в журнале, сомнение — в «Примечание».'),
    ('li', '• Сохранили лист «Слои» или «Скважины» вместо «Экспорт».'),
    ('h2', 'Лимиты и совместимость'),
    ('li', 'В файле помещается до 300 скважин и 1000 слоёв. Для больших партий используйте несколько файлов.'),
    ('li', 'Формулы рассчитаны на Microsoft Excel 2010 и новее (и LibreOffice). Если при открытии пусто, включите вычисление формул (Формулы → Параметры вычислений → Автоматически).'),
    ('li', 'Колонки «X/Y исходная» и «Примечание» в CSV не попадают — это ваши рабочие заметки.'),
]

def style_header(ws, row, items):
    for i, (key, head, width, hint, req) in enumerate(items, start=1):
        c = ws.cell(row=row, column=i, value=head); c.font = f(True, 10, 'FFFFFF'); c.fill = FILL_REQ if req else FILL_HEAD; c.alignment = CENTER; c.border = BORDER
        ws.column_dimensions[chr(ord('A') + i - 1)].width = width
        h = ws.cell(row=row - 1, column=i, value=hint); h.font = f(False, 8, '595959', True); h.fill = FILL_HINT; h.alignment = CENTER; h.border = BORDER
    ws.row_dimensions[row].height = 42; ws.row_dimensions[row - 1].height = 30

def build(example):
    wb = Workbook()
    # ===== Инструкция =====
    wi = wb.active; wi.title = 'Инструкция'; wi.sheet_view.showGridLines = False; wi.column_dimensions['A'].width = 120
    r = 1
    for kind, text in INSTRUCTION:
        c = wi.cell(row=r, column=1, value=text); c.alignment = Alignment(wrap_text=True, vertical='top')
        if kind == 'h1': c.font = f(True, 16, '1F3864'); wi.row_dimensions[r].height = 28
        elif kind == 'h2': c.font = f(True, 12, 'C55A11'); wi.row_dimensions[r].height = 22; r += 0
        else: c.font = f(False, 10); wi.row_dimensions[r].height = max(16, 15 * (len(text) // 115 + 1))
        r += 1
    r += 1
    wi.cell(row=r, column=1, value='Цвета: жёлтое — вводите; серое — формулы, не трогать; голубая строка № 4 на листах ввода — образец формата (не удалять, данные начинаются со строки 5).').font = f(False, 10, '595959', True)
    selfcheck_row = r + 2
    # ===== Скважины =====
    wb_ = wb.create_sheet('Скважины'); ws = wb_
    ws['A1'] = 'Скважины — по одной строке на скважину. Паспорт вводится один раз; слои — на листе «Слои».'; ws['A1'].font = f(True, 12, '1F3864')
    style_header(ws, 3, BH)
    for i, (key, *_r) in enumerate(BH, start=1):
        c = ws.cell(row=4, column=i, value=SAMPLE_BH.get(key)); c.font = f(False, 10, '1F4E79', True); c.fill = FILL_EX; c.border = BORDER; c.alignment = WRAP
    n_ch = ord('A') + len(BH) - 1
    for r_ in range(R0, BH_LAST + 1):
        for i, (key, *_x) in enumerate(BH, start=1):
            c = ws.cell(row=r_, column=i); c.border = BORDER; c.font = f()
            c.fill = FILL_FORM if key == 'check' else FILL_IN
            if key in ('date', 'gw_date', 'id', 'report_id', 'doc'): c.number_format = '@'
        k = COL
        chk = (f'=IF(A{r_}="","",IFERROR('
               f'IF(COUNTIF($A${R0}:$A${BH_LAST},A{r_})>1,"дубль ID на этом листе",'
               f'IF(OR(NOT(ISNUMBER({k["lng"]}{r_})),NOT(ISNUMBER({k["lat"]}{r_}))),"нет координат: lng и lat должны быть числами",'
               f'IF(OR({k["lng"]}{r_}<72.9,{k["lng"]}{r_}>73.3,{k["lat"]}{r_}<49.6,{k["lat"]}{r_}>50),"координаты вне Караганды: lng и lat перепутаны или другая система координат?",'
               f'IF(ISNA(MATCH({k["acc"]}{r_},{{"A","B","C","D"}},0)),"укажите класс точности A, B, C или D",'
               f'IF({k["acc"]}{r_}="D","класс D: в модель не попадёт, выясните координаты",'
               f'IF(NOT(ISNUMBER({k["depth"]}{r_})),"нет глубины скважины",'
               f'IF(COUNTIF(\'Слои\'!$A${R0}:$A${LY_LAST},A{r_})=0,"нет слоёв на листе «Слои»",'
               f'IF(ABS({k["depth"]}{r_}-SUMPRODUCT(MAX((\'Слои\'!$A${R0}:$A${LY_LAST}=A{r_})*\'Слои\'!$C${R0}:$C${LY_LAST})))>0.1,"глубина не равна подошве последнего слоя",'
               f'IF({k["date"]}{r_}="","⚠ нет даты бурения",'
               f'IF(NOT(OR(AND(LEN({k["date"]}{r_})=10,MID({k["date"]}{r_},5,1)="-",MID({k["date"]}{r_},8,1)="-"),AND(LEN({k["date"]}{r_})=10,MID({k["date"]}{r_},3,1)=".",MID({k["date"]}{r_},6,1)="."))),"дата: нужен формат ГГГГ-ММ-ДД",'
               f'IF({k["doc"]}{r_}="","⚠ нет документа-источника",'
               f'IF({k["acc"]}{r_}="C","⚠ класс C: вес в модели снижен",'
               f'IF({k["z"]}{r_}="","⚠ нет отметки устья",'
               f'IF(AND({k["gw_first"]}{r_}="",{k["gw_stable"]}{r_}=""),"⚠ нет данных о воде (если воды не было — напишите в примечании)","ok"))))))))))))))'
               f',"проверьте строку"))')
        ws.cell(row=r_, column=n_ch - ord('A') + 1, value=chk)
    ws.freeze_panes = 'B5'
    # проверки ввода
    dv_acc = DataValidation(type='list', formula1='"A,B,C,D"', allow_blank=True); dv_acc.error = 'Допустимо A, B, C или D'; dv_acc.errorTitle = 'Класс точности'
    ws.add_data_validation(dv_acc); dv_acc.add(f'{COL["acc"]}{R0}:{COL["acc"]}{BH_LAST}')
    def dec(rng, lo, hi, title, style='warning'):
        d = DataValidation(type='decimal', operator='between', formula1=str(lo), formula2=str(hi), allow_blank=True, errorStyle=style); d.errorTitle = title; d.error = f'Ожидается число от {lo} до {hi}. Продолжить?'; ws.add_data_validation(d); d.add(rng)
    dec(f'{COL["lng"]}{R0}:{COL["lng"]}{BH_LAST}', 72.9, 73.3, 'Долгота'); dec(f'{COL["lat"]}{R0}:{COL["lat"]}{BH_LAST}', 49.6, 50.0, 'Широта')
    dec(f'{COL["depth"]}{R0}:{COL["depth"]}{BH_LAST}', 0.5, 100, 'Глубина'); dec(f'{COL["z"]}{R0}:{COL["z"]}{BH_LAST}', 300, 900, 'Отметка устья')
    dec(f'{COL["gw_first"]}{R0}:{COL["gw_stable"]}{BH_LAST}', 0, 100, 'Уровень воды')
    ck = COL['check']
    for color, formula in (('C6EFCE', f'LEFT(${ck}{R0},2)="ok"'), ('FFEB9C', f'LEFT(${ck}{R0},1)="⚠"'), ('FFC7CE', f'AND(${ck}{R0}<>"",LEFT(${ck}{R0},2)<>"ok",LEFT(${ck}{R0},1)<>"⚠")')):
        ws.conditional_formatting.add(f'{ck}{R0}:{ck}{BH_LAST}', FormulaRule(formula=[formula], fill=PatternFill('solid', bgColor=color, fgColor=color)))
    # ===== Слои =====
    wl = wb.create_sheet('Слои')
    wl['A1'] = 'Слои — по строке на слой. Слои одной скважины идут подряд, сверху вниз.'; wl['A1'].font = f(True, 12, '1F3864')
    LY = [('id', 'ID скважины *', 16, 'ровно как на листе «Скважины»', True), ('from', 'От, м *', 10, 'кровля слоя', True), ('to', 'До, м *', 10, 'подошва слоя', True),
          ('soil', 'Название грунта *', 34, 'как в журнале, основной грунт первым словом', True), ('ige', 'ИГЭ', 10, 'номер, если есть', False),
          ('rec', 'Грунт распознан?', 20, 'заполняется само', False), ('check', 'Проверка', 48, 'заполняется само', False)]
    style_header(wl, 3, LY)
    smp = SAMPLE_LY + ('', '← строка-образец')
    for i, v in enumerate(smp, start=1):
        c = wl.cell(row=4, column=i, value=v); c.font = f(False, 10, '1F4E79', True); c.fill = FILL_EX; c.border = BORDER
    OKX = f'IF(LEFT($F{{r}},1)="?","⚠ грунт не в справочнике (его добавит геолог)","ok")'
    for r_ in range(R0, LY_LAST + 1):
        for i in range(1, 8):
            c = wl.cell(row=r_, column=i); c.border = BORDER; c.font = f(); c.fill = FILL_FORM if i >= 6 else FILL_IN
        wl.cell(row=r_, column=1).number_format = '@'
        wl.cell(row=r_, column=6, value=(f'=IF(D{r_}="","",IF(SUMPRODUCT((LEN(\'Справочник\'!$A$5:$A$80)>0)*(LEFT(SUBSTITUTE(LOWER(D{r_}),"ё","е"),LEN(\'Справочник\'!$A$5:$A$80))=\'Справочник\'!$A$5:$A$80))>0,"✓","? нет в справочнике"))'))
        ok = OKX.format(r=r_)
        wl.cell(row=r_, column=7, value=(f'=IF(A{r_}="","",IFERROR('
              f'IF(ISNA(MATCH(A{r_},\'Скважины\'!$A${R0}:$A${BH_LAST},0)),"нет такой скважины на листе «Скважины»",'
              f'IF(D{r_}="","нет названия грунта",'
              f'IF(OR(NOT(ISNUMBER(B{r_})),NOT(ISNUMBER(C{r_}))),"глубины должны быть числами",'
              f'IF(C{r_}<=B{r_},"подошва не глубже кровли",'
              f'IF(A{r_}<>A{r_ - 1},IF(COUNTIF($A$4:A{r_ - 1},A{r_})>0,"слои этой скважины уже были выше: держите их подряд",IF(ABS(B{r_})>0.05,"первый слой должен начинаться с 0 м",{ok})),'
              f'IF(ABS(B{r_}-C{r_ - 1})>0.05,"разрыв или перекрытие со слоем выше",{ok})))))),"проверьте строку"))'))
    wl.freeze_panes = 'B5'
    dvs = DataValidation(type='list', formula1=f"='Справочник'!$E$5:$E${4 + len(TYPICAL)}", allow_blank=True, showErrorMessage=False); wl.add_data_validation(dvs); dvs.add(f'D{R0}:D{LY_LAST}')
    for col in 'BC':
        d = DataValidation(type='decimal', operator='between', formula1='0', formula2='100', allow_blank=True, errorStyle='warning'); d.errorTitle = 'Глубина слоя'; d.error = 'Ожидается число от 0 до 100 (метры). Продолжить?'; wl.add_data_validation(d); d.add(f'{col}{R0}:{col}{LY_LAST}')
    for color, formula in (('C6EFCE', f'LEFT($G{R0},2)="ok"'), ('FFEB9C', f'LEFT($G{R0},1)="⚠"'), ('FFC7CE', f'AND($G{R0}<>"",LEFT($G{R0},2)<>"ok",LEFT($G{R0},1)<>"⚠")')):
        wl.conditional_formatting.add(f'G{R0}:G{LY_LAST}', FormulaRule(formula=[formula], fill=PatternFill('solid', bgColor=color, fgColor=color)))
    wl.conditional_formatting.add(f'F{R0}:F{LY_LAST}', FormulaRule(formula=[f'LEFT($F{R0},1)="?"'], fill=PatternFill('solid', bgColor='FFEB9C', fgColor='FFEB9C')))
    # ===== Экспорт =====
    we = wb.create_sheet('Экспорт')
    for i, (name, _s) in enumerate(EXPORT, start=1):
        c = we.cell(row=1, column=i, value=name); c.font = f(True, 10, 'FFFFFF'); c.fill = FILL_HEAD; c.alignment = CENTER
        we.column_dimensions[chr(ord('A') + i - 1)].width = 14
    for r_ in range(2, 2 + EX_ROWS):
        k = r_ + (R0 - 2)
        for i, (name, src) in enumerate(EXPORT, start=1):
            if name == 'id': v = f"=IF('Слои'!$A{k}=\"\",\"\",'Слои'!$A{k})"
            elif src and src.startswith('LY:'): v = f"=IF($A{r_}=\"\",\"\",'Слои'!${src[3]}{k}&\"\")"
            else:
                col = COL[src]; v = f"=IF($A{r_}=\"\",\"\",IFERROR(INDEX('Скважины'!${col}${R0}:${col}${BH_LAST},MATCH($A{r_},'Скважины'!$A${R0}:$A${BH_LAST},0))&\"\",\"\"))"
            c = we.cell(row=r_, column=i, value=v); c.font = f(); c.number_format = '@' if False else 'General'
    we.freeze_panes = 'B2'
    # ===== Справочник =====
    wd = wb.create_sheet('Справочник')
    wd['A1'] = 'Справочник грунтов (справка). Рабочий справочник ведёт геолог в админке; здесь его копия для подсказок.'; wd['A1'].font = f(True, 12, '1F3864')
    wd['A2'] = 'Система сопоставляет название по началу ПЕРВОГО слова. Если ваш грунт не распознан («?» на листе «Слои»), запишите его в «Примечание» и сообщите геологу.'; wd['A2'].font = f(False, 9, '595959', True)
    for i, h in enumerate(['Начало слова', 'Класс', 'Название класса', '', 'Типовые названия (выпадающий список)'], start=1):
        c = wd.cell(row=4, column=i, value=h); c.font = f(True, 10, 'FFFFFF'); c.fill = FILL_HEAD; c.alignment = CENTER
    for i, (p, cl) in enumerate(SOIL_DICT):
        wd.cell(row=5 + i, column=1, value=p).font = f(); wd.cell(row=5 + i, column=2, value=cl).font = f(); wd.cell(row=5 + i, column=3, value=CLASSES[cl]).font = f()
    for i, nm in enumerate(TYPICAL): wd.cell(row=5 + i, column=5, value=nm).font = f()
    for col, w in zip('ABCDE', (16, 8, 30, 3, 34)): wd.column_dimensions[col].width = w
    wd.cell(row=5 + max(len(SOIL_DICT), len(TYPICAL)) + 1, column=1, value='Источник: DEFAULT_SOIL_DICT в server.js (по умолчанию). Начала слов записаны строчными, «ё» заменена на «е».').font = f(False, 9, '595959', True)
    # ===== Эталон + самопроверка (только в примере) =====
    if example:
        for r_, b in enumerate(EXAMPLE_BH, start=R0):
            for i, (key, *_x) in enumerate(BH, start=1):
                if key in ('check',): continue
                v = b.get(key, ''); c = wb['Скважины'].cell(row=r_, column=i, value=(v if v != '' else None))
        for r_, (i_, a, b2, s, ige) in enumerate(EXAMPLE_LY, start=R0):
            for col, v in zip(range(1, 6), (i_, a, b2, s, ige or None)): wb['Слои'].cell(row=r_, column=col, value=v)
        N = len(EXAMPLE_LY); by = {b['id']: b for b in EXAMPLE_BH}
        wt = wb.create_sheet('Эталон'); wt['A1'] = 'ключ: id|report_id|acc|date|method|org|doc|soil (эталон для самопроверки)'; wt['A1'].font = f(True)
        for j, (i_, a, b2, s, ige) in enumerate(EXAMPLE_LY, start=2):
            b = by[i_]; wt.cell(row=j, column=1, value='|'.join(str(x) for x in (i_, b['report_id'], b['acc'], b['date'], b['method'], b['org'], b['doc'], s)))
        wt.column_dimensions['A'].width = 120
        e = N + 1; ex = lambda c: f"'Экспорт'!{c}2:{c}{e}"
        key = '&"|"&'.join(ex(c) for c in (EXL['id'], EXL['report_id'], EXL['acc'], EXL['date'], EXL['method'], EXL['org'], EXL['doc'], EXL['soil']))
        c = wi.cell(row=selfcheck_row, column=1, value=(f'=IF(AND(SUMPRODUCT(--(({key})<>\'Эталон\'!A2:A{e}))=0,\'Экспорт\'!A{e + 1}=""),'
                                                         '"✓ САМОПРОВЕРКА: лист «Экспорт» собрал данные примера правильно — шаблон работает","✗ САМОПРОВЕРКА: выгрузка отличается от эталона — не пользуйтесь файлом и сообщите разработчику")'))
        c.font = f(True, 11, '1F3864'); wi.row_dimensions[selfcheck_row].height = 22
        wi.conditional_formatting.add(f'A{selfcheck_row}', FormulaRule(formula=[f'LEFT($A${selfcheck_row},1)="✓"'], fill=PatternFill('solid', bgColor='C6EFCE', fgColor='C6EFCE')))
        wi.conditional_formatting.add(f'A{selfcheck_row}', FormulaRule(formula=[f'LEFT($A${selfcheck_row},1)="✗"'], fill=PatternFill('solid', bgColor='FFC7CE', fgColor='FFC7CE')))
    wb.calculation.fullCalcOnLoad = True
    return wb

# ---------- симуляция выгрузки (то, что должен получиться на листе «Экспорт» и в CSV) ----------
def num(v):
    if v == '' or v is None: return ''
    return (str(v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)).replace('.', ',')
def export_rows():
    by = {b['id']: b for b in EXAMPLE_BH}; rows = []
    for (i_, a, b2, s, ige) in EXAMPLE_LY:
        b = by[i_]
        rows.append([i_, b['report_id'], num(b['lng']), num(b['lat']), b['crs_src'], b['acc'], num(b['z']), b['z_src'], b['date'], num(b['depth']), b['method'], b['org'], b['doc'],
                     num(b['gw_first']), num(b['gw_stable']), b['gw_date'], num(b['bearing_kpa']), b['aggressive'], num(a), num(b2), s, ige])
    return rows
def csv_text(rows):
    q = lambda x: '"' + x.replace('"', '""') + '"' if (';' in x or '"' in x or '\n' in x) else x
    return '﻿' + '\r\n'.join(';'.join(q(str(c)) for c in r) for r in [[n for n, _s in EXPORT]] + rows) + '\r\n'

if __name__ == '__main__':
    build(False).save(os.path.join(OUT, 'boreholes-template.xlsx'))
    build(True).save(os.path.join(OUT, 'boreholes-example-filled.xlsx'))
    open(os.path.join(OUT, 'boreholes-template.csv'), 'w', encoding='utf-8', newline='').write(csv_text([]))
    open(os.path.join(OUT, 'boreholes-example.csv'), 'w', encoding='utf-8', newline='').write(csv_text(export_rows()))
    with open(os.path.join(OUT, 'INSTRUCTION.md'), 'w', encoding='utf-8') as fh:
        fh.write('# Оцифровка скважин: инструкция для камеральщика\n\nФайлы: `boreholes-template.xlsx` — чистый шаблон, `boreholes-example-filled.xlsx` — заполненный пример для обучения, `boreholes-example.csv` — как выглядит готовая выгрузка.\n\n')
        for kind, text in INSTRUCTION[1:]:
            if kind == 'h2': fh.write(f'\n## {text}\n\n')
            elif kind == 'p': fh.write(text + '\n')
            else: fh.write(('- ' + text if not text[:2].strip().rstrip('.').isdigit() and not text.startswith('•') else text.replace('• ', '- ')) + '\n')
    print('готово:', os.listdir(OUT))
