import express from 'express';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes.js';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors()); // Keep CORS but rely on API key for security

// Optional: Additional referer checking for extra security
const validateReferer = (req, res, next) => {
  const allowedDomain = process.env.ALLOWED_DOMAIN;
  
  // Skip referer check if no domain is configured
  if (!allowedDomain) {
    return next();
  }
  
  const referer = req.get('Referer') || req.get('Origin');
  
  if (!referer || !referer.startsWith(allowedDomain)) {
    console.log('Access denied:', referer);
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Requests must come from authorized domain'
    });
  }
  
  next();
};

// Routes with authentication
app.use('/api', validateReferer, userRoutes);

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📋 API Key authentication enabled');
});

export default app;