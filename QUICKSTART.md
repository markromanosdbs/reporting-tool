# Quick Start Guide

Get the reporting tool running in 5 minutes.

## Option 1: Local Development (Fastest)

### 1. Backend (Terminal 1)

```bash
cd backend
cp .env.example .env

# Edit .env with your Azure SQL credentials:
# AZURE_SQL_SERVER=braxserver.database.windows.net
# AZURE_SQL_DATABASE=ComponentsReport
# AZURE_SQL_USERNAME=your_username
# AZURE_SQL_PASSWORD=your_password

npm install
npm run dev
```

✓ Backend running on `http://localhost:3001`

### 2. Frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev
```

✓ Frontend running on `http://localhost:5173`

**Open**: `http://localhost:5173` in your browser

---

## Option 2: Docker (Production-like)

### 1. Setup Environment

```bash
cp .env.example .env
# Edit .env with your Azure SQL credentials
```

### 2. Run with Docker Compose

```bash
docker-compose up --build
```

✓ Frontend: `http://localhost`  
✓ Backend: `http://localhost/api`

Stop with: `docker-compose down`

---

## First Run Checklist

- [ ] Backend `.env` has valid Azure SQL credentials
- [ ] Both services are running (Backend on 3001, Frontend on 5173)
- [ ] No connection errors in console
- [ ] Frontend loads at `http://localhost:5173`
- [ ] Can see data in the table
- [ ] Filters work
- [ ] Export to Excel works

---

## Common Issues

### Backend won't connect to Azure SQL

```bash
# Check credentials in backend/.env
# Verify your IP is allowed in Azure SQL firewall
# Test connection string manually
```

### Frontend shows "Cannot GET /"

```bash
# Make sure you're in frontend directory
cd frontend
npm run dev
```

### API calls failing (CORS error)

```bash
# Check backend is running on 3001
# Verify CORS_ORIGIN in backend/.env matches frontend URL
# Default: http://localhost:5173
```

### "Port already in use"

```bash
# Change port in backend/.env (PORT=3002)
# Or kill existing process on that port
```

---

## Next Steps

1. **Customize filters** in `frontend/src/components/FilterPanel.tsx`
2. **Add more columns** - automatically detected from database
3. **Style** - modify Tailwind config in `frontend/tailwind.config.js`
4. **Deploy** - see README.md for Docker/Azure deployment

---

## Need Help?

- Check backend logs: `http://localhost:3001/api/health`
- Check frontend console: DevTools → Console tab
- Read full README.md for detailed configuration

---

Enjoy! 🚀
