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

const validateClientDomain = (req, res, next) => {
    const allowedDomains = process.env.NODE_ENV === 'production'
        ? ['qa-jeffery-client']
        : true;

    const clientDomain = req.get('X-Client-Domain');
    
    if (allowedDomains === true) {
        return next(); // Development - allow all
    }
    
    if (!clientDomain || !allowedDomains.includes(clientDomain)) {
        console.log('❌ Access blocked - invalid client domain:', clientDomain);
        return res.status(403).json({ error: 'Access denied' });
    }
    
    console.log('✅ Access granted to:', clientDomain);
    next();
};

const allowedIPs = [
    '67.243.206.244',
    '54.191.253.12'
];

app.use((req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!allowedIPs.includes(clientIP)) {
        console.log(`The ClientIP ${clientIP} is not allowed`)
        return res.status(403).send('Forbidden');
    }
    next();
});

// Routes with authentication
app.use('/api', validateClientDomain, userRoutes);

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
});

export default app;