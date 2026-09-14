# Azure Deployment Setup Guide - Option 1

## Prerequisites
- Azure subscription
- GitHub repository
- Node.js 18+ locally
- Azure CLI installed

## STEP 1: Create Azure Resource Group

```bash
az group create \
  --name reporting-tool-rg \
  --location eastus
```

## STEP 2: Create Key Vault

```bash
az keyvault create \
  --resource-group reporting-tool-rg \
  --name reporting-tool-kv \
  --location eastus
```

Store your database connection strings:

```bash
# For ComponentsReport database
az keyvault secret set \
  --vault-name reporting-tool-kv \
  --name "db-connection-string" \
  --value "Server=<your-server>.database.windows.net;Database=ComponentsReport;User ID=<username>;Password=<password>;"

# For braxreportsDB database
az keyvault secret set \
  --vault-name reporting-tool-kv \
  --name "brax-db-connection-string" \
  --value "Server=<your-brax-server>.database.windows.net;Database=braxreportsDB;User ID=<username>;Password=<password>;"
```

## STEP 3: Create Backend App Service

```bash
# Create App Service Plan
az appservice plan create \
  --name reporting-tool-backend-plan \
  --resource-group reporting-tool-rg \
  --sku B1 \
  --is-linux

# Create App Service
az webapp create \
  --resource-group reporting-tool-rg \
  --plan reporting-tool-backend-plan \
  --name reporting-tool-backend \
  --runtime "NODE|18-lts"

# Enable HTTPS only
az webapp update \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend \
  --set httpsOnly=true

# Configure environment variables
az webapp config appsettings set \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend \
  --settings \
    DATABASE_HOST="<your-server>.database.windows.net" \
    DATABASE_USER="<username>" \
    DATABASE_PASSWORD="<password>" \
    DATABASE_NAME="ComponentsReport" \
    BRAX_DATABASE_HOST="<your-brax-server>.database.windows.net" \
    BRAX_DATABASE_USER="<username>" \
    BRAX_DATABASE_PASSWORD="<password>" \
    BRAX_DATABASE_NAME="braxreportsDB" \
    NODE_ENV="production" \
    PORT="8080"
```

## STEP 4: Create Static Web Apps for Frontend

```bash
# Create Static Web App
az staticwebapp create \
  --name reporting-tool-frontend \
  --resource-group reporting-tool-rg \
  --source https://github.com/<your-username>/<your-repo> \
  --branch main \
  --login-with-github

# This will prompt you to authorize GitHub access and create a workflow
```

Alternatively, you can create it manually via Azure Portal:
1. Go to Azure Portal
2. Create > Static Web App
3. Name: reporting-tool-frontend
4. Region: eastus
5. Link to GitHub repository
6. Build preset: React
7. App location: frontend
8. Output location: dist

## STEP 5: Configure GitHub Secrets

Add these secrets to your GitHub repository (Settings > Secrets and variables > Actions):

```
AZURE_STATIC_WEB_APPS_API_TOKEN
  - Get this from: Azure Portal > Static Web Apps > reporting-tool-frontend > 
    Manage deployment token > Copy

AZURE_APP_SERVICE_PUBLISH_PROFILE
  - Get this from: Azure Portal > App Service > reporting-tool-backend > 
    Download publish profile
```

## STEP 6: Update App Service Configuration for GitHub Actions

Get publish profile:

```bash
az webapp deployment list-publishing-profiles \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend \
  --query "[?publishMethod=='MSDeploy'].xml" \
  --output tsv > profile.xml
```

Copy contents of `profile.xml` to GitHub secret `AZURE_APP_SERVICE_PUBLISH_PROFILE`

## STEP 7: Configure CORS on Backend

```bash
az webapp cors add \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend \
  --allowed-origins https://reporting-tool-frontend.azurestaticapps.net

# For development:
az webapp cors add \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend \
  --allowed-origins http://localhost:5173
```

## STEP 8: Deploy Manually (First Time)

### Frontend:
```bash
cd frontend
npm install
npm run build
# Then push to main branch - GitHub Actions will auto-deploy
```

### Backend:
```bash
cd backend
npm install
npm run build
# Then push to main branch - GitHub Actions will auto-deploy
```

## STEP 9: Verify Deployment

Frontend URL:
```
https://reporting-tool-frontend.azurestaticapps.net
```

Backend API URL:
```
https://reporting-tool-backend.azurewebsites.net/api
```

Test API:
```bash
curl https://reporting-tool-backend.azurewebsites.net/api/tables
```

## STEP 10: Monitor & Troubleshoot

### View Backend Logs:
```bash
az webapp log tail \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend
```

### View Deployment Status:
```bash
az staticwebapp show \
  --name reporting-tool-frontend \
  --resource-group reporting-tool-rg
```

### Check App Service Health:
```bash
az webapp show \
  --resource-group reporting-tool-rg \
  --name reporting-tool-backend
```

## Cost Breakdown (Monthly)

- Frontend (Static Web Apps): ~$0.20 (bandwidth only)
- Backend (App Service B1): ~$15
- Key Vault: ~$0.50
- **Total: ~$15.70/month**

## Clean Up (If Needed)

```bash
az group delete \
  --name reporting-tool-rg \
  --yes --no-wait
```

## Troubleshooting

### Static Web Apps Build Fails
- Check .github/workflows/azure-static-web-apps-*.yml
- Verify `app_location` is correct (frontend)
- Verify `output_location` is correct (dist)

### Backend Deployment Fails
- Check publish profile secret is set correctly
- Verify Node.js version is 18 LTS
- Check connection strings in environment variables

### API Calls Return 500
- Check backend logs: `az webapp log tail`
- Verify database connection strings are correct
- Verify CORS is configured
- Check network connectivity to Azure SQL

### Frontend Can't Reach API
- Verify backend URL in frontend (VITE_API_URL)
- Verify CORS settings on backend
- Check browser console for errors
- Verify backend is deployed and responding

## Next Steps

1. Commit these GitHub Actions workflows to main branch
2. Add GitHub secrets (AZURE_STATIC_WEB_APPS_API_TOKEN, AZURE_APP_SERVICE_PUBLISH_PROFILE)
3. Push code to main - deployments will auto-run
4. Monitor logs and test endpoints
5. Set up custom domain (optional)
6. Configure auto-scaling if needed (future)
