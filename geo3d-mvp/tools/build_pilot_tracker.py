# -*- coding: utf-8 -*-
"""Трекер пилота скважин (Excel без формул): отбор, прогресс, замечания проверки, журнал решений, приёмка.
Запуск: python tools/build_pilot_tracker.py docs"""
import sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = sys.argv[1] if len(sys.argv) > 1 else 'docs'
os.makedirs(OUT, exist_ok=True)
F = 'Arial'
HEAD = PatternFill('solid', fgColor='1F3864'); IN = PatternFill('solid', fgColor='FFF9E5'); LOCK = PatternFill('solid', fgColor='EDEDED')
thin = Side(style='thin', color='BFBFBF'); BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
fnt = lambda b=False, s=10, c='000000', i=False: Font(name=F, bold=b, size=s, color=c, italic=i)
WRAP = Alignment(wrap_text=True, vertical='top'); CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)

wb = Workbook()

def sheet(title, headers, widths, rows=60, prefilled=None, note=None, validations=()):
    ws = wb.create_sheet(title)
    ws['A1'] = title; ws['A1'].font = fnt(True, 13, '1F3864')
    if note: ws['A2'] = note; ws['A2'].font = fnt(False, 9, '595959', True); ws['A2'].alignment = Alignment(wrap_text=False)
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        c = ws.cell(row=4, column=i, value=h); c.font = fnt(True, 10, 'FFFFFF'); c.fill = HEAD; c.alignment = CENTER; c.border = BORDER
        ws.column_dimensions[chr(ord('A') + i - 1)].width = w
    ws.row_dimensions[4].height = 44
    n = len(prefilled) if prefilled else rows
    for r in range(5, 5 + max(n, rows if not prefilled else n)):
        for i in range(1, len(headers) + 1):
            c = ws.cell(row=r, column=i); c.border = BORDER; c.font = fnt(); c.alignment = WRAP; c.fill = IN
        if prefilled and r - 5 < len(prefilled):
            for i, v in enumerate(prefilled[r - 5], start=1):
                c = ws.cell(row=r, column=i, value=v)
                if v not in (None, ''): c.fill = LOCK if i <= 2 else IN
    for col, options in validations:
        last = 4 + (n if prefilled else rows)
        dv = DataValidation(type='list', formula1='"' + ','.join(options) + '"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'{col}5:{col}{last}')
    ws.freeze_panes = 'A5'
    return ws

# ===== Инструкция =====
wi = wb.active; wi.title = 'Инструкция'; wi.sheet_view.showGridLines = False; wi.column_dimensions['A'].width = 110
lines = [('h', 'Трекер пилота: скважины, замечания, решения, приёмка'),
         ('p', 'Файл ведёт ответственный за пилот (или по листам: камеральщик — «Прогресс», геолог — «Замечания проверки», руководитель — «Журнал решений» и «Приёмка»). Формул в файле нет: всё вносится вручную. План и критерии — docs/PILOT.md.'),
         ('s', 'Листы'),
         ('p', '1. «Отбор» — кандидаты в пилот и решение, включать ли. Цель: 20–30 скважин одного района, из них 3–5 контрольных (не загружаются до конца пилота).'),
         ('p', '2. «Прогресс» — по каждой скважине: введена ли, сколько минут ушло, загружена ли, решение геолога.'),
         ('p', '3. «Замечания проверки» — каждое предупреждение автопроверки, которое геолог оценил: верно / ложное срабатывание / неоднозначно, и что с этим делать.'),
         ('p', '4. «Журнал решений» — что решили на встречах (справочник, пороги, шаблон, процесс) и кто внедряет.'),
         ('p', '5. «Приёмка» — критерии успеха пилота, цели и фактические значения из «Отчёта по пилоту» в админке.'),
         ('s', 'Цвета'),
         ('p', 'Жёлтые клетки — вводить. Серые — подписи, не менять. Выпадающие списки: выберите значение из списка.'),
         ('p', 'Целевые значения на листе «Приёмка» — предложения; согласуйте их с геологом и руководителем до старта пилота.')]
r = 1
for kind, t in lines:
    c = wi.cell(row=r, column=1, value=t); c.alignment = Alignment(wrap_text=True, vertical='top')
    c.font = fnt(True, 16, '1F3864') if kind == 'h' else fnt(True, 12, 'C55A11') if kind == 's' else fnt()
    wi.row_dimensions[r].height = 28 if kind == 'h' else 22 if kind == 's' else max(16, 15 * (len(t) // 105 + 1)); r += 1

sheet('Отбор', ['№', 'ID скважины', 'Документ-источник (отчёт, год)', 'Организация', 'Источник координат', 'Есть отметка устья', 'Есть вода', 'Соседей в 500 м (≈)', 'Сложность', 'Роль в пилоте', 'Включить в пилот', 'Комментарий'],
      [5, 14, 30, 18, 18, 12, 10, 12, 12, 16, 12, 34], rows=45,
      note='Кандидаты и решение. Состав: ~12 типовых, 6–8 трудных, 2–3 пары дублей, 3–5 контрольных (см. docs/PILOT.md, раздел 3).',
      validations=[('E', ['тахеометр/RTK', 'GNSS', 'по схеме', 'неизвестно']), ('F', ['да', 'нет']), ('G', ['да', 'нет']), ('I', ['простая', 'средняя', 'сложная']),
                   ('J', ['типовая', 'трудная', 'возможный дубль', 'контрольная']), ('K', ['да', 'нет', 'решить'])])
sheet('Прогресс', ['ID скважины', 'Партия (1/2/3/контроль)', 'Сканы готовы', 'Введено (дата)', 'Кто ввёл', 'Время ввода, мин', 'Загружено в систему (дата)', 'Ошибок', 'Предупреждений', 'Проверено геологом (дата)', 'Время проверки, мин', 'Решение', 'Комментарий'],
      [14, 14, 11, 13, 14, 12, 14, 9, 13, 14, 12, 16, 34], rows=45,
      note='Одна строка на скважину. Время ввода и проверки замеряйте: по ним считаем трудозатраты на весь архив.',
      validations=[('B', ['1', '2', '3', 'контроль']), ('C', ['да', 'нет']), ('L', ['принята', 'отклонена', 'на доработку', 'в работе'])])
sheet('Замечания проверки', ['ID скважины', 'Код замечания (напр. W_NEIGHBOR)', 'Текст замечания (кратко)', 'Оценка геолога', 'Нужное действие', 'Комментарий геолога', 'Выполнено'],
      [14, 22, 40, 18, 24, 44, 11], rows=80,
      note='Каждое предупреждение, которое геолог разобрал. По доле «ложных срабатываний» калибруем пороги.',
      validations=[('D', ['верно', 'ложное срабатывание', 'неоднозначно']), ('E', ['поправить данные', 'изменить порог', 'добавить грунт в справочник', 'изменить шаблон/инструкцию', 'ничего']), ('G', ['да', 'нет'])])
sheet('Журнал решений', ['Дата', 'Вопрос', 'Решение', 'Кто принял', 'Что меняем', 'Кто внедряет', 'Статус'],
      [12, 40, 50, 16, 22, 16, 14], rows=40,
      note='Решения встреч и калибровки. Здесь же — какие пороги и записи справочника изменены и почему.',
      validations=[('E', ['справочник грунтов', 'пороги проверок', 'шаблон / инструкция', 'процесс', 'данные', 'другое']), ('G', ['запланировано', 'в работе', 'сделано', 'отклонено'])])
accept = [
    ('1', 'Время ввода одной скважины камеральщиком (с 6-й скважины)', 'замерить; ориентир ≤ 30 мин', '', '', ''),
    ('2', 'Время проверки одной скважины геологом', '≤ 10 мин', '', '', ''),
    ('3', 'Доля скважин с ошибками при первой загрузке', '1-я партия ≤ 30%, 2-я ≤ 15%', '', '', ''),
    ('4', 'Грунты без класса после калибровки справочника', '0; в новых партиях ≤ 5% слоёв', '', '', ''),
    ('5', 'Ложные срабатывания среди предупреждений (оценка геолога)', '≤ 30%', '', '', ''),
    ('6', 'Скважины с ошибками или класса D в модели', '0', '', '', ''),
    ('7', 'Модель по соседям: 90% скважин предсказываются не хуже согласованного порога', 'да', '', '', ''),
    ('8', 'Контрольные скважины: расхождение с моделью приемлемо для ориентировочного отчёта', 'да, по мнению геолога', '', '', ''),
    ('9', 'Паспорт участка: геолог согласен с блоками «Грунты» и «Достоверность» на 3 тестовых точках', '3 из 3', '', '', ''),
]
ws = sheet('Приёмка', ['№', 'Критерий', 'Цель (предложение — согласовать)', 'Факт', 'Выполнено', 'Комментарий'], [5, 62, 34, 16, 13, 40], prefilled=accept,
           note='Факт берём из «Отчёта по пилоту» в админке и из листов «Прогресс» и «Замечания проверки».', validations=[('E', ['да', 'нет', 'частично'])])
# внизу приёмки — решение
rr = 5 + len(accept) + 1
ws.cell(row=rr, column=2, value='Решение по итогам (масштабировать / доработать и повторить / остановить)').font = fnt(True)
for col in range(2, 5):
    c = ws.cell(row=rr + 1, column=col); c.fill = IN; c.border = BORDER
ws.merge_cells(start_row=rr + 1, start_column=2, end_row=rr + 1, end_column=4)
ws.cell(row=rr + 3, column=2, value='Оценка трудозатрат на весь архив: число скважин × (время ввода + время проверки), см. docs/PILOT.md раздел 4.').font = fnt(False, 9, '595959', True)

wb.save(os.path.join(OUT, 'pilot-tracker.xlsx'))
print('готово:', os.path.join(OUT, 'pilot-tracker.xlsx'))
