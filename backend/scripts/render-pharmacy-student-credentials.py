"""Render only a committed mapping report. No password recovery or reset."""
import json
import os
import sys
from html import escape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle

source, output = sys.argv[1:3]
with open(source) as stream:
    report = json.load(stream)
if report.get('applied') is not True:
    raise SystemExit('Refusing a production credential PDF from an unapplied preview')
students = report['students']
if len(students) != report['eligible'] or len({x['sid'] for x in students}) != len(students):
    raise SystemExit('Credential row reconciliation failed')
styles = getSampleStyleSheet()
styles['BodyText'].fontSize = 8
styles['BodyText'].leading = 11
para = lambda text: Paragraph(escape(str(text)), styles['BodyText'])
doc = SimpleDocTemplate(output, pagesize=landscape(A4), leftMargin=28, rightMargin=28, topMargin=32, bottomMargin=32)
story = [Paragraph('Pharmacy Student Login Directory', styles['Title']),
         para('PRIVATE - Authorized university administration only. Generated: '+report['generated_at']), Spacer(1,8),
         para('Login: https://falcon.jataka.io/ | Use your SID as the login ID. Passwords have NOT been reset. Use your current password. Ask authorized support if you cannot sign in.'),
         para('Email addresses below are Falcon application identities, not confirmed working university mailboxes. Prior contact emails are retained separately. Do not rely on these addresses for password recovery until university IT confirms provisioning.'), Spacer(1,12)]
rows = [[para(x) for x in ['#','Student name','Programme','SID / Login ID','Mapped email','Password']]]
for i,student in enumerate(students,1):
    rows.append([para(x) for x in [i, student['name'],student['programme'],student['sid'],student['email'],student['password_instruction']]])
table = LongTable(rows,colWidths=[24,135,85,75,235,200],repeatRows=1,hAlign='LEFT')
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e5edf7')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#ccd5e0')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f6f8fb')]),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
story.append(table)
def footer(canvas,doc):
    canvas.setFont('Helvetica',8)
    canvas.drawString(28,18,'Private credential handoff | '+str(len(students))+' eligible Pharmacy students | No password resets')
    canvas.drawRightString(814,18,'Page '+str(doc.page))
doc.build(story,onFirstPage=footer,onLaterPages=footer)
os.chmod(output,0o600)
