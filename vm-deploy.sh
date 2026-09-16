#!/bin/bash
# Backend Deployment Script for VM
# Run this on your Linux VM as the deployment user

set -e  # Exit on error

echo "======================================"
echo "Deploying Reporting Tool Backend"
echo "======================================"

# STEP 1: Install Node.js (if not already installed)
echo -e "\n[1/7] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

# STEP 2: Create deployment directory
echo -e "\n[2/7] Creating deployment directory..."
DEPLOY_DIR="/var/www/reporting-tool-backend"
sudo mkdir -p $DEPLOY_DIR
sudo chown $USER:$USER $DEPLOY_DIR

# STEP 3: Clone or copy backend code
echo -e "\n[3/7] Setting up backend code..."
cd $DEPLOY_DIR

# If git is available, clone from GitHub (if repo is public)
if command -v git &> /dev/null; then
    if [ -d ".git" ]; then
        echo "Updating existing repository..."
        git pull origin main
    else
        echo "Cloning repository..."
        git clone https://github.com/markromanosdbs/reporting-tool.git .
    fi
else
    echo "Git not found. Please manually copy backend files to $DEPLOY_DIR"
    exit 1
fi

# STEP 4: Navigate to backend directory
cd backend

# STEP 5: Install dependencies
echo -e "\n[4/7] Installing Node.js dependencies..."
npm install

# STEP 6: Build TypeScript
echo -e "\n[5/7] Building TypeScript..."
npm run build

# STEP 7: Create .env file with database credentials
echo -e "\n[6/7] Creating environment configuration..."
cat > .env << EOF
DATABASE_HOST=braxserver.database.windows.net
DATABASE_USER=excelreports
DATABASE_PASSWORD=100Balliang!
DATABASE_NAME=ComponentsReport
BRAX_DATABASE_HOST=braxserver.database.windows.net
BRAX_DATABASE_USER=excelreports
BRAX_DATABASE_PASSWORD=100Balliang!
BRAX_DATABASE_NAME=braxreportsDB
NODE_ENV=production
PORT=8080
EOF

echo ".env file created"

# STEP 8: Set up systemd service for auto-restart
echo -e "\n[7/7] Setting up systemd service..."
sudo tee /etc/systemd/system/reporting-tool-backend.service > /dev/null << EOF
[Unit]
Description=Reporting Tool Backend API
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DEPLOY_DIR/backend
Environment="PATH=/usr/bin"
EnvironmentFile=$DEPLOY_DIR/backend/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable reporting-tool-backend.service
sudo systemctl start reporting-tool-backend.service

echo -e "\n✅ Backend deployment complete!"
echo -e "\nService Status:"
sudo systemctl status reporting-tool-backend.service --no-pager

echo -e "\nNext Steps:"
echo "1. Verify backend is running: curl http://localhost:8080/api/tables"
echo "2. Update frontend API URL to: http://23.101.239.68:8080/api"
echo "3. Configure firewall to allow port 8080 (if needed)"
echo "4. View logs: sudo journalctl -u reporting-tool-backend.service -f"
