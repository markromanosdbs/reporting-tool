import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import { connectDB, closeDB, getBraxConnection } from './db.js';
import componentsRouter from './routes/components.js';
import commentsRouter from './routes/comments.js';
import calculatorRouter from './routes/calculator.js';
import { warmUpDoorScreenEngines } from './services/jobsheet/DoorScreenJobSheet.js';
import { warmUpDoorScreenPage } from './services/jobsheet/DoorScreenReport.js';
import { warmUpProductPage, productFromEngine } from './services/jobsheet/ProductReport.js';
import { PRODUCTS } from './services/jobsheet/products.js';

const app = express();
const PORT = process.env.PORT || 8443;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api', componentsRouter);
app.use('/api', commentsRouter);
app.use('/api', calculatorRouter);

// Optional memory log (MEMORY_LOG_SECONDS=30): the VM allows the backend 600 MB
const memoryLogSeconds = Number(process.env.MEMORY_LOG_SECONDS) || 0;
if (memoryLogSeconds > 0) {
  let peak = 0;
  const mb = (n: number) => Math.round(n / 1048576);
  setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 1000).unref();
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(`[memory] rss ${mb(m.rss)} MB (peak ${mb(peak)} MB), heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB`);
  }, memoryLogSeconds * 1000).unref();
}

// Initialize database and start server
async function start() {
  try {
    console.log('🚀 Starting server...');
    await connectDB();
    console.log('✓ Database connected, setting up server...');

    // Read SSL certificates
    const certPath = '../cert.pem';
    const keyPath = '../key.pem';

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);
      const httpsServer = https.createServer({ cert, key }, app);

      httpsServer.listen(PORT, () => {
        console.log(`✓ Server running on https://localhost:${PORT}`);
        console.log(`✓ API available at https://localhost:${PORT}/api`);
      });
    } else {
      console.warn('SSL certificates not found, falling back to HTTP');
      app.listen(PORT, () => {
        console.log(`✓ Server running on http://localhost:${PORT}`);
        console.log(`✓ API available at http://localhost:${PORT}/api`);
      });
    }

    // Load the Door Screen job sheet templates now rather than on the first page load
    warmUpDoorScreenEngines()
      .then(() => console.log('✓ Door Screen job sheet templates loaded'))
      .then(async () => warmUpDoorScreenPage(await getBraxConnection()))
      .then(() => console.log('✓ Door Screen jobs calculated'))
      .catch(e => console.error('Door Screen template load failed:', e))
      // then each product calculated from BUZ data whose .env flag is on, one after another
      .then(async () => {
        for (const p of PRODUCTS) {
          if (!productFromEngine(p)) continue;
          try {
            await warmUpProductPage(p, await getBraxConnection());
            console.log(`✓ ${p.label} jobs calculated`);
          } catch (e) {
            console.error(`${p.label} warm-up failed:`, e);
          }
        }
      });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, closing connections...');
      await closeDB();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
