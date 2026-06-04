#!/usr/bin/env node
/**
 * Re-derive docs/extracted-srd-json/monsters.json from the SRD 5.2.1 PDF.
 *
 * WHY THIS EXISTS
 * ---------------
 * The original PDF→JSON extraction (committed 2026-03-24) interleaved the SRD's
 * two-column page layout, so each monster absorbed fragments of whatever stat block
 * sat beside or below it (wrong condition immunities, foreign legendary actions,
 * "Gear" lines bleeding into condition_immunities, etc. — see VEG-261). This script
 * re-extracts the bestiary in a column-aware way and rewrites ONLY the fields that
 * the original extraction corrupted, leaving the (verified-correct) structured fields
 * — armor_class, hit_points, ability_scores, speed, skills, challenge_rating, xp,
 * proficiency_bonus, initiative, size/type/alignment, lair_actions — untouched.
 *
 * HOW IT WORKS
 *   1. `pdftotext -bbox-layout` emits every word with x/y coordinates.
 *   2. Words are split into left/right columns by x (gutter ~297pt) and re-ordered
 *      page → column → y → x, linearizing the snaking two-column reading order.
 *      (Steps 1–2 live in the shared scripts/lib/srd-pdf.mjs core — VEG-270.)
 *   3. Stat blocks are located (a Size/Type/Alignment line immediately followed by an
 *      "AC <n>" line) and parsed with hard section delimiters (Skills/Resistances/
 *      Immunities/Vulnerabilities/Gear/Senses/Languages/CR, then Traits/Actions/
 *      Bonus Actions/Reactions/Legendary Actions).
 *   4. The corrupt fields are rewritten in place; the file's schema/field order is
 *      preserved so the diff is confined to corrected values.
 *
 * REQUIREMENTS: `pdftotext` (poppler).  macOS: `brew install poppler`.
 * USAGE: node scripts/extract-srd-monsters.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bboxLayout, linearizeColumns, joinHyphenatedLines } from './lib/srd-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(ROOT, 'resources', 'SRD_CC_v5.2.1.pdf');
const OUT = path.join(ROOT, 'docs', 'extracted-srd-json', 'monsters.json');

const CONDITIONS = ['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];
const CONDSET = new Set(CONDITIONS);
const SIZES = ['Tiny','Small','Medium','Large','Huge','Gargantuan'];
const SECTION_HEADERS = ['Traits','Actions','Bonus Actions','Reactions','Legendary Actions','Lair Actions'];
const LABELS = ['Skills','Resistances','Vulnerabilities','Immunities','Gear','Senses','Languages'];

// ── Stat-block parsing ─────────────────────────────────────────────────────
const SIZE_RE = new RegExp(`^(${SIZES.join('|')}) .+, .+`);
const isSizeLine = l => SIZE_RE.test(l) && !/[.:]/.test(l.split(',')[0]);
const fixSpaced = s => s.replace(/\bS tr\b/g,'Str').replace(/\bD ex\b/g,'Dex').replace(/\bC on\b/g,'Con').replace(/\bI nt\b/g,'Int').replace(/\bW is\b/g,'Wis').replace(/\bC ha\b/g,'Cha');
const isBoundary = l => LABELS.some(k=>l.startsWith(k+' ')) || l.startsWith('CR ') || SECTION_HEADERS.includes(l.trim());

function splitDamageCond(rest){
  let dmg=[], cond=[];
  if (rest.includes(';')) {
    const [d,c]=rest.split(';');
    dmg=d.split(',').map(x=>x.trim()).filter(Boolean);
    cond=c.split(',').map(x=>x.trim()).filter(Boolean);
  } else {
    for (const it of rest.split(',').map(x=>x.trim()).filter(Boolean)) {
      (CONDSET.has(it.split(' ')[0]) ? cond : dmg).push(it);
    }
  }
  return { dmg, cond };
}

const CONNECTORS = new Set(['of','the','and','or','in','to','from','with','a','an','on','at','by','as']);
function entryName(l){
  const m=l.match(/^(.{2,60}?)\.\s+(.+)$/);
  if(!m) return null;
  const name=m[1].trim();
  if(/[:]/.test(name)) return null;
  if(/\b(ft|DC|Hit|Failure|Success)$/.test(name)) return null;
  let title=0, inParen=false;
  for(const w of name.split(/\s+/)){
    if(inParen){ if(w.includes(')')) inParen=false; continue; }
    if(w.startsWith('(')){ if(!w.includes(')')) inParen=true; continue; }
    if(/^[0-9]/.test(w)) continue;
    if(CONNECTORS.has(w.toLowerCase())) continue;
    if(/^[A-Z][A-Za-z0-9'’/\-]*\)?$/.test(w)){ title++; continue; }
    return null;
  }
  return title? { name, rest:m[2] } : null;
}

function splitEntries(secLines){
  const entries=[]; const lead=[]; let cur=null;
  for(const l of secLines){
    const nm=entryName(l);
    const prevEnds = !cur || /[.!?]["”’)]?\s*$/.test(joinHyphenatedLines(cur.pieces));
    if(nm && prevEnds){ if(cur) entries.push(cur); cur={ name:nm.name.trim(), pieces:[nm.rest] }; }
    else if(cur) cur.pieces.push(l);
    else lead.push(l);
  }
  if(cur) entries.push(cur);
  return { lead: joinHyphenatedLines(lead), entries: entries.map(e=>({ name:e.name, description:joinHyphenatedLines(e.pieces) })) };
}

function isHeadingTrailer(l){
  if(!l) return false;
  if(/[.!?:;,]\s*$/.test(l)) return false;
  if(/\.\s/.test(l)) return false;
  if(l.length>40 || l.split(/\s+/).length>5) return false;
  return /^[A-Z0-9]/.test(l);
}

function parseBlock(blockLines, name){
  let L = blockLines.map(x=>x.replace(/\s+/g,' ').trim());
  while(L.length>2 && isHeadingTrailer(L[L.length-1])) L.pop();
  const m={ name };
  let i=2; const labelBuf={};
  for(; i<L.length; i++){
    const l=L[i];
    if(/^(S tr|Str)\b/.test(l)){ continue; }
    if(/^(I nt|Int)\b/.test(l)){ continue; }
    if(l.startsWith('MOD SAVE')||l.startsWith('AC ')||l.startsWith('HP ')||l.startsWith('Speed ')) continue;
    let lbl=null; for(const k of LABELS) if(l.startsWith(k+' ')) lbl=k;
    if(lbl){
      let buf=l.slice(lbl.length+1);
      while(i+1<L.length && !isBoundary(L[i+1]) && !SECTION_HEADERS.includes(L[i+1])){ buf+=' '+L[++i]; }
      labelBuf[lbl]=buf.trim();
      continue;
    }
    if(l.startsWith('CR ')){ i++; break; }
  }
  m.defense={ damage_resistances:[], damage_immunities:[], damage_vulnerabilities:[], condition_immunities:[] };
  if(labelBuf.Resistances) m.defense.damage_resistances=splitDamageCond(labelBuf.Resistances).dmg;
  if(labelBuf.Vulnerabilities) m.defense.damage_vulnerabilities=splitDamageCond(labelBuf.Vulnerabilities).dmg;
  if(labelBuf.Immunities){ const r=splitDamageCond(labelBuf.Immunities); m.defense.damage_immunities=r.dmg; m.defense.condition_immunities=r.cond; }
  m.senses=labelBuf.Senses??null;
  m.languages=labelBuf.Languages??null;

  const buckets=[]; let cur={header:null,lines:[]};
  for(const l of L.slice(i)){
    if(SECTION_HEADERS.includes(l)){ if(cur.header||cur.lines.length) buckets.push(cur); cur={header:l,lines:[]}; }
    else cur.lines.push(l);
  }
  if(cur.header||cur.lines.length) buckets.push(cur);
  m.sections={}; m.sectionLead={};
  for(const bk of buckets){ if(!bk.header) continue; const {lead,entries}=splitEntries(bk.lines); m.sections[bk.header]=entries; m.sectionLead[bk.header]=lead; }
  return m;
}

function parseAll(lines, knownNames){
  const starts=[];
  for(let i=1;i<lines.length-1;i++){
    if(isSizeLine(lines[i]) && /^AC\s+\d/.test(lines[i+1])) starts.push({ nameIdx:i-1, name:lines[i-1].trim() });
  }
  const out=new Map();
  for(let s=0;s<starts.length;s++){
    const name=starts[s].name;
    if(!knownNames.has(name) || out.has(name)) continue;
    const from=starts[s].nameIdx, to=s+1<starts.length?starts[s+1].nameIdx:lines.length;
    out.set(name, parseBlock(lines.slice(from,to), name));
  }
  return out;
}

// ── 4. Sub-field derivation (matches the existing JSON schema/conventions) ──
function splitUsage(name){
  const m=name.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m? { base:m[1].trim(), usage:m[2].trim() } : { base:name.trim(), usage:null };
}
function deriveAttack(desc){
  let attack_type=null;
  if(/Melee or Ranged Attack Roll/.test(desc)) attack_type='Ranged';
  else if(/Melee Attack Roll/.test(desc)) attack_type='Melee';
  else if(/Ranged Attack Roll/.test(desc)) attack_type='Ranged';
  let to_hit=null,reach=null,range=null,damage=null;
  if(attack_type){
    const h=desc.match(/Attack Roll:\s*\+(\d+)/); to_hit=h?+h[1]:null;
    const rc=desc.match(/reach (\d+ ft\.)/); reach=rc?rc[1]:null;
    const rg=desc.match(/range (\d+(?:\/\d+)? ft\.)/); range=rg?rg[1]:null;
    const dm=desc.match(/Hit:\s*(.+? damage)\b/); damage=dm?dm[1].trim():null;
  }
  return { attack_type, to_hit, reach, range, damage };
}
const toAction=e=>{ const {base,usage}=splitUsage(e.name); const a=deriveAttack(e.description);
  return { name:base, description:e.description, ...a, usage }; };
const toTrait=e=>{ const {base,usage}=splitUsage(e.name); return { name:base, description:e.description, usage }; };

// ── 5. Merge into the existing file (overwrite corrupt fields only) ─────────
function main(){
  if(!fs.existsSync(PDF)) throw new Error(`SRD PDF not found at ${PDF}`);
  const doc=JSON.parse(fs.readFileSync(OUT,'utf8'));
  const knownNames=new Set(doc.monsters.map(m=>m.name));
  const parsed=parseAll(linearizeColumns(bboxLayout(PDF)), knownNames);

  const missing=[...knownNames].filter(n=>!parsed.has(n));
  if(missing.length) throw new Error(`Parser missed ${missing.length} monsters: ${missing.join(', ')}`);

  doc.metadata.extraction_date='2026-06-03';
  for(const c of doc.monsters){
    const p=parsed.get(c.name), def=p.defense;
    c.damage_resistances    = def.damage_resistances.length? def.damage_resistances : null;
    c.damage_immunities     = def.damage_immunities.length?  def.damage_immunities  : null;
    c.damage_vulnerabilities= def.damage_vulnerabilities.length? def.damage_vulnerabilities : null;
    c.condition_immunities  = def.condition_immunities.length? def.condition_immunities : null;
    c.senses    = p.senses ?? null;
    c.languages = p.languages ?? null;

    const pick=(arr,curVal,empty)=>arr.length?arr:((curVal==null||(Array.isArray(curVal)&&!curVal.length))?curVal:empty);
    c.traits        = pick((p.sections['Traits']||[]).map(toTrait),        c.traits, []);
    c.actions       = pick((p.sections['Actions']||[]).map(toAction),       c.actions, null);
    c.bonus_actions = pick((p.sections['Bonus Actions']||[]).map(toAction), c.bonus_actions, null);
    c.reactions     = pick((p.sections['Reactions']||[]).map(toAction),     c.reactions, null);
    const leg=(p.sections['Legendary Actions']||[]).map(toAction);
    c.legendary_actions = leg.length? { description:p.sectionLead['Legendary Actions']||'', actions:leg } : null;
  }

  let out=JSON.stringify(doc,null,2); if(!out.endsWith('\n')) out+='\n';
  fs.writeFileSync(OUT,out);
  console.log(`Re-derived ${doc.monsters.length} monsters -> ${path.relative(ROOT,OUT)}`);
}
main();
