# Architecture Overview

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                       User Browser                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            React Frontend (SPA)                      │   │
│  │  - TanStack Table (100+ columns virtualization)     │   │
│  │  - TanStack Query (server state management)         │   │
│  │  - Excel.JS (export functionality)                  │   │
│  │  - Tailwind CSS (styling)                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP REST API
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Backend                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Express.js Server                                  │   │
│  │  - GET /api/components (paginated data)             │   │
│  │  - GET /api/components/filters (filter options)     │   │
│  │  - CORS middleware                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ↓                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  mssql Connection Pool                              │   │
│  │  - Connection pooling (30+ concurrent)              │   │
│  │  - Connection encryption (TLS 1.2+)                 │   │
│  │  - Timeout handling                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ ODBC/TDS Protocol
┌─────────────────────────────────────────────────────────────┐
│              Azure SQL Server                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ComponentsReport Database                          │   │
│  │  └── door_screen_components table                   │   │
│  │      (60+ columns, 1000s of rows)                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. User Loads Application

```
Browser → Vite Dev Server / Nginx
        → Downloads React App (main.tsx)
        → TanStack Query client initialized
        → Renders App component
```

### 2. Data Fetching

```
React Component (App.tsx)
  ↓
  useQuery hook with query key [filters, page]
  ↓
  axios GET /api/components
  ↓
  Browser proxy (vite.config.ts) or direct to backend
  ↓
  Express route handler (routes/components.ts)
  ↓
  Query builder with filters
  ↓
  mssql pool.request()
  ↓
  SQL Server executes query
  ↓
  Results returned as JSON {data, total, skip, take}
  ↓
  React Query caches result (5 min stale time)
  ↓
  TanStack Table renders rows
```

### 3. Table Rendering

```
DataTable Component
  ↓
  Dynamic column generation from data keys
  ↓
  useReactTable hook initialization
  ↓
  TanStack Table:
    - virtualizeRowsFn / virtualizeColumnsFn
    - Only renders visible cells in viewport
    - Efficiently handles 100+ columns
  ↓
  JSX render:
    <thead> - sticky headers
    <tbody> - virtualized rows
```

### 4. User Filtering

```
FilterPanel Component
  ↓
  User enters search/product/customer
  ↓
  Click "Apply Filters"
  ↓
  onFilterChange callback → App.tsx
  ↓
  setFilters + setPage(0)
  ↓
  Query key changes → useQuery refetches
  ↓
  New API request with filter params
  ↓
  SQL WHERE clause applied
  ↓
  Filtered results returned
  ↓
  Table updated
```

### 5. Export to Excel

```
ExportButton Component
  ↓
  Click "Export to Excel"
  ↓
  ExcelJS workbook created
  ↓
  Headers → first row (bold, dark background)
  ↓
  All data rows added
  ↓
  Columns auto-sized
  ↓
  First row frozen
  ↓
  XLSX file generated in memory
  ↓
  Blob created → download link
  ↓
  Browser downloads: components_report-2026-01-15.xlsx
```

## Backend Architecture

### Request Handling

```
GET /api/components?skip=0&take=100&search=test&product=Doors

↓ Express middleware (CORS, JSON parser)

↓ Route handler (routes/components.ts)

  ↓ Parse query parameters
  ↓ Build SQL WHERE conditions
  ↓ Add OFFSET/FETCH for pagination
  
  ↓ getConnection() from pool
  
  ↓ pool.request()
    .input('search', '%test%')
    .input('product', '%Doors%')
    .query(sql)
  
  ↓ SQL Execution:
    SELECT * FROM door_screen_components
    WHERE Product LIKE @product AND ...
    ORDER BY ID ASC
    OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY
  
  ↓ Results returned as Array of objects

↓ JSON response sent to client

{
  "data": [{...}, {...}],
  "total": 1234,
  "skip": 0,
  "take": 100
}
```

### Connection Management

```
On Server Start:
  connectDB() called
    ↓
    new sql.ConnectionPool(config) created
    ↓
    pool.connect() establishes connection
    ↓
    Pool ready for queries

Per Request:
  getConnection() returns existing pool
    ↓
    If pool not connected, reconnect
    ↓
    Use pool for query execution

On Server Shutdown:
  SIGTERM signal received
    ↓
    closeDB() called
    ↓
    pool.close() gracefully closes all connections
```

## Frontend Architecture

### Component Hierarchy

```
main.tsx
  ↓
  <QueryClientProvider>
    ↓
    <App>
      ├── <FilterPanel>
      │   └── Search, Product, Customer inputs
      │
      └── <DataTable>
          ├── Headers (TanStack Table)
          ├── Rows (virtualized)
          └── <ExportButton>
```

### State Management

#### Global State (React Query)
```
useQuery([
  'components',
  { search: '...', product: '...', customer: '...' },
  page
])
```
- Manages server state (data from API)
- Caching with 5-minute stale time
- Automatic refetch on filter/page change
- Background refetches

