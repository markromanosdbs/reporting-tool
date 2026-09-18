# Roller Blinds Job Sheet — Calculation Logic Reference
Extracted from `20260917_1458_Roller_Blinds_Job_Sheet_BUZ_Davidson_s_Blinds_Shutters.xlsm`
(the blank master template used for every Roller Blinds order)

This document exists to let the web app reproduce this workbook's calculations exactly.
It's organised in the order data actually flows through the sheets:

```
BUZ order data (Data tab)
        │
        ▼
   JOB SHEET  ◄──── the single calculation engine — every dimension, colour,
        │            tube size, bracket, control etc. is resolved here first
        │
   ┌────┼─────────────┬─────────────┬─────────────┬────────────┐
   ▼    ▼             ▼             ▼             ▼            ▼
Fabric  Tube        Pelmets    Installation   (all read Job Sheet,
Cutting Cutting                                resolve/relabel for
   │      │            │                       their own department)
   └──────┴─────┬──────┘
                ▼
      Assembly(a) / Assembly(b) / Bagging / Tubing / Electrical Form
                │
                ▼
           COMPONENTS  ◄──── final bill-of-materials: reads every other
                              sheet and tallies exact SKU quantities
```

Every downstream sheet is a **read-only relabelling/lookup layer** — none of them
take fresh user input. If you reimplement the **Job Sheet** column logic and the
**lookup tables**, you can derive everything else the same way this workbook does.

---

## 0. Foundational piece: the `BPLookup` custom function

Almost every Job Sheet formula uses `bpLOOKUP(...)`, which is **not a native Excel
function** — it's a VBA macro (`BPLookup`) embedded in this workbook. You must
replicate its behaviour in code; it does not exist in the destination web app's
formula layer.

**VBA source (from `xl/vbaProject.bin`):**
```vb
Function BPLookup(lookup_PkId As String, lookup_Text As String, table_array As Range,
                   col_index_num As Integer, range_lookup As Boolean,
                   Optional defaultValue = "")
    If lookup_PkId <> "" Then
        BPLookup = VLookup(Format(lookup_PkId) & "|" & UCase(lookup_Text), table_array, col_index_num, range_lookup)
    Else
        BPLookup = VLookup(UCase(lookup_Text), table_array, col_index_num, range_lookup)
    End If
    ' if the looked-up value itself contains a "|", only take the part before it
    posn = InStr(BPLookup, "|")
    If posn > 0 Then BPLookup = Left(BPLookup, posn - 1)
    If BPLookup = "" Then BPLookup = defaultValue
    If BPLookup = "0" Then BPLookup = Val(defaultValue)
End Function
```

**What it does in plain terms:** every Job Sheet call looks like
`=bpLOOKUP(Data!$AV11,"FIT",CustOrdOpt,6,FALSE)`. `Data!AV11` is the order-line's
internal ID (`OrderItemPkId`), and `"FIT"` is a **field code**. The function builds
the key `"<OrderItemPkId>|FIT"`, looks it up in the `CustOrdOpt` table (from BUZ),
and returns the matching option value BUZ sent for that field on that line.

