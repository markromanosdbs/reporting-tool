# Job Sheet Calculation Engine — Data Source & Field Mapping
Companion to `ROLLER_BLINDS_CALCULATION_LOGIC.md` (the formula reference) and
`Roller_Blinds_Calculation_Extract.zip` (lookup tables + literal formula CSVs).
This doc covers the part those two don't: **where the input data actually comes
from at runtime**, confirmed live against BUZ's API for real order 11192.

---

## 1. Confirmed data source: BUZ OData API

Base: `https://api.buzmanager.com/reports/DASON/`

### `SalesOrderOptions` — the per-line option/attribute source
Replaces the spreadsheet's `Data!CE10:CK...` (`CustOrdOpt`) table one-for-one.

**Request:**
```
GET /SalesOrderOptions?$filter=OrderNo eq {orderNo} and OrderRev eq '{rev}'
```
`$filter` must be sent as a query-string parameter, not a header.
**Always filter by both `OrderNo` AND `OrderRev`** — an order can carry multiple
revisions (e.g. an earlier declined/superseded quote for a different product
line), and filtering on `OrderNo` alone returns rows from all of them mixed
together.

**Response shape** (one row per `OrderItemPkId` × `OptionCode`):
```json
{
  "Id": "guid",
  "OrderPkId": "guid",
  "OrderItemPkId": "guid",        // ← the blind's unique line ID — group rows by this
  "OrderNo": 11192,
  "OrderRev": "D",
  "OrderType": "I",
  "OrderDate": "2026-06-04T00:00:00Z",
  "AcceptedDate": "2026-07-01T00:21:05...Z",
  "OrderStatus": "Work in Progress",
  "CustomerPkId": "guid", "CustomerCode": "MCGR.00", "CustomerName": "Mcgrath, Sophie",
  "LineNumber": 1,
  "FixedLine": 11,                // ← matches the spreadsheet's Sticker No.
  "InventoryCode": "ROLLM477T189W96",
  "InventoryDescn": "ROLL Texstyle Metroshade Blockout Whitewash",  // parse like Job Sheet!I11: strip first 5 chars + space
  "InvGrpCode": "ROLL",
  "ItemDescn": "Kitchen",         // → Job Sheet!B (Location)
  "ItemWidth": 1170,              // → Job Sheet!C (Entered Width) — NOT the calculated Blind Width
  "ItemHeight": 2200,             // → Job Sheet!H (Blind Drop)
  "ItemQty": 1,
  "OptionCode": "FIT",            // ← the field code — see mapping table below
  "OptionDescn": "Fit",
  "OptionValue": "Face",          // ← the answer this line has for that field
  "SeqNo": 6,
  "LastEditDate": "..."
}
```

**Ingestion step:** group all rows by `OrderItemPkId`, and fold them into a single
per-line object: `{ [OptionCode]: OptionValue }`, plus `ItemWidth`, `ItemHeight`,
`FixedLine`, `InventoryDescn`, `ItemDescn`. That folded object is the direct
equivalent of one row of the spreadsheet's `Data` tab, and is what every Job
Sheet column function should take as input.

### `ProductsOrdered` — fabric material identity (already confirmed available)
```
GET /ProductsOrdered?$filter=RefNo eq {orderNo}
```
Gives `Material`, `MatlType`, `Colour` for the fabric line — these three
concatenated (`Material + " " + MatlType + " " + Colour`, matching
`Data!BN&" "&BO&" "&BP`) are the lookup key into the `ColourMatch` table for
colour-matched fields (Bracket Colour, Rail Colour, Chain Colour, etc.).

### `InventoryOrderComponentReport` — confirmed NOT usable
Tested empty across a 2-year window with no order restriction. Do not build
against this; it is not populated for this BUZ account (root cause still
unconfirmed — pending BUZ support). The engine must compute Components itself
from the Job Sheet logic, not read a pre-built BOM from BUZ.

---

## 2. `OptionCode` → Job Sheet column mapping (confirmed values in **bold**)

| OptionCode | Job Sheet col | Confirmed on order 11192? |
|---|---|---|
| `SIZE` | E (Sizes) | not yet spot-checked, but present in the 24-row set |
| `FIT` | J (Fit) | **✅ confirmed: "Face"** |
| `FIXING` | K (Fixing) | **✅ confirmed: "Timber"** |
| `SIDEBYSIDE` | F (Additional Deductions) | not yet spot-checked |
| `DUAL` | D (Dual) | **✅ confirmed: "No"** |
| `CONTROLS` | L (Control) | **✅ confirmed: "Chain Winder"** |
| `CONTROLSIDE` | M (Control Side) | **✅ confirmed: "Right"** |
| `MOTOREX` | N (Motor Extras) | not yet spot-checked |
| `REVROLL` | O (Fabric Direction) | **✅ confirmed: "Back"** |
| `CHAIN` | P (Chain) | not yet spot-checked (expect "Nickel Steel Chain") |
| `CHAINLENGTH` | Q (Chain Length) | not yet spot-checked (expect "Default") |
| `CONTROLOPTION` | R (Remote Control) | not yet spot-checked |
| `FINISH` | S (Bottom Trim) | not yet spot-checked (expect "D30 Bottom Rail with Noise Reducing Strip") |
| `RAILCOLOUR` | T (Blind/Rail Finish) | not yet spot-checked (expect "White") |
| `BRACKET` | U (Bracket) | not yet spot-checked (expect "Single with Covers") |
| `BRACKETCOLR` | V (Component Colour) | **✅ confirmed: "Match"** |
| `LINKED` | W (Linked) | **✅ confirmed: "N/A"** |
| `LINKEDSIZE` | X | not present on this order (no linked-over-2700 blinds) |
| `BRAIDCOLOURS` | Z | not present (no braid/fringe on this order) |
| `PELTYPE` | AA (Pelmet or Cassette Type) | not present (no pelmet on this order — expect "None") |
| `PELCOLOUR`/`PELCP` | AB | not present |
| `ADDWIDTH` | AC | not present (defaults to "None") |
| `INSTALLATION` | AJ | not yet spot-checked (expect "Installation") |
| `HANGHEIGHT` | AK | not yet spot-checked (expect "2.1m-2.4m" / "2.4m-2.7m") |
| `INSTALLG` | AL | **✅ confirmed: "Occupied Home"** |
| `TAKEDOWN` | AM | not yet spot-checked (expect "No") |
| `CHECKM` | AN | **✅ confirmed: "No"** |
| `NOTES` | AO | not yet spot-checked |

**Recommendation:** as you build each column function, validate it against the
test fixtures in section 3 below rather than re-querying the API each time —
the fixtures already carry every value the spreadsheet itself computed for this
order, cross-checked field by field against the live API response.

---

## 3. Test fixtures — order 11192, revision D

Four roller blinds, same customer, same fabric, no pelmet, no linking, no
motor. Deliberately includes one narrow blind that lands on a **different tube
size** (Sticker 13 → 43mm, the others → 38mm) so your Tube-selection and
Tube-Length logic gets exercised on both branches. See
`test_fixtures_order_11192.json` alongside this doc for the full machine-readable
version — inputs (as they'd arrive from `SalesOrderOptions`, folded per line)
paired with the exact outputs the spreadsheet's Job Sheet tab produced for each.

Use these as golden-value unit tests: feed the `inputs` object into your column
functions, assert the result equals `expectedOutputs`.
