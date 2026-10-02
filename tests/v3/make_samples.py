# Made-up sample inputs for the v3 tests (fictional dishes, no real venue data).
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont
import openpyxl
D = os.path.join(os.path.dirname(__file__), 'samples'); W, H = A4

def recipe_page(c, title, ings, method, yield_each, bat):
    c.setFont("Helvetica-Bold", 20); c.drawString(40, H-60, title)
    c.setFont("Helvetica", 9); c.drawString(40, H-85, "Recipe Categories: Demo / Banquet")
    c.drawString(40, H-120, "BAT-" + bat)
    c.setFont("Helvetica-Bold", 10); c.drawString(250, H-120, "Ingredients:")
    c.setFont("Helvetica", 9); y = H-140
    for qty, name, cost in ings:
        c.drawString(250, y, qty); c.drawString(310, y, name); c.drawString(450, y, cost); y -= 16
    y -= 14; c.setFont("Helvetica-Bold", 10); c.drawString(250, y, "Method:"); y -= 16
    c.setFont("Helvetica", 9)
    for line in method: c.drawString(250, y, line); y -= 14
    y -= 10
    for x, t in [(250, "Batch number"), (330, "Produced by"), (410, "Date"), (470, "Temperature")]: c.drawString(x, y, t)
    y -= 24; c.drawString(250, y, "Yield:"); c.drawString(285, y, f"{yield_each} 1 *Each Servings")
    c.showPage()

c = canvas.Canvas(os.path.join(D, 'sample-recipes.pdf'), pagesize=A4)
recipe_page(c, "Roast Pumpkin Salad", [("4 Kilograms", "Butternut pumpkin", "$12.00"), ("600 Grams", "Baby spinach", "$9.00"),
    ("300 Grams", "Pepita crumb", "$6.00"), ("1.5 Liters", "Maple dressing", "$4.00"), ("2 Bunch", "Chives", "$3.00")],
    ["1. Peel pumpkin, cut into 3 cm dice.", "2. Toss with oil and salt, roast at 200C for 25 min.",
     "3. Cool on trays, then chill below 5C.", "4. Dress with maple dressing just before service."], 120, "02/10/2026")
recipe_page(c, "Braised Lamb Shoulder", [("12 Kilograms", "Lamb shoulder", "$180.00"), ("800 Grams", "Brown onion", "$2.00"),
    ("2 Liters", "Lamb jus", "$15.00"), ("500 Grams", "Garlic", "$6.00")],
    ["1. Season lamb, sear hard on all sides.", "2. Braise covered at 150C for 4 hours.",
     "3. Pull meat, strain and reduce the jus by half.", "4. Portion 120 g per guest, vac-pack and label."], 120, "02/10/2026")
c.save()

# A recipe "screenshot" (PNG) and the same image inside a PDF with no text layer.
img = Image.new('RGB', (900, 600), 'white'); d = ImageDraw.Draw(img)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 22)
except Exception: f = ImageFont.load_default()
lines = ["Market Fish with Salsa Verde", "", "Ingredients:", "9 Kilograms  Snapper fillet", "3 Bunch  Parsley", "",
         "Method:", "1. Pin-bone fillets, portion 150 g.", "2. Blitz parsley, capers, oil for salsa verde.", "3. Pan-roast fish skin side down 4 min."]
for i, t in enumerate(lines): d.text((30, 25 + i*34), t, fill='black', font=f)
img.save(os.path.join(D, 'recipe-screenshot.png'))
c = canvas.Canvas(os.path.join(D, 'recipe-screenshot-only.pdf'), pagesize=A4)
c.drawImage(os.path.join(D, 'recipe-screenshot.png'), 30, H-430, width=540, height=360); c.showPage(); c.save()

# Multi-sheet workbook with real tab names (one sheet holds two dishes stacked).
wb = openpyxl.Workbook(); wb.remove(wb.active)
def block(ws, r, title, pax, items):
    ws.cell(r, 1, title); ws.cell(r+1, 1, 'PAX'); ws.cell(r+1, 2, pax)
    for j, h in enumerate(['Item', 'Qty', 'Unit']): ws.cell(r+2, j+1, h)
    for i, (it, q, u) in enumerate(items): ws.cell(r+3+i, 1, it); ws.cell(r+3+i, 2, q); ws.cell(r+3+i, 3, u)
    return r + 3 + len(items) + 8
ws = wb.create_sheet('Beef Fillet Sat'); block(ws, 1, 'Beef Fillet Sat', 80, [('Beef fillet trim and portion', 0.18, 'kg'), ('Red wine jus', 0.05, 'L'), ('Carrots peel and batonnet', 0.06, 'kg')])
ws = wb.create_sheet('Tuna Tartare Canapé'); block(ws, 1, 'Tuna Tartare Canapé', 150, [('Yellowfin tuna dice', 0.03, 'kg'), ('Wonton crisps fry', 2, 'ea'), ('Chives fine chop', 0.002, 'kg')])
ws = wb.create_sheet('Pavlova (GF) - Sunday Lunch Mkt'); block(ws, 1, 'Pavlova (GF) - Sunday Lunch Mkt', 60, [('Meringue bake', 1, 'ea'), ('Cream whip', 0.04, 'L'), ('Passionfruit pulp', 0.02, 'L')])
ws = wb.create_sheet('Staff Meal'); r = block(ws, 1, 'Chicken Curry', 30, [('Chicken thigh dice', 0.15, 'kg'), ('Onion slice', 0.05, 'kg')]); block(ws, r, 'Steamed Rice', 30, [('Jasmine rice wash', 0.08, 'kg')])
wb.save(os.path.join(D, 'sample-multisheet.xlsx'))
print('ok', sorted(os.listdir(D)))