**`CustOrdOpt` table** (named range `Data!$CE$10:$CK$66`) is where BUZ writes each
order line's selected options as key/value pairs (`OrderItemPkId | FieldCode →
Value`). In the blank master template this table is empty (it's populated live
per-order); its shape is: `PkId | Descn(=key), PkId, PkId, OrderItemPkId, Descn, StrValue`.

**Field codes used throughout Job Sheet** (these are exactly the option keys your
web app / BUZ integration needs to be able to send per line item):

`DUAL`, `SIZE`, `SIDEBYSIDE`, `FIT`, `FIXING`, `CONTROLS`, `CONTROLSIDE`, `MOTOREX`,
`REVROLL`, `CHAIN`, `CHAINLENGTH`, `CONTROLOPTION`, `FINISH`, `RAILCOLOUR`, `BRACKET`,
`BRACKETCOLR`, `LINKED`, `LINKEDSIZE`, `BRAIDCOLOURS`, `PELTYPE`, `PELCOLOUR`, `PELCP`,
`ADDWIDTH`, `PELSHAPE`, `ITHGT`, `PELRETURN`, `PELRETURNSIZE`, `HBSIZE`, `PIPING`,
`INSTALLATION`, `HANGHEIGHT`, `INSTALLG`, `TAKEDOWN`, `CHECKM`, `NOTES`

**Reimplementation rule:** `bpLOOKUP(pkId, fieldCode, table, col, exact)` ≈
`table.find(row => row.key === pkId + "|" + fieldCode.toUpperCase())[col]`, falling
back to a default if nothing found, with a fixed value coerced to `0`.

---

## 1. Job Sheet — the calculation engine

One row per blind (order line). Every column, in order, with its formula and what
it means. `11` is the first data row; the formula is identical (shifted) on every
row after it.

| Col | Header | Formula | What it does |
|---|---|---|---|
| A | Sticker No. | `=TRIM(Data!AW11)` | Line's sticker/label number from BUZ |
| B | Location | `=Data!AY11` | Room/location text from BUZ |
| C | Entered Width | `=SUM(Data!BA11)` | Raw width the customer/salesperson entered |
| D | Dual | `=bpLOOKUP(...,"DUAL",...)` | Whether this is a dual-blind setup |
| E | Sizes | `=bpLOOKUP(...,"SIZE",...)` | Sizing method: `Cloth` / `Opening` / `Making` / `Outside of Bracket to Outside of Bracket` |
| F | Additional Deductions | `=bpLOOKUP(...,"SIDEBYSIDE",...)` | Side-by-side/butt install adjustment code |
| **G** | **Blind Width** | see below | **The core width calculation** |
| H | Blind Drop | `=Data!BB11` | Raw drop, passed straight through |
| I | Fabric Type & Colour | `=MID(Data!BE11,6,80)` | Strips a 5-char prefix code off BUZ's fabric string |
| J | Fit | `=bpLOOKUP(...,"FIT",...)` | Face / Reveal / Top Fix / Outside Window Mount / Inside Window Mount |
| K | Fixing | `=bpLOOKUP(...,"FIXING",...)` | Fixing type |
| L | Control | `=bpLOOKUP(...,"CONTROLS",...)` | Chain Winder / Spring / motor type etc. |
| M | Control Side | `=bpLOOKUP(...,"CONTROLSIDE",...)` | Left/Right |
| N | Motor Extras | `=bpLOOKUP(...,"MOTOREX",...)` | Extra motor accessories requested |
| O | Fabric Direction | `=bpLOOKUP(...,"REVROLL",...)` | Front/Back roll |
| P | Chain | `=bpLOOKUP(...,"CHAIN",...)` | Chain type/colour requested |
| Q | Chain Length | `=bpLOOKUP(...,"CHAINLENGTH",...)` | Requested chain length |
| R | Remote Control | `=bpLOOKUP(...,"CONTROLOPTION",...)` | Remote/receiver model requested |
| S | Bottom Trim | `=bpLOOKUP(...,"FINISH",...)` | Bottom rail/trim style |
| T | Blind/Rail Finish | `=bpLOOKUP(...,"RAILCOLOUR",...)` | Requested rail colour (may be "Match"/"Cream") |
| U | Bracket | `=bpLOOKUP(...,"BRACKET",...)` | Bracket/mount style requested |
| V | Component Colour | `=bpLOOKUP(...,"BRACKETCOLR",...)` | Requested bracket colour (may be "Match"/"Cream") |
| W | Linked | `=bpLOOKUP(...,"LINKED",...)` | Whether this blind links to another |
| X | Linked Blinds over 2700mm Wide | `=bpLOOKUP(...,"LINKEDSIZE",...)` | Flag used to force 43mm H/D tube |
| Y | Linked Layout Code | `=VLOOKUP(AR11&M11&W11, TubeLinkRef, 7, FALSE)` | Layout code for how linked blinds are wired together |
| Z | Braid/Fringe Colours | `="Match" → colour-matched via ColourMatch, else literal value` | Resolves fringe colour |
| AA | Pelmet or Cassette Type | `=bpLOOKUP(...,"PELTYPE",...)` | None / Aluminium Pelmet / Square Cassette / etc. |
| AB | Colour | `=bpLOOKUP(...,"PELCOLOUR"...) or "PELCP" if Custom Powdercoat` | Pelmet colour |
| AC | Pelmet Add to Width | `=bpLOOKUP(...,"ADDWIDTH",...)` defaults to "None" | Extra width added for pelmet overhang |
| AD | Pelmet Shape | `=bpLOOKUP(...,"PELSHAPE",...)` | |
| AE | Pelmet Face Size | `=bpLOOKUP(...,"ITHGT",...)` | |
| AF | Pelmet Returns | `=bpLOOKUP(...,"PELRETURN",...)` | |
| AG | Pelmet Return Size | `=bpLOOKUP(...,"PELRETURNSIZE",...)` | |
| AH | Headboard Size(mm) | `=bpLOOKUP(...,"HBSIZE",...)` | |
| AI | Pelmet Piping | `=bpLOOKUP(...,"PIPING",...)` | |
| AJ | Installation Deliver or Supply Only | `=bpLOOKUP(...,"INSTALLATION",...)` | Installation / Deliver / Supply Only |
| AK | Installation Height off Ground | `=bpLOOKUP(...,"HANGHEIGHT",...)` | |
| AL | Installation Difficulty Grading | `=bpLOOKUP(...,"INSTALLG",...)` | |
| AM | Take Downs | `=bpLOOKUP(...,"TAKEDOWN",...)` | |
| AN | Product Requires Check Measure | `=bpLOOKUP(...,"CHECKM",...)` | |
| AO | Comment | `=bpLOOKUP(...,"NOTES",...)` | |
| AQ | Stock Fabric? | `=VLOOKUP(I11, ColourMatch, 2, FALSE)` | Looks the fabric name up in the master fabric table |
| **AR** | **Control** | see below | **Resolves the exact motor/control model, incl. motor-size lookup grids** |
| **AS** | **Bracket** | see below | **Resolves final bracket type, upgrading to "Motor Brackets" variants for E6/M6 motors** |
| AT | Motor Tails / Batteries | `=VLOOKUP(AR11, ControlDeduct, 4, FALSE)` | |
| AU | Helper Spring | see below | Determines if/which helper spring is required |
| **AV** | **Tube** | see below | **Selects 38mm / 43mm / 43mm H/D / 60mm tube** |
| **AW** | **Tube Length** | `=G11 - VLOOKUP(AR11,ControlDeduct,2) - VLOOKUP(W11,Linkdeduct,2) - VLOOKUP(AA11&J11&AR11,PelmetDeduct,2)` | Blind width minus control/link/pelmet deductions |
| AX | B/Rail Length | `=IF(S11 IN {"Standard Scallop","Plain Sewn-In Timber Lath"}, AW11-9, AW11)` | |
| AY | Fabric Width | `=AW11-2` | |
| **AZ** | **Fabric Drop** | `=H11 + VLOOKUP(S11,BlindFinish,2) + VLOOKUP(AV11,TubeDropAllowance,2)` | Blind drop plus finish allowance plus tube-specific drop allowance |
| BA | Pelmet or Cassette Width | `=G11 + VLOOKUP(AC11,Pelmetadd,2)` (blank if no pelmet) | |
| BB | Pelmet or Fascia Brackets | `=VLOOKUP(AA11&J11&AR11, PelmetDeduct, 8)` | |
| BC | Pelmet or Fascia End Caps | `=VLOOKUP(AA11&J11&AR11, PelmetDeduct, 6)` | |
| BD | Bottom Rail Colour | `="Match"→ColourMatch col4; "Cream"→"Sandstone"; else literal` | |
| BE | Bracket Colour | `="Cream"→"Birch White"; "Match"→ColourMatch col3; else literal` | |
| BF | Chain Colour | `="Metal Chain"→"Nickel Steel Chain"; "Cream Chain"→"Birch White Chain"; "Match"→ColourMatch col5; blank+line exists→"No Chain"; else literal` | |
| BG | 12v Motor Cover Colour | `Only if Control="Acmeda 12v Motor": White/Black direct, else ColourMatch col8` | |
| BH | Pelmet Buying | `=VLOOKUP(AA11 & PELCOLOUR, PelmetBuy, 2)` | Whether pelmet is "DBS to Make" or bought in |

### G — Blind Width (the core width formula)
```
IF Sizes="Cloth" AND Pelmet="None":        EnteredWidth + 30
IF Sizes="Cloth" AND Pelmet<>"None":       EnteredWidth + 30 + PelmetDeduct[Pelmet,Fit,Control]
IF Sizes="Opening" AND Additional="Butt":  EnteredWidth - FitDeduct[Fit] - ButtDeduct[Bracket,Fit]
IF Sizes="Opening":                        EnteredWidth - FitDeduct[Fit] - SideDeduct[Additional Deductions]
IF Sizes IN {"Making","Outside of Bracket to Outside of Bracket"}: EnteredWidth (unchanged)
```

### AR — Control (motor/control model resolution)
```
IF Dual="Yes - Front Blind" AND Control="Chain Winder" AND Bracket is one of the
   8 "Slimline Dual Top Blind ... Control" styles:
       → "Chain Winder Fixed Guide"
