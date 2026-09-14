import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB, closeDB } from './db.js';
import componentsRouter from './routes/components.js';
import commentsRouter from './routes/comments.js';

const app = express();
const PORT = process.env.PORT || 3001;

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

// Initialize database and start server
async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ API available at http://localhost:${PORT}/api`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, closing connections...');
      await closeDB();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
