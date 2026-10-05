// Точка входа демо-версии: подменяет сервер локальным хранилищем.
import { useLocalBackend } from './transport.js';
import { createDemoStore } from './demo-store.js';
import DATA from './demo-data.js';

useLocalBackend(createDemoStore(DATA).request);
await import('./app.js');
