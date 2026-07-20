import { createApp } from './app.js';
import { loadData } from './services/data-loader.service.js';

const PORT = Number(process.env.PORT) || 3000;

try {
  const { universities, campuses } = loadData();
  console.log(`Loaded ${universities.length} universities and ${campuses.length} campuses`);
} catch (err) {
  console.error('Failed to load data:', err instanceof Error ? err.message : err);
  process.exit(1);
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`myuni-api listening on http://localhost:${PORT}`);
  console.log(`Swagger docs at http://localhost:${PORT}/docs`);
});
