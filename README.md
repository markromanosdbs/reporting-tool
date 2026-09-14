# Components Reporting Tool

A modern, full-stack reporting application for viewing and analyzing Door & Screen Components data from Azure SQL Server with support for 100+ columns, filtering, searching, and Excel export.

## Tech Stack

### Backend
- **Node.js** 18+ with Express
- **TypeScript** for type safety
- **mssql** package for Azure SQL Server connection
- **CORS** enabled for frontend communication

### Frontend
- **React** 18 with TypeScript
- **TanStack Table** (React Table) for handling 100+ columns with virtualization
- **TanStack Query** for server state management
- **Tailwind CSS** for styling
- **ExcelJS** for Excel export functionality
- **Vite** for fast development and building

## Features

✅ Display all columns from `door_screen_components` table  
✅ Frozen left columns (Product, Customer, Quote Ref, etc.)  
✅ Horizontal scrolling for right-side data  
✅ Smart filtering (Search, Product, Customer)  
✅ Pagination (100 records per page)  
✅ Excel export with formatting  
✅ Responsive design  
✅ Type-safe across full stack  

## Project Structure

```
reporting-tool/
├── backend/                 # Node.js Express API
│   ├── src/
│   │   ├── index.ts        # Express server setup
│   │   ├── db.ts           # Azure SQL connection
│   │   └── routes/
│   │       └── components.ts # API endpoints
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # React SPA
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css
│   │   └── components/
│   │       ├── DataTable.tsx
│   │       ├── FilterPanel.tsx
│   │       └── ExportButton.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js 18+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- Azure SQL Server credentials
- Git

### Local Development

#### 1. Clone and Setup

```bash
cd reporting-tool
cp .env.example .env
# Edit .env with your Azure SQL credentials
```

#### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with Azure SQL credentials

npm install
npm run dev
```

Backend runs on `http://localhost:3001`

#### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

### Docker Deployment

#### 1. Prepare Environment

```bash
cp .env.example .env
# Edit .env with your Azure SQL credentials
```

#### 2. Build and Run

```bash
docker-compose up --build
```

- Frontend: `http://localhost`
- Backend API: `http://localhost/api`

#### 3. Stop Services

```bash
docker-compose down
```

## API Endpoints

### Get Components Data
```
GET /api/components?skip=0&take=100&search=&product=&customer=
```

Query Parameters:
- `skip` - Offset for pagination (default: 0)
- `take` - Records per page (default: 1000)
- `search` - Search in Product, Customer, QuoteRef
- `product` - Filter by product name
- `customer` - Filter by customer name

Response:
```json
{
  "data": [...],
  "total": 1234,
  "skip": 0,
  "take": 100
}
```

### Get Filter Options
```
GET /api/components/filters
```

Response:
```json
{
  "products": ["Doors", "Screens", ...],
  "customers": ["Customer A", "Customer B", ...]
}
```

## Configuration

### Backend (.env)

```env
PORT=3001
NODE_ENV=development
AZURE_SQL_SERVER=braxserver.database.windows.net
AZURE_SQL_DATABASE=ComponentsReport
AZURE_SQL_USERNAME=your_username
AZURE_SQL_PASSWORD=your_password
CORS_ORIGIN=http://localhost:5173
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_SQL_SERVER` | Azure SQL Server hostname | `braxserver.database.windows.net` |
| `AZURE_SQL_DATABASE` | Database name | `ComponentsReport` |
| `AZURE_SQL_USERNAME` | SQL login username | `admin@braxserver` |
| `AZURE_SQL_PASSWORD` | SQL login password | `YourPassword123!` |
| `PORT` | Backend port | `3001` |
| `NODE_ENV` | Environment | `development` or `production` |
| `CORS_ORIGIN` | Allowed frontend URL | `http://localhost:5173` |

## Development Workflow

### Backend Development

```bash
cd backend
npm run dev          # Watch mode with hot reload
npm run typecheck    # Type checking
npm run build        # Production build
```

### Frontend Development

```bash
cd frontend
npm run dev          # Dev server with hot reload
npm run build        # Production build
npm run preview      # Preview production build
npm run typecheck    # Type checking
```

## Features Explained

### Column Virtualization
TanStack Table dynamically renders only visible columns, handling 100+ columns efficiently without performance degradation.

### Frozen Columns
Left-side columns (Product, Customer, etc.) remain visible while scrolling horizontally through measurement columns.

### Smart Filtering
- **Search**: Quick text search across multiple fields
- **Product Filter**: Filter by product type
- **Customer Filter**: Filter by customer name

### Excel Export
- All visible data exported to .xlsx format
- Header row with bold formatting and dark background
- Auto-sized columns
- Frozen header row for easy scrolling

### Pagination
- 100 records per page (configurable)
- Previous/Next navigation
- Current page indicator

## Troubleshooting

### Backend Issues

**"Failed to connect to Azure SQL Server"**
- Verify credentials in `.env` file
- Check firewall rules allow your IP
- Ensure database name is correct

**"Port 3001 already in use"**
```bash
# Change PORT in .env or kill process on port 3001
# On Windows: netstat -ano | findstr :3001
# On Mac/Linux: lsof -i :3001
```

### Frontend Issues

**"API not responding"**
- Ensure backend is running on `http://localhost:3001`
- Check CORS_ORIGIN in backend .env matches frontend URL
- Verify proxy in `vite.config.ts`

**"Large data export slow**
- Increase timeout in backend `.env`
- Consider paginating export (e.g., max 10,000 rows)

## Performance Optimization

### For Large Datasets

1. **Pagination**: Currently set to 100 rows/page
   - Adjust `pageSize` in `frontend/src/App.tsx`

2. **Column Virtualization**: Automatically optimized
   - TanStack Table only renders visible columns

3. **Database Indexing**: Add indexes to frequently filtered columns
   ```sql
   CREATE INDEX idx_product ON door_screen_components(Product);
   CREATE INDEX idx_customer ON door_screen_components(Customer);
   ```

4. **Connection Pooling**: Already configured in backend

## Deployment

### Azure Container Instances

```bash
# Build and push images
docker build -t brax-backend:latest ./backend
docker build -t brax-frontend:latest ./frontend

# Push to Azure Container Registry
az acr build --registry myregistry --image brax-backend:latest ./backend
az acr build --registry myregistry --image brax-frontend:latest ./frontend
```

### Azure App Service

Use Docker Compose deployment or Azure DevOps pipeline for CI/CD.

## Security Considerations

- ✅ Environment variables for sensitive credentials
- ✅ HTTPS enforced in production (configure in nginx.conf)
- ✅ CORS configured for specific origins
- ✅ Input validation on backend queries
- ✅ Connection encryption to Azure SQL (TLS 1.2+)

**Production Checklist:**
- [ ] Enable HTTPS/TLS in nginx
- [ ] Set strong database passwords
- [ ] Configure firewall rules
- [ ] Enable audit logging on Azure SQL
- [ ] Use Azure AD authentication (recommended for production)
- [ ] Review CORS_ORIGIN settings

## Future Enhancements

- [ ] Azure AD authentication integration
- [ ] Advanced filtering with date ranges
- [ ] Column reordering/customization
- [ ] Saved report templates
- [ ] Real-time data updates with WebSockets
- [ ] PDF export option
- [ ] Chart visualizations (charts.js, recharts)
- [ ] User preferences/settings
- [ ] Multi-sheet Excel export
- [ ] Audit logging

## License

Proprietary - Davidsons Blinds

## Support

Contact: mark@davidsonsblinds.com.au

---

Built with ❤️ using React, TypeScript, and Node.js