ELSE IF Control="Acmeda 12v Motor":
       → INDEX/MATCH into the Acmeda12vRGrid using Drop (row) and Width (col)
ELSE IF Control="Acmeda Remote Motor":
       → INDEX/MATCH into Acmeda240vRGrid
ELSE IF Control="Acmeda CBUS Motor":
       → INDEX/MATCH into Acmeda240vCBUSRGrid
ELSE IF Control="Acmeda DCRF 12v Motor":
       → INDEX/MATCH into Acmeda12vDCRFRGrid
ELSE IF Control="Spring":
       → VLOOKUP(EnteredWidth, Spring table, approximate match)
ELSE:
       → Control value unchanged (e.g. "Chain Winder" stays "Chain Winder")
```
The four `Acmeda*RGrid` tables are **width × drop matrices** — the correct
motor/spring size for that exact blind's dimensions. These MUST be reproduced as
2D lookup tables in the web app (see `Acmeda12vRGrid.csv` etc. in the lookup
tables bundle) — this is not a simple 1-column VLOOKUP.

### AS — Bracket (upgrades to "Motor Bracket" variants)
If the selected motor is an "Acmeda E6 Motor" or "Acmeda M6 Motor", the plain
bracket style (Single / Single & Single Linked / Single with Covers / Single
Extension / Single Extension with Extension Covers) gets renamed to its
"...Motor Brackets..." equivalent. If it's a back blind (`Dual="Yes - Back
Blind"`), bracket becomes "Not Required". Otherwise passes the raw `BRACKET`
option through unchanged.

