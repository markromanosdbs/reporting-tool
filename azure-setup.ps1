# Azure Setup Script for Reporting Tool
# Run this in PowerShell as Administrator

Write-Host "Starting Azure setup for reporting-tool..." -ForegroundColor Green

# STEP 1: Create Resource Group
Write-Host "`n[1/7] Creating resource group..." -ForegroundColor Cyan
az group create --name reporting-tool-rg --location eastus

# STEP 2: Create Key Vault
Write-Host "`n[2/7] Creating Key Vault..." -ForegroundColor Cyan
az keyvault create `
  --resource-group reporting-tool-rg `
  --name reporting-tool-kv `
  --location eastus

# STEP 3: Store database secrets in Key Vault
Write-Host "`n[3/7] Storing database connection strings..." -ForegroundColor Cyan
Write-Host "Please enter your ComponentsReport database connection string:"
$dbConnectionString = Read-Host "ComponentsReport connection string"

Write-Host "Please enter your braxreportsDB database connection string:"
$braxDbConnectionString = Read-Host "braxreportsDB connection string"

az keyvault secret set `
  --vault-name reporting-tool-kv `
  --name "db-connection-string" `
  --value $dbConnectionString

az keyvault secret set `
  --vault-name reporting-tool-kv `
  --name "brax-db-connection-string" `
  --value $braxDbConnectionString

# STEP 4: Create App Service Plan
Write-Host "`n[4/7] Creating App Service Plan..." -ForegroundColor Cyan
az appservice plan create `
  --name reporting-tool-backend-plan `
  --resource-group reporting-tool-rg `
  --sku B1 `
  --is-linux

# STEP 5: Create App Service
Write-Host "`n[5/7] Creating App Service..." -ForegroundColor Cyan
az webapp create `
  --resource-group reporting-tool-rg `
  --plan reporting-tool-backend-plan `
  --name reporting-tool-backend `
  --runtime "NODE|18-lts"

# Enable HTTPS only
az webapp update `
  --resource-group reporting-tool-rg `
  --name reporting-tool-backend `
  --set httpsOnly=true

# STEP 6: Configure backend environment variables
Write-Host "`n[6/7] Configuring App Service environment variables..." -ForegroundColor Cyan
Write-Host "Please provide your database credentials:"

$dbHost = Read-Host "Database Host (e.g., server.database.windows.net)"
$dbUser = Read-Host "Database User"
$dbPassword = Read-Host "Database Password" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($dbPassword))

az webapp config appsettings set `
  --resource-group reporting-tool-rg `
  --name reporting-tool-backend `
  --settings `
    DATABASE_HOST=$dbHost `
    DATABASE_USER=$dbUser `
    DATABASE_PASSWORD=$dbPasswordPlain `
    DATABASE_NAME="ComponentsReport" `
    BRAX_DATABASE_HOST=$dbHost `
    BRAX_DATABASE_USER=$dbUser `
    BRAX_DATABASE_PASSWORD=$dbPasswordPlain `
    BRAX_DATABASE_NAME="braxreportsDB" `
    NODE_ENV="production" `
    PORT="8080"

# STEP 7: Configure CORS
Write-Host "`n[7/7] Configuring CORS..." -ForegroundColor Cyan
az webapp cors add `
  --resource-group reporting-tool-rg `
  --name reporting-tool-backend `
  --allowed-origins https://reporting-tool-frontend.azurestaticapps.net

Write-Host "`n✅ Backend setup complete!" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1. Create Static Web App in Azure Portal or using: az staticwebapp create"
Write-Host "2. Add GitHub secrets (AZURE_STATIC_WEB_APPS_API_TOKEN, AZURE_APP_SERVICE_PUBLISH_PROFILE)"
Write-Host "3. Push code to GitHub main branch to trigger deployments"