#### Local State (React State)

```
App.tsx:
  - filters: {search, product, customer}
  - page: 0

FilterPanel.tsx:
  - search, product, customer (input values)
  - onFilterChange callback
```

## Column Virtualization Strategy

### Problem
Rendering 100+ DOM elements (columns) at once = performance issues

### Solution: TanStack Table Virtualization

```
Column rendering:
  [Col1] [Col2] ... [Col50] [Col51] ... [Col100]
                    ↓ Only visible columns rendered
                 [Col48] [Col49] [Col50] [Col51] [Col52]
                 ↓
                 <td> elements in DOM

Row rendering:
  Row 1, Row 2, Row 3, ..., Row 1000
                ↓ Only visible rows rendered
          Row 45, Row 46, Row 47, Row 48, Row 49
                ↓
                <tr> elements in DOM

Result:
  - 100+ columns, thousands of rows
  - Only ~50 visible cells in DOM at any time
  - Smooth 60fps scrolling
  - Minimal memory footprint
```

## Query Optimization

### Database Indexes

Recommended for common filters:
```sql
CREATE INDEX idx_product ON door_screen_components(Product);
CREATE INDEX idx_customer ON door_screen_components(Customer);
CREATE INDEX idx_quote_ref ON door_screen_components(QuoteRef);
```

### API Pagination

```
Client Pagination (1000 records): User scrolls through pages
Server Pagination (100 records):  OFFSET/FETCH in SQL

┌─────────────────┐
│ Page 1 (100)    │  SELECT * ... OFFSET 0 FETCH 100
├─────────────────┤
│ Page 2 (100)    │  SELECT * ... OFFSET 100 FETCH 100
├─────────────────┤
│ Page 3 (100)    │  SELECT * ... OFFSET 200 FETCH 100
```

## Performance Considerations

### Frontend
- ✅ React Query caching (5 min)
- ✅ TanStack Table virtualization
- ✅ Lazy component loading with React.lazy()
- ✅ Dynamic column generation (no hard-coded columns)
- ⚠️ Limit to 100 records/page for UX

### Backend
- ✅ Connection pooling (mssql default: 30 connections)
- ✅ Query optimization with WHERE/OFFSET
- ✅ Prepared statements (parameterized queries)
- ⚠️ No N+1 queries (single SELECT statement)
- ⚠️ 30-second timeout per request

### Network
- ✅ GZIP compression (nginx/Express)
- ✅ JSON serialization (small payload)
- ✅ Pagination (avoid massive responses)

## Security Architecture

### Frontend Security
- ✅ No credentials stored in code
- ✅ HTTPS in production (nginx TLS)
- ✅ CORS origin validation
- ✅ Input sanitization (React auto-escapes)
- ✅ No sensitive data in localStorage

### Backend Security
- ✅ Environment variables for credentials
- ✅ Parameterized SQL queries (prevent injection)
- ✅ CORS middleware
- ✅ Connection encryption to Azure SQL (TLS)
- ✅ Input validation (whitelist filters)

### Database Security
- ✅ SQL Server authentication with strong passwords
- ✅ Firewall rules (IP whitelist)
- ✅ Encrypted connections (TLS 1.2+)
- ✅ Read-only API user recommended
- ⚠️ Azure AD auth recommended for production

## Deployment Architecture

### Local Development
```
npm run dev (backend)  → http://localhost:3001
npm run dev (frontend) → http://localhost:5173
Vite proxy handles /api → localhost:3001
```

### Docker
```
docker-compose up
├── backend service (Node.js)
├── frontend service (Nginx)
└── shared network (reporting-network)

Frontend (Nginx) ← proxy /api → backend (Node.js)
```

### Production (Azure)
```
┌─────────────────────────────────────┐
│      Azure Container Registry       │
├─────────────────────────────────────┤
│ ├── brax-backend:latest             │
│ └── brax-frontend:latest            │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Azure Container Instances / AppService
├─────────────────────────────────────┤
│ ├── backend container               │
│ └── frontend container (Nginx)      │
│     ├── Port 443 (HTTPS)            │
│     └── Proxy /api → backend        │
└─────────────────────────────────────┘
              ↓
        Azure SQL Server
        (ComponentsReport)
```

## Scaling Strategy

### Horizontal Scaling
- Backend: Stateless Node.js (add multiple containers)
- Frontend: Static Nginx (CDN friendly)
- Load balancer distributes requests

### Vertical Scaling
- Increase SQL connection pool size
- More CPU/RAM for Node.js containers
- Database read replicas for reporting

### Caching Layer
- Redis for query results
- CDN for static frontend assets
- Browser caching (React Query)

---

This architecture supports 100+ columns and thousands of rows efficiently while maintaining type safety, security, and excellent UX.
