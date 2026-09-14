# Azure Deployment Checklist - Option 1

## Pre-Deployment

- [ ] Verify local build works: `npm run build` (both frontend and backend)
- [ ] Test locally with npm start
- [ ] Commit all changes to git
- [ ] Create GitHub personal access token (if not already done)
- [ ] Have Azure subscription ready
- [ ] Have database connection strings ready:
  - [ ] ComponentsReport database connection string
  - [ ] braxreportsDB database connection string

## Azure Setup (Run Commands from AZURE_SETUP.md)

- [ ] Create resource group
  ```bash
  az group create --name reporting-tool-rg --location eastus
  ```

- [ ] Create Key Vault
  ```bash
  az keyvault create --resource-group reporting-tool-rg --name reporting-tool-kv --location eastus
  ```

- [ ] Store database secrets in Key Vault
  ```bash
  az keyvault secret set --vault-name reporting-tool-kv --name "db-connection-string" --value "..."
  az keyvault secret set --vault-name reporting-tool-kv --name "brax-db-connection-string" --value "..."
  ```

- [ ] Create Backend App Service
  ```bash
  az appservice plan create --name reporting-tool-backend-plan --resource-group reporting-tool-rg --sku B1 --is-linux
  az webapp create --resource-group reporting-tool-rg --plan reporting-tool-backend-plan --name reporting-tool-backend --runtime "NODE|18-lts"
  ```

- [ ] Configure backend environment variables
  ```bash
  az webapp config appsettings set --resource-group reporting-tool-rg --name reporting-tool-backend --settings DATABASE_HOST=... DATABASE_USER=... etc
  ```

- [ ] Create Static Web App for Frontend
  - [ ] Via Azure Portal or CLI
  - [ ] Link to GitHub repository
  - [ ] Set build preset to React

- [ ] Configure CORS on Backend
  ```bash
  az webapp cors add --resource-group reporting-tool-rg --name reporting-tool-backend --allowed-origins https://reporting-tool-frontend.azurestaticapps.net
  ```

## GitHub Configuration

- [ ] Create GitHub repository (if not already done)
- [ ] Push code to main branch
- [ ] Go to GitHub > Settings > Secrets and variables > Actions

- [ ] Add Secret: AZURE_STATIC_WEB_APPS_API_TOKEN
  - [ ] Get from: Azure Portal > Static Web Apps > reporting-tool-frontend > Manage deployment token > Copy

- [ ] Add Secret: AZURE_APP_SERVICE_PUBLISH_PROFILE
  - [ ] Get publish profile: `az webapp deployment list-publishing-profiles --resource-group reporting-tool-rg --name reporting-tool-backend --query "[?publishMethod=='MSDeploy'].xml" --output tsv > profile.xml`
  - [ ] Copy contents to secret

- [ ] Verify GitHub Actions workflows are in place:
  - [ ] .github/workflows/deploy-frontend.yml
  - [ ] .github/workflows/deploy-backend.yml

## Frontend Configuration

- [ ] staticwebapp.config.json exists in frontend directory
- [ ] Build command in package.json: `npm run build`
- [ ] Output directory is `dist`
- [ ] VITE_API_URL environment variable set to backend API URL

## Backend Configuration

- [ ] Backend builds successfully: `npm run build`
- [ ] TypeScript compiles to dist/
- [ ] package.json has correct start command: `node dist/index.js`
- [ ] Environment variables configured in Azure
- [ ] Database connection strings accessible

## First Deployment

- [ ] Push code to main branch (will trigger GitHub Actions)
- [ ] Monitor Frontend deployment:
  - [ ] Check GitHub Actions status
  - [ ] Check Static Web Apps deployment status in Azure Portal
  
- [ ] Monitor Backend deployment:
  - [ ] Check GitHub Actions status
  - [ ] Verify app is running: `az webapp show --resource-group reporting-tool-rg --name reporting-tool-backend`
  
- [ ] Test endpoints:
  - [ ] Frontend: https://reporting-tool-frontend.azurestaticapps.net
  - [ ] Backend API: https://reporting-tool-backend.azurewebsites.net/api/tables

## Post-Deployment Verification

- [ ] Frontend loads without errors
- [ ] Can navigate to all tabs (Door Screen, Curtain Tracks, External Blinds, etc.)
- [ ] API calls work (check browser Network tab)
- [ ] Curtain Tracks uses dbswip view for job_tracking_action
- [ ] Data loads correctly for all components
- [ ] No 500 errors in API responses
- [ ] No CORS errors in browser console

## Monitoring Setup

- [ ] Enable diagnostic logs on backend:
  ```bash
  az webapp log config --resource-group reporting-tool-rg --name reporting-tool-backend --application-logging filesystem --level information --detailed-error-messages true
  ```

- [ ] View logs:
  ```bash
  az webapp log tail --resource-group reporting-tool-rg --name reporting-tool-backend
  ```

## Troubleshooting Commands

```bash
# Check if backend is running
curl https://reporting-tool-backend.azurewebsites.net/api/tables

# View backend logs
az webapp log tail --resource-group reporting-tool-rg --name reporting-tool-backend

# Check app service status
az webapp show --resource-group reporting-tool-rg --name reporting-tool-backend

# Restart app service
az webapp restart --resource-group reporting-tool-rg --name reporting-tool-backend

# Check connection
az webapp config connection-string list --resource-group reporting-tool-rg --name reporting-tool-backend

# Verify CORS settings
az webapp cors show --resource-group reporting-tool-rg --name reporting-tool-backend
```

## After Successful Deployment

- [ ] Set up custom domain (optional)
- [ ] Configure SSL certificate
- [ ] Set up backup for databases (if not already done)
- [ ] Monitor costs in Azure Portal
- [ ] Set up alerts for high resource usage (optional)
- [ ] Document access procedures for team

## Cost Check

- [ ] Verify total monthly cost is ~$15.70:
  - Static Web Apps (frontend): ~$0.20
  - App Service B1 (backend): ~$15
  - Key Vault: ~$0.50

---

## Quick Reference: GitHub Actions Secrets Needed

| Secret Name | Value | Source |
|---|---|---|
| AZURE_STATIC_WEB_APPS_API_TOKEN | Your token | Azure Portal > Static Web Apps > Manage deployment token |
| AZURE_APP_SERVICE_PUBLISH_PROFILE | Publish profile XML | `az webapp deployment list-publishing-profiles` |

---

## When to Use Each Troubleshooting Step

| Problem | Check |
|---|---|
| Frontend shows blank page | Check browser console, verify API URL |
| Backend returns 500 errors | Check backend logs with `az webapp log tail` |
| Cannot connect to database | Verify connection string in environment variables |
| CORS errors in browser | Run `az webapp cors show` and verify frontend URL is allowed |
| Static Web Apps won't deploy | Check GitHub Actions workflow status and build logs |
| App Service won't deploy | Check publish profile secret is correct |

