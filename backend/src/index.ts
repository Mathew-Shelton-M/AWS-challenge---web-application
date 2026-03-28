import express from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import productRoutes from './routes/products';
import alertRoutes from './routes/alerts';
import dashboardRoutes from './routes/dashboard';
import { authenticate } from './middleware/auth';
import { sanitizeBody } from './middleware/sanitize';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(sanitizeBody);

if (process.env.NODE_ENV === 'production') {
  // Redirect HTTP → HTTPS
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });

  // HSTS header
  app.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public routes
app.use('/auth', authRoutes);

// Protected routes (require valid JWT)
import settingsRoutes from './routes/settings';
import reportsRoutes from './routes/reports';
app.use('/categories', authenticate, categoryRoutes);
app.use('/products', authenticate, productRoutes);
app.use('/alerts', authenticate, alertRoutes);
app.use('/dashboard', authenticate, dashboardRoutes);
app.use('/settings', authenticate, settingsRoutes);
app.use('/reports', authenticate, reportsRoutes);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