### AU — Helper Spring
```
IF BlindWidth > 2429 AND TubeLinkRef[Control,ControlSide,Linked].col8 = "Check":
       → "Yes - " + HelperSpring[ControlSide|Linked|FabricDirection]
ELSE IF TubeLinkRef[...].col8 = "Yes":
       → "Yes - " + HelperSpring[...]
ELSE:
       → "No"
```

### AV — Tube (tube-diameter selection)
```
IF Bracket="60mm Tube Single":                      → "60mm"
IF LinkedOver2700="Yes":                             → "43mm H/D"
IF Bracket="Linked 60mm":                            → "60mm"
IF Control="1.1nm 12v Acmeda Short Motor" AND 544<Width<560: → "38mm"
IF Width<500:   → TubeLinkRef[Control,ControlSide,Linked].col2
IF Width<2100:  → TubeLinkRef[...].col3
IF Width<2729:  → TubeLinkRef[...].col5
IF Width>2728:  → TubeLinkRef[...].col6
```
`TubeLinkRef` (named range `Deductions!$AP$3:$AW$228`) is the master tube-size
decision table keyed on `Control&ControlSide&Linked` — export included.

---

## 2. Downstream department sheets

These all **read Job Sheet's resolved values** (plus each other) — no new
calculation inputs. Full column-by-column formulas for each are in the
accompanying CSVs (`sheet_formulas/*.csv`); the summary below covers what each
sheet is *for* and its handful of genuinely new pieces of logic.

