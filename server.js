import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'Tele-Reporting Portal API is running successfully.' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});