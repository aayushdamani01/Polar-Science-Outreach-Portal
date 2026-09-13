import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import contentRoutes from './routes/content.routes.js';
import aiRoutes from './routes/ai.routes.js';
import expeditionRoutes from './routes/expedition.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import alertsRoutes from './routes/alerts.routes.js';
import archiveRoutes from './routes/archive.routes.js';
import usersRoutes from './routes/users.routes.js';
import searchRoutes from './routes/search.routes.js';
import stationRoutes from './routes/stations.routes.js';


dotenv.config();
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'NCPOR Portal API' }));

app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/expeditions', expeditionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/explorer/stations', stationRoutes);



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` NCPOR Portal API running on http://localhost:${PORT}`));