### Fabric Cutting
Pulls fabric name/width/drop from Job Sheet, then looks up **cutting-specific
attributes by fabric name** in `ColourMatch` (which is really a full fabric
master table, not just colour-matching): cutting head (col 9), fabric roll width
(col 10), fabric-required length (col 11), whether it needs a cotton lining (col
12, only if "Back" roll direction). Also computes valance fabric size when pelmet
type = "Aluminium Valance - Fabric Covered" (`Width+4`, fixed `200mm` drop).

### Tube Cutting
Re-derives tube length, rail length, lath requirement (`TimberLath` lookup),
B/rail weight bar requirement (only for narrow blinds <450mm, non-plain bottom
trim), and pelmet/cassette/fascia lengths — all via `PelmetDeduct` columns 3–6,
keyed on `Pelmet&Fit&Control`.

### Pelmets
Resolves pelmet bracket quantities (`PelmetBrackets` lookup by width), whether
side-guide funnels/bottom-caps/locks are needed, and end-cap requirements — all
conditioned on the pelmet/cassette type and `PelmetDeduct` flags (columns 5, 7, 9).

### Assembly(a) / Assembly(b)
Re-labels bottom-rail finish (adds "& Fluffy Strip" if noise-reducing strip +
lath both present), resolves which pull-ring/lath supplier owns fringe
attachment based on customer type (`$A$6`), computes chain colour (skips "No
Chain"), computes chain length via an array formula (see `Assembly(b)` CSV for
the exact array formula text), resolves helper-spring left/right for Spring
control, and flags whether hairspray is needed (fabric description contains
"Light Filtering").

### Bagging
Resolves final delivery method (Wholesale customers always get "W/Sale
Deliver"), bracket colour (from Assembly(b)), safety-tag/chain-safe flag, motor
covers, screw/chain-stop counts (conditional cascade based on pelmet presence
and customer type), and a running blind-count total.

### Tubing / Electrical Form / Installation / Upholstered Pelmet Order Form
Presentation/relabelling layers for packing instructions, electrical-trade
requirements, and installer time estimates. Installation's time-estimate formula
is a genuine calculation worth reproducing directly:
```
IF InstallGrading="Extreme - Consult Installer": "Consult Installer"
ELSE:
  (5 + FHEIGHT[height] + FGRADING[grading] + FTAKEDOWN[takedown] + FSURFACE[fixing]
     + FFITTING[fit] + FPELMET[pelmet] + FDeduct[additional] + FCONTROL[control])
  × (0.75 if FDBRACKET[pelmet]="Yes" else 1)
```
(All the `F*` tables are small point-cost tables — exported in the lookup bundle.)

---

## 3. Components — the bill-of-materials tab

~440 columns, one per exact SKU (every tube size × every colour × every bracket
style × every chain length × every colour, etc.). The pattern is identical
throughout (see the walkthrough already done for the order-specific file, and
`sheet_formulas/Components_formulas.csv` for the literal formula in every
column):

- **Identifier/reference columns** (Quote No., Line No., Business Name, Fabric,
  etc.) — straight pass-throughs from Data/Job Sheet.
- **One genuine calculation**: `Fabric Sqm = Fabric Width × Fabric Drop ÷
  1,000,000`.
- **Every other column** is `=IF(AND(<size/colour/style match>), 1 or <length>,
  "")` — a router that drops a quantity into the one column matching this
  blind's resolved attributes, leaving every other variant blank.

**Reimplementation approach:** don't port 440 near-duplicate IF formulas. Instead
build one function per part category (tube, bottom rail, chain winder, bracket,
chain, motor, remote, pelmet hardware) that takes the blind's resolved
attributes (tube size, colours, control type, bagging style, chain length) and
returns `{sku, quantity}` — that's the actual business rule these columns encode.
The full formula CSV is there so you can verify your reimplementation against
every existing rule instead of guessing.

---

## 4. Lookup tables (must be reproduced as data, not formulas)

All ~50 named ranges this workbook depends on have been exported as CSV
(`lookup_tables/*.csv`). Key ones:

| Table | Size | Purpose |
|---|---|---|
| `CustOrdOpt` | order-time only | BUZ's per-line option values (empty in this blank template) |
| `ColourMatch` | ~3,780 rows | **Master fabric table** — colour matching AND fabric attributes (cutting head, roll width, fabric-required length, lining flag, stock status) |
| `PelmetDeduct` | ~3,230 rows | Master pelmet/cassette deduction table keyed on `Pelmet&Fit&Control` |
| `TubeLinkRef` | 226 rows | Tube-size decision table keyed on `Control&ControlSide&Linked` |
| `FitDeduct`, `SideDeduct`, `ButtDeduct` | small | Width deduction tables for Fit / Additional Deductions / Butt-join styles |
| `ControlDeduct` | ~48 rows | Per-control tube-length deduction + battery/tail flags |
| `Linkdeduct` | ~25 rows | Deduction for linked blinds |
| `BlindFinish`, `TubeDropAllowance` | small | Drop allowances by bottom-trim style / tube size |
| `Pelmetadd` | small | Width added to pelmet for overhang style |
| `HelperSpring` | small | Helper-spring size by `ControlSide|Linked|FabricDirection` |
| `MotorLookUp` | ~47 rows | Standardises raw Control text into Assembly(b)'s motor label |
| `PelmetBrackets`, `PelmetBuy`, `SideGuideLocks`, `TimberLath` | small | Pelmet/cassette hardware lookups |
| `Spring` | small | Approximate-match spring size by entered width |
| `Acmeda12vRGrid`, `Acmeda240vRGrid`, `Acmeda240vCBUSRGrid`, `Acmeda12vDCRFRGrid` (+ matching `*RWidth`/`*RDrop` index vectors) | grids | **2D width×drop lookup matrices** for exact motor model selection |
| `FHEIGHT`, `FGRADING`, `FTAKEDOWN`, `FSURFACE`, `FFITTING`, `FPELMET`, `FDeduct`, `FCONTROL`, `FDBRACKET` | small | Installation time-estimate point tables |

Every other named range in the workbook is also exported for completeness — see
`lookup_tables/` for the full set.

---

## 5. Practical build order for the web app

1. Import all `lookup_tables/*.csv` as reference/config data (these rarely
   change — treat like a settings table, not hardcoded logic).
2. Implement `BPLookup` equivalent + the field-code list.
3. Implement Job Sheet's columns in the order above — G, AR, AS, AU, AV, AW, AZ
   are the ones with real conditional logic; everything else is either a
   straight `bpLOOKUP` pull or a simple colour-substitution `IF`.
4. Implement the downstream sheets as pure derivations of Job Sheet's output
   (no new user input needed) — Fabric Cutting, Tube Cutting, Pelmets,
   Assembly(a/b), Bagging.
5. Build Components as SKU-resolution functions per part category, validated
   against `Components_formulas.csv`.
